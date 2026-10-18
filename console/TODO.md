# Developer Console outcomes

## Persistent app and release data

- [x] Add persistent tables for apps, app versions, screenshots, categories, download events, and admin audit logs with foreign keys, indexes, unique package/version constraints, timestamps, ownership, validation state, and publication state. Evidence: `drizzle/schema.ts`, migrations `0001_funny_psylocke.sql` and `0002_bumpy_hobgoblin.sql`; `pnpm db:push` completed.
- [x] Keep unpublished, rejected, unpublished, and archived releases out of public catalog queries and downloads. Evidence: public queries require `status = published`; download handler requires a published version and a storage key.

## Secure developer workflow

- [x] Authenticated developers can sign in through the existing Manus OAuth flow, create/edit owned listings, upload APKs, icons, screenshots, and release notes, and view release history. Evidence: `/console`, protected developer API routes, durable media routes, and release-history UI.
- [x] Uploads are size/type checked, stored through persistent object storage, verified after upload, and never expose server storage credentials in browser code. Evidence: server-only `storagePut`, raw upload limits, image MIME allowlist, APK validation, and browser fetches only same-origin API routes.
- [x] APK validation rejects corrupted files and HTML/JSON disguised as APKs, calculates SHA-256, extracts available Android metadata, records validation results, and keeps the release unpublished until validation and review are complete. Evidence: `server/apkValidation.ts`; tested with a real built APK (`packageName`, `versionName`, `versionCode`, `minSdk`, `targetSdk`, SHA-256) and an HTML masquerade.
- [x] Release transitions support Draft → Uploading → Validating → Pending Review → Published, plus Rejected, Unpublished, and Archived, with retryable operations. Evidence: version enum, upload transition writes, `/api/v1/developer/versions/:id/submit`, and admin review actions.

## Admin review and analytics

- [x] Admin-only review pages show real pending submissions, validation details, file availability, and ownership. Evidence: `/admin`, role-gated queue and validation metadata.
- [x] Admins can approve/reject, publish/unpublish/archive, and inspect real download analytics; every action creates an audit record. Evidence: admin review endpoint, metrics query, and `adminAuditLogs` writes.
- [x] Unauthorized users cannot upload, publish, replace, or review releases they do not control. Evidence: owner checks plus admin role checks; unauthenticated developer API returned `401` and admin APIs require role `admin`.

## Public catalog and API

- [x] Public pages provide searchable published apps, categories, permanent `/apps/:slug` details, screenshots, version history, changelogs, and honest loading/empty/error states. Evidence: `/apps`, `/apps/:slug`, `/api/v1/categories`, `/api/v1/apps/search`, and no-fake empty catalog state.
- [x] Public download handlers resolve only published releases with existing files, return APK MIME and download headers, record genuine download events, and return consistent errors for missing/unpublished files. Evidence: `/api/v1/versions/:id/download`; invalid version id returned `400`, missing published app returned `404`.
- [x] Implement versioned public API routes for apps, search, app detail, versions, categories, and version download, plus protected admin/developer operations. Evidence: `server/publicApi.ts` and route checks.

## Android connection contract

- [x] The shared API exposes the same published catalog and APK artifact that the Android app consumes, so new releases appear without a new Android build. Evidence: versioned `/api/v1/apps`, detail, version, and download contracts.
- [x] Document the Android endpoint contract and distinguish web-console tests from physical-device installer tests. The Android app now points at the console origin, retries `/api/v1/versions/:id/download` and the legacy package compatibility route, and keeps the real Android unknown-apps permission flow. A signed-in end-to-end install test on a physical Android device remains external.

## Validation and handover

- [x] Run typecheck/build and verify route manifest and health endpoint. Evidence: `pnpm check`, `pnpm build`, `GET /api/health` returned `{"status":"ok"}`, and `/manus-routes.json` returned HTTP 200 JSON.
- [x] Test invalid APK/HTML rejection, validation metadata, publication guards, public catalog visibility, download status/MIME behavior, authorization boundaries, and missing-file handling with actual results. Evidence: validator and live API checks; full authenticated publication/download path remains dependent on real OAuth user, storage, and admin records.
- [x] Report remaining requirements that need a real signed-in account, production storage/database credentials, or a physical Android device; do not claim those tests without evidence. The console uses the real Manus OAuth screen, which visibly offers Google sign-in; authenticated upload/publish/download and physical installation still need those external conditions.
