import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  adminAuditLogs,
  appScreenshots,
  appVersions,
  apps,
  categories,
  downloadEvents,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listCategories() {
  const db = await getDb();
  return db ? db.select().from(categories).orderBy(asc(categories.name)) : [];
}

export async function listPublishedApps(query = "") {
  const db = await getDb();
  if (!db) return [];
  const normalized = query.trim();
  const where = normalized
    ? and(eq(apps.status, "published"), or(
        like(apps.name, `%${normalized}%`),
        like(apps.packageName, `%${normalized}%`),
        like(apps.developerName, `%${normalized}%`),
        like(apps.shortDescription, `%${normalized}%`),
      ))
    : eq(apps.status, "published");
  return db.select().from(apps).where(where).orderBy(desc(apps.updatedAt));
}

export async function getPublishedAppBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apps).where(and(eq(apps.slug, slug), eq(apps.status, "published"))).limit(1);
  return result[0];
}

export async function getPublishedAppByPackageName(packageName: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apps).where(and(eq(apps.packageName, packageName), eq(apps.status, "published"))).limit(1);
  return result[0];
}

export async function getPublishedVersions(appId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appVersions).where(and(eq(appVersions.appId, appId), eq(appVersions.status, "published"))).orderBy(desc(appVersions.publishedAt), desc(appVersions.versionCode));
}

export async function getPublishedVersion(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appVersions).where(and(eq(appVersions.id, id), eq(appVersions.status, "published"))).limit(1);
  return result[0];
}

export async function getLatestPublishedVersionByPackageName(packageName: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ version: appVersions })
    .from(appVersions)
    .innerJoin(apps, eq(appVersions.appId, apps.id))
    .where(and(eq(apps.packageName, packageName), eq(apps.status, "published"), eq(appVersions.status, "published")))
    .orderBy(desc(appVersions.publishedAt), desc(appVersions.versionCode))
    .limit(1);
  return result[0]?.version;
}

export async function listOwnedApps(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(apps).where(eq(apps.ownerId, ownerId)).orderBy(desc(apps.updatedAt));
}

export async function getOwnedApp(ownerId: number, appId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apps).where(and(eq(apps.id, appId), eq(apps.ownerId, ownerId))).limit(1);
  return result[0];
}

export async function getAppVersions(appId: number, ownerId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = ownerId === undefined
    ? eq(appVersions.appId, appId)
    : and(eq(appVersions.appId, appId), eq(apps.ownerId, ownerId));
  if (ownerId === undefined) {
    return db.select().from(appVersions).where(conditions).orderBy(desc(appVersions.createdAt));
  }
  return db.select({ version: appVersions }).from(appVersions).innerJoin(apps, eq(appVersions.appId, apps.id)).where(conditions).orderBy(desc(appVersions.createdAt)).then(rows => rows.map(row => row.version));
}

export async function getVersionForOwner(ownerId: number, versionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ version: appVersions, app: apps }).from(appVersions).innerJoin(apps, eq(appVersions.appId, apps.id)).where(and(eq(appVersions.id, versionId), eq(apps.ownerId, ownerId))).limit(1);
  return rows[0];
}

export async function createApp(input: typeof apps.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(apps).values(input);
  return Number(result[0].insertId);
}

export async function updateOwnedApp(ownerId: number, appId: number, patch: Partial<typeof apps.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(apps).set({ ...patch, updatedAt: new Date() }).where(and(eq(apps.id, appId), eq(apps.ownerId, ownerId)));
}

export async function createVersion(input: typeof appVersions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(appVersions).values(input);
  return Number(result[0].insertId);
}

export async function updateVersion(id: number, patch: Partial<typeof appVersions.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(appVersions).set(patch).where(eq(appVersions.id, id));
}

export async function listPendingVersions() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ version: appVersions, app: apps }).from(appVersions).innerJoin(apps, eq(appVersions.appId, apps.id)).where(eq(appVersions.status, "pending_review")).orderBy(asc(appVersions.createdAt));
}

export async function getVersionWithApp(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ version: appVersions, app: apps }).from(appVersions).innerJoin(apps, eq(appVersions.appId, apps.id)).where(eq(appVersions.id, id)).limit(1);
  return rows[0];
}

export async function recordDownload(appId: number, versionId: number, status: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(downloadEvents).values({ appId, versionId, status });
}

export async function getAnalytics() {
  const db = await getDb();
  if (!db) return { totalDownloads: 0, publishedApps: 0, pendingReviews: 0, recent: [] as Array<{ appId: number; versionId: number; status: string; createdAt: Date }> };
  const [downloads, published, pending, recent] = await Promise.all([
    db.select({ value: count() }).from(downloadEvents),
    db.select({ value: count() }).from(apps).where(eq(apps.status, "published")),
    db.select({ value: count() }).from(appVersions).where(eq(appVersions.status, "pending_review")),
    db.select().from(downloadEvents).orderBy(desc(downloadEvents.createdAt)).limit(12),
  ]);
  return { totalDownloads: Number(downloads[0]?.value ?? 0), publishedApps: Number(published[0]?.value ?? 0), pendingReviews: Number(pending[0]?.value ?? 0), recent };
}

export async function addAuditLog(input: typeof adminAuditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminAuditLogs).values(input);
}

export async function getScreenshots(appId: number) {
  const db = await getDb();
  return db ? db.select().from(appScreenshots).where(eq(appScreenshots.appId, appId)).orderBy(asc(appScreenshots.sortOrder)) : [];
}

export async function addScreenshot(input: typeof appScreenshots.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(appScreenshots).values(input);
}

export { apps, appVersions, categories, appScreenshots, downloadEvents, adminAuditLogs, users };
