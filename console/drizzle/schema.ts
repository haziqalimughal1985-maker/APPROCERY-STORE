import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const apps = mysqlTable("apps", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  packageName: varchar("packageName", { length: 255 }).notNull().unique(),
  developerName: varchar("developerName", { length: 160 }).notNull(),
  shortDescription: varchar("shortDescription", { length: 280 }).notNull(),
  fullDescription: text("fullDescription").notNull(),
  categoryId: int("categoryId").references(() => categories.id),
  iconStorageKey: varchar("iconStorageKey", { length: 500 }),
  websiteUrl: varchar("websiteUrl", { length: 500 }),
  supportContact: varchar("supportContact", { length: 320 }),
  status: mysqlEnum("status", ["draft", "published", "unpublished", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ownerIdx: index("apps_owner_idx").on(table.ownerId),
  statusIdx: index("apps_status_idx").on(table.status),
  categoryIdx: index("apps_category_idx").on(table.categoryId),
}));

export const appVersions = mysqlTable("appVersions", {
  id: int("id").autoincrement().primaryKey(),
  appId: int("appId").notNull().references(() => apps.id),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  versionName: varchar("versionName", { length: 80 }).notNull(),
  versionCode: int("versionCode").notNull(),
  storageKey: varchar("storageKey", { length: 500 }),
  fileSize: bigint("fileSize", { mode: "number" }),
  sha256: varchar("sha256", { length: 64 }),
  signingCertificateFingerprint: varchar("signingCertificateFingerprint", { length: 256 }),
  manifestPackageName: varchar("manifestPackageName", { length: 255 }),
  minSdk: int("minSdk"),
  targetSdk: int("targetSdk"),
  changelog: text("changelog"),
  validationPassed: boolean("validationPassed").default(false).notNull(),
  validationMessage: text("validationMessage"),
  status: mysqlEnum("status", ["draft", "uploading", "validating", "pending_review", "published", "rejected", "unpublished", "archived"]).default("draft").notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  appIdx: index("versions_app_idx").on(table.appId),
  statusIdx: index("versions_status_idx").on(table.status),
  versionUnique: uniqueIndex("versions_app_code_unique").on(table.appId, table.versionCode),
}));

export const appScreenshots = mysqlTable("appScreenshots", {
  id: int("id").autoincrement().primaryKey(),
  appId: int("appId").notNull().references(() => apps.id),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ appIdx: index("screenshots_app_idx").on(table.appId) }));

export const downloadEvents = mysqlTable("downloadEvents", {
  id: int("id").autoincrement().primaryKey(),
  appId: int("appId").notNull().references(() => apps.id),
  versionId: int("versionId").notNull().references(() => appVersions.id),
  status: varchar("status", { length: 40 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  appIdx: index("downloads_app_idx").on(table.appId),
  versionIdx: index("downloads_version_idx").on(table.versionId),
}));

export const adminAuditLogs = mysqlTable("adminAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorId: int("actorId").notNull().references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 60 }).notNull(),
  targetId: int("targetId").notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  actorIdx: index("audit_actor_idx").on(table.actorId),
  targetIdx: index("audit_target_idx").on(table.targetType, table.targetId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type App = typeof apps.$inferSelect;
export type AppVersion = typeof appVersions.$inferSelect;
