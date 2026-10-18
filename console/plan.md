# APK Store Developer Console — implementation plan

## Scope

Build a separate, real web console for the existing APK Store. The console has two connected surfaces:

1. **Developer Console** at `/console` for authenticated publishers to create app listings, upload APK releases and media, validate release metadata, submit releases, and inspect their own apps and release history.
2. **Operations/Admin Console** at `/admin` for authorized administrators to review submissions, publish/unpublish/archive releases, inspect validation results, and view real download analytics.

The public catalog is served by the same application at `/apps`, `/apps/:slug`, and versioned API routes. Public downloads resolve only to published releases with a stored file and create a genuine download event.

## Implementation approach

- **Frontend:** React, Wouter, Tailwind, and the existing component library. The UI uses real tRPC queries/mutations and shows honest empty/loading/error states. No seeded fake app listings or fake analytics.
- **Authentication:** Preserve the starter's Manus OAuth and `webdev_app_session` cookie. The server resolves the authenticated user from the existing context; developer routes require login, and admin operations require `role = admin`.
- **Persistence:** Extend the existing Drizzle MySQL schema with apps, versions, screenshots, categories, download events, and audit logs. Add ownership fields and validation fields so unpublished releases remain private and every state change is traceable.
- **Storage:** Use the existing server-only `storagePut` helper for APKs, icons, and screenshots. Store only stable `/manus-storage/...` keys in the database; never expose the storage credential to the browser.
- **APK validation:** Accept only APK extensions and Android APK ZIP signatures, reject HTML/JSON masquerading as APKs, compute SHA-256 from the uploaded bytes, inspect `AndroidManifest.xml` when available, and persist the validation result. A release cannot be published unless validation is passed and the stored file metadata is present.
- **API:** Add public routes for catalog/search/detail/versions/download and protected tRPC procedures for developer CRUD, upload finalization/validation, submission, admin review, publication, and analytics. The download handler checks status and storage key before returning `application/vnd.android.package-archive`.
- **Upload flow:** Browser posts the APK to the trusted server endpoint. The server validates the authenticated owner, size/type, uploads to persistent storage, calculates checksum/metadata, and creates an unpublished release. The UI keeps the release in `validating`/`pending_review` until a user explicitly submits it.
- **Android compatibility:** Use the same `/api/v1/apps`, detail, version, and download contracts from the console so the Android app can replace its current feed and broken download source without another console-side data model.

## Project structure

- `client/src/pages/` — public catalog, developer console, admin console, and release detail views.
- `client/src/components/` — shared shell, status badges, upload panels, and data cards.
- `client/src/lib/` — tRPC client and formatting helpers.
- `server/routers.ts` — authenticated and public application procedures.
- `server/publicApi.ts` — versioned REST catalog/download handlers.
- `server/apkValidation.ts` — APK signature, ZIP, checksum, and manifest inspection.
- `server/db.ts` — typed data access and ownership/status queries.
- `server/storage.ts` — existing durable object storage adapter.
- `drizzle/schema.ts` and `drizzle/` — application tables and migration.
- `client/public/manus-routes.json` — complete page-route manifest served by Vite in preview and production.

## Design direction

Three possible movements considered:

- **Precision Console (0.08):** restrained navy, cloud-white, and cyan with dense information hierarchy for shipping software safely.
- **Warm Workshop (0.06):** parchment, clay, and green with a more editorial publishing feel.
- **Terminal Luxe (0.04):** near-black, electric lime, and mono type for a hacker-tool aesthetic.

**Chosen: Precision Console.**

- **Core principles:** calm operational clarity; trust through visible provenance; fast scanning; progressive disclosure for complex release details.
- **Color philosophy:** deep ink and slate anchor the product like a control room; cyan marks active system state; mint denotes verified assets; amber/red are reserved for review risk and blockers.
- **Layout paradigm:** a persistent left rail and offset content canvas, with a wide “release runway” timeline rather than centered dashboard cards.
- **Signature elements:** small uppercase section labels, cyan hairline dividers, and release-status pills that read like CI/CD state markers.
- **Interaction philosophy:** every destructive or publishing action is explicit and contextual; uploads show actual transfer and validation stages; empty states teach the next real action.
- **Animation:** short 150–220ms ease-out transitions for panels and status changes; no decorative looping motion; progress only reflects actual upload/validation state.
- **Typography:** Geist/Inter-style sans for UI, with a compact mono face for package names, version codes, hashes, and API paths.
- **Brand essence:** “The accountable shipping desk for Android publishers.” Personality: precise, calm, credible.
- **Brand voice:** “Ship the artifact you can verify.” / “Published means available, attributable, and downloadable.”
- **Wordmark:** a two-line APK monogram inside a clipped cyan square, paired with a compact wordmark.
- **Signature brand color:** `#20D3C5` cyan-mint, used sparingly for verified state and primary actions.

## Constraints and honest boundaries

The project must not claim malware scanning, signature verification, or physical storage deletion unless a real tool/capability performs those actions. Admin login, persistent database/storage provisioning, and Android end-to-end installation still require the project environment and an actual device; the final report will distinguish completed checks from deployment/device checks.
