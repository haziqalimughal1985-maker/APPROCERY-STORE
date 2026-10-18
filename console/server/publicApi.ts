import express, { type Express, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as db from "./db";
import { inspectApk } from "./apkValidation";
import { storageGetSignedUrl, storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const appInput = z.object({
  name: z.string().trim().min(2).max(160),
  packageName: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/),
  developerName: z.string().trim().min(2).max(160),
  shortDescription: z.string().trim().min(10).max(280),
  fullDescription: z.string().trim().min(20).max(20000),
  categoryId: z.number().int().positive().nullable().optional(),
  websiteUrl: z.string().url().max(500).nullable().optional(),
  supportContact: z.string().email().max(320).nullable().optional(),
});

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 170) || `app-${nanoid(8).toLowerCase()}`;
}
function assetUrl(key: string | null) { return key ? `/manus-storage/${key}` : null; }
function jsonError(res: Response, status: number, error: string, details?: unknown) { res.status(status).json({ error, ...(details ? { details } : {}) }); }

async function sendPublishedApk(res: Response, version: typeof db.appVersions.$inferSelect) {
  if (!version.storageKey) return jsonError(res, 404, "Published APK not found");
  try {
    const signedUrl = await storageGetSignedUrl(version.storageKey);
    const upstream = await fetch(signedUrl, { redirect: "follow", headers: { Accept: "application/vnd.android.package-archive, application/octet-stream" } });
    if (!upstream.ok || !upstream.body) {
      await db.recordDownload(version.appId, version.id, `storage_${upstream.status}`);
      return jsonError(res, 502, "Stored APK could not be retrieved");
    }
    const contentLength = version.fileSize && version.fileSize > 0 ? String(version.fileSize) : upstream.headers.get("content-length");
    const headers: Record<string, string> = {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${version.versionName.replace(/[^A-Za-z0-9._-]/g, "_")}.apk"`,
      "X-Checksum-SHA256": version.sha256 ?? "",
      "Cache-Control": "private, max-age=3600",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    await db.recordDownload(version.appId, version.id, "started");
    res.status(200).set(headers);
    const stream = Readable.fromWeb(upstream.body as never);
    stream.on("error", error => {
      console.error("[Download] stream failed", error instanceof Error ? error.message : "unknown");
      if (!res.headersSent) jsonError(res, 502, "APK stream failed");
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    console.error("[Download] failed", error instanceof Error ? error.message : "unknown");
    if (!res.headersSent) jsonError(res, 502, "APK download is temporarily unavailable");
    else res.destroy();
  }
}
async function currentUser(req: Request) { try { return await sdk.authenticateRequest(req); } catch { return null; } }
async function bodyJson(req: Request) { return typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {}); }

export function registerPublicApi(app: Express) {
  app.get("/api/v1/categories", async (_req, res) => res.json(await db.listCategories()));

  const legacyApp = (appRecord: typeof db.apps.$inferSelect, version?: typeof db.appVersions.$inferSelect) => ({
    id: `developer-${appRecord.id}`,
    packageName: appRecord.packageName,
    name: appRecord.name,
    tagline: appRecord.shortDescription,
    description: appRecord.fullDescription,
    iconUrl: assetUrl(appRecord.iconStorageKey),
    screenshots: [],
    category: String(appRecord.categoryId ?? "uncategorized"),
    versionName: version?.versionName ?? "",
    versionCode: version?.versionCode ?? 0,
    developer: { name: appRecord.developerName },
    downloadUrl: `/api/download/apk/${encodeURIComponent(appRecord.packageName)}`,
    provenance: { provider: "approcery_developer_console", providerLabel: "APPROCERY verified publisher", verifiedSource: true, directDownloadAvailable: Boolean(version?.storageKey) },
  });

  app.get("/api/apps/feed", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);
    const published = await db.listPublishedApps(query);
    const apps = await Promise.all(published.slice(0, limit).map(async item => legacyApp(item, (await db.getPublishedVersions(item.id))[0])));
    res.json({ apps, total: published.length, source: "approcery_developer_console" });
  });

  app.get("/api/apps/search", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : typeof req.query.query === "string" ? req.query.query : "";
    const published = await db.listPublishedApps(query);
    const results = await Promise.all(published.map(async item => legacyApp(item, (await db.getPublishedVersions(item.id))[0])));
    res.json({ query, apps: results, results });
  });

  app.get("/api/apps/details/:packageName", async (req, res) => {
    const item = await db.getPublishedAppByPackageName(req.params.packageName);
    if (!item) return jsonError(res, 404, "Published app not found");
    const [version, screenshots] = [(await db.getPublishedVersions(item.id))[0], await db.getScreenshots(item.id)];
    res.json({ ...legacyApp(item, version), screenshots: screenshots.map(screenshot => assetUrl(screenshot.storageKey)).filter(Boolean), changelog: version?.changelog ?? "" });
  });

  app.get("/api/v1/apps", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const apps = await db.listPublishedApps(query);
    res.json({ apps: apps.map(app => ({ ...app, iconUrl: assetUrl(app.iconStorageKey), detailUrl: `/apps/${app.slug}` })) });
  });

  app.get("/api/v1/apps/search", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const apps = await db.listPublishedApps(query);
    res.json({ query, results: apps.map(app => ({ ...app, iconUrl: assetUrl(app.iconStorageKey), detailUrl: `/apps/${app.slug}` })) });
  });

  app.get("/api/v1/apps/:slug", async (req, res) => {
    const app = await db.getPublishedAppBySlug(req.params.slug);
    if (!app) return jsonError(res, 404, "Published app not found");
    const [versions, screenshots] = await Promise.all([db.getPublishedVersions(app.id), db.getScreenshots(app.id)]);
    res.json({ app: { ...app, iconUrl: assetUrl(app.iconStorageKey), screenshots: screenshots.map(item => assetUrl(item.storageKey)).filter(Boolean) }, versions: versions.map(version => ({ ...version, downloadUrl: `/api/v1/versions/${version.id}/download` })) });
  });

  app.get("/api/v1/apps/:slug/versions", async (req, res) => {
    const app = await db.getPublishedAppBySlug(req.params.slug);
    if (!app) return jsonError(res, 404, "Published app not found");
    const versions = await db.getPublishedVersions(app.id);
    res.json({ versions: versions.map(version => ({ ...version, downloadUrl: `/api/v1/versions/${version.id}/download` })) });
  });

  app.get("/api/v1/versions/:id/download", async (req, res) => {
    const versionId = Number(req.params.id);
    if (!Number.isInteger(versionId)) return jsonError(res, 400, "Invalid version id");
    const version = await db.getPublishedVersion(versionId);
    if (!version) return jsonError(res, 404, "Published APK not found");
    return sendPublishedApk(res, version);
  });

  // Compatibility route for older Android builds that still request a package name.
  app.get("/api/download/apk/:packageName", async (req, res) => {
    const packageName = String(req.params.packageName || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) return jsonError(res, 400, "Invalid package name");
    const version = await db.getLatestPublishedVersionByPackageName(packageName);
    if (!version) return jsonError(res, 404, "Published APK not found");
    return sendPublishedApk(res, version);
  });

  app.get("/api/v1/developer/apps", async (req, res) => {
    const user = await currentUser(req);
    if (!user) return jsonError(res, 401, "Authentication required");
    const owned = await db.listOwnedApps(user.id);
    const withVersions = await Promise.all(owned.map(async app => ({ app, versions: await db.getAppVersions(app.id, user.id) })));
    res.json({ apps: withVersions });
  });

  app.post("/api/v1/developer/apps", async (req, res) => {
    const user = await currentUser(req);
    if (!user) return jsonError(res, 401, "Authentication required");
    const parsed = appInput.safeParse(await bodyJson(req));
    if (!parsed.success) return jsonError(res, 400, "Invalid app details", parsed.error.flatten());
    try {
      const input = parsed.data;
      const id = await db.createApp({ ...input, ownerId: user.id, slug: slugify(input.name), status: "draft", categoryId: input.categoryId ?? null, websiteUrl: input.websiteUrl ?? null, supportContact: input.supportContact ?? null });
      res.status(201).json({ id });
    } catch (error) {
      jsonError(res, 409, error instanceof Error && error.message.includes("Duplicate") ? "Package name or app slug already exists" : "Could not create app");
    }
  });

  app.patch("/api/v1/developer/apps/:id", async (req, res) => {
    const user = await currentUser(req);
    if (!user) return jsonError(res, 401, "Authentication required");
    const appId = Number(req.params.id);
    const owner = await db.getOwnedApp(user.id, appId);
    if (!owner) return jsonError(res, 404, "App not found");
    const parsed = appInput.partial().safeParse(await bodyJson(req));
    if (!parsed.success) return jsonError(res, 400, "Invalid app details", parsed.error.flatten());
    await db.updateOwnedApp(user.id, appId, { ...parsed.data, categoryId: parsed.data.categoryId ?? undefined, websiteUrl: parsed.data.websiteUrl ?? undefined, supportContact: parsed.data.supportContact ?? undefined });
    res.json({ ok: true });
  });

  app.post("/api/v1/developer/apps/:id/media", express.raw({ type: () => true, limit: "20mb" }), async (req, res) => {
    const user = await currentUser(req);
    if (!user) return jsonError(res, 401, "Authentication required");
    const appId = Number(req.params.id);
    const owner = await db.getOwnedApp(user.id, appId);
    if (!owner) return jsonError(res, 404, "App not found");
    const kind = String(req.headers["x-media-kind"] ?? "");
    const contentType = String(req.headers["content-type"] ?? "").split(";", 1)[0];
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return jsonError(res, 400, "Media file is empty");
    if (!(["image/png", "image/jpeg", "image/webp"].includes(contentType))) return jsonError(res, 415, "Only PNG, JPEG, and WebP images are supported");
    if (kind !== "icon" && kind !== "screenshot") return jsonError(res, 400, "Media kind must be icon or screenshot");
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    try {
      const stored = await storagePut(`apps/${owner.packageName}/${kind}-${Date.now()}.${extension}`, req.body, contentType);
      if (kind === "icon") await db.updateOwnedApp(user.id, appId, { iconStorageKey: stored.key });
      else await db.addScreenshot({ appId, storageKey: stored.key, sortOrder: Number(req.headers["x-sort-order"] ?? 0) || 0 });
      res.status(201).json({ kind, url: stored.url });
    } catch (error) {
      console.error("[Media upload] failed", error instanceof Error ? error.message : "unknown");
      jsonError(res, 503, "Media storage is unavailable");
    }
  });

  app.post("/api/v1/developer/apps/:id/versions/upload", express.raw({ type: () => true, limit: "256mb" }), async (req, res) => {
    const user = await currentUser(req);
    if (!user) return jsonError(res, 401, "Authentication required");
    const appId = Number(req.params.id);
    const owner = await db.getOwnedApp(user.id, appId);
    if (!owner) return jsonError(res, 404, "App not found");
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buffer.length === 0) return jsonError(res, 400, "APK file is empty");
    const versionName = String(req.headers["x-version-name"] ?? "").trim();
    const versionCode = Number(req.headers["x-version-code"] ?? 0);
    if (!versionName || !Number.isInteger(versionCode) || versionCode < 1) return jsonError(res, 400, "Version name and positive version code are required");
    const result = inspectApk(buffer);
    if (!result.ok || !result.metadata) return jsonError(res, 422, result.message, { validationPassed: false });
    if (result.metadata.packageName !== owner.packageName) return jsonError(res, 422, "APK package name does not match this app listing", { expected: owner.packageName, found: result.metadata.packageName });
    if (result.metadata.versionName && result.metadata.versionName !== versionName) return jsonError(res, 422, `Version name mismatch: enter “${result.metadata.versionName}” exactly as declared in AndroidManifest.xml.`, { field: "versionName", submitted: versionName, manifest: result.metadata.versionName });
    if (result.metadata.versionCode && result.metadata.versionCode !== versionCode) return jsonError(res, 422, `Version code mismatch: enter ${result.metadata.versionCode} exactly as declared in AndroidManifest.xml.`, { field: "versionCode", submitted: versionCode, manifest: result.metadata.versionCode });
    let versionId: number | null = null;
    try {
      versionId = await db.createVersion({ appId, uploadedBy: user.id, versionName, versionCode, fileSize: buffer.length, sha256: result.metadata.sha256, manifestPackageName: result.metadata.packageName, minSdk: result.metadata.minSdk, targetSdk: result.metadata.targetSdk, changelog: String(req.headers["x-changelog"] ?? ""), validationPassed: false, validationMessage: "Upload received; storing APK.", status: "uploading" });
      const stored = await storagePut(`apk/${owner.packageName}/${versionCode}.apk`, buffer, "application/vnd.android.package-archive");
      await db.updateVersion(versionId, { storageKey: stored.key, validationPassed: true, validationMessage: result.message, status: "validating" });
      await db.updateVersion(versionId, { status: "pending_review" });
      res.status(201).json({ id: versionId, status: "pending_review", validation: result.metadata });
    } catch (error) {
      console.error("[Upload] failed", error instanceof Error ? error.message : "unknown");
      if (versionId) await db.updateVersion(versionId, { status: "rejected", validationMessage: "APK storage failed; upload must be retried." });
      jsonError(res, 503, "APK storage is unavailable; the file was not published");
    }
  });

  app.post("/api/v1/developer/versions/:id/submit", async (req, res) => {
    const user = await currentUser(req);
    if (!user) return jsonError(res, 401, "Authentication required");
    const version = await db.getVersionForOwner(user.id, Number(req.params.id));
    if (!version) return jsonError(res, 404, "Release not found");
    if (!version.version.validationPassed || !version.version.storageKey) return jsonError(res, 409, "Release must pass validation and have a stored APK before review");
    await db.updateVersion(version.version.id, { status: "pending_review" });
    res.json({ ok: true, status: "pending_review" });
  });

  app.get("/api/v1/admin/pending", async (req, res) => {
    const user = await currentUser(req);
    if (!user || user.role !== "admin") return jsonError(res, 403, "Administrator permission required");
    res.json({ releases: await db.listPendingVersions() });
  });

  app.get("/api/v1/admin/analytics", async (req, res) => {
    const user = await currentUser(req);
    if (!user || user.role !== "admin") return jsonError(res, 403, "Administrator permission required");
    res.json(await db.getAnalytics());
  });

  app.post("/api/v1/admin/versions/:id/review", async (req, res) => {
    const user = await currentUser(req);
    if (!user || user.role !== "admin") return jsonError(res, 403, "Administrator permission required");
    const versionId = Number(req.params.id);
    const action = String((await bodyJson(req)).action ?? "");
    const release = await db.getVersionWithApp(versionId);
    if (!release) return jsonError(res, 404, "Release not found");
    const allowed = ["publish", "reject", "unpublish", "archive"];
    if (!allowed.includes(action)) return jsonError(res, 400, "Unsupported review action");
    if (action === "publish" && (!release.version.validationPassed || !release.version.storageKey)) return jsonError(res, 409, "Cannot publish a release without passed validation and stored APK");
    const status = action === "publish" ? "published" : action === "reject" ? "rejected" : action === "unpublish" ? "unpublished" : "archived";
    await db.updateVersion(versionId, { status, publishedAt: action === "publish" ? new Date() : null });
    if (action === "publish") await db.updateOwnedApp(release.app.ownerId, release.app.id, { status: "published" });
    if (action === "unpublish" || action === "archive") await db.updateOwnedApp(release.app.ownerId, release.app.id, { status: "unpublished" });
    await db.addAuditLog({ actorId: user.id, action: `release_${action}`, targetType: "version", targetId: versionId, details: JSON.stringify({ appId: release.app.id, packageName: release.app.packageName }) });
    res.json({ ok: true, status });
  });
}
