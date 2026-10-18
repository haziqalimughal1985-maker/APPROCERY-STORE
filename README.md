# APPROCERY STORE

APPROCERY Store platform source: separate Developer Console, public catalog/backend, and original Android app wrapper.

## Source

- `console/`: authenticated Google-capable Manus OAuth, database-backed developer accounts, APK/media storage, APK validation, SHA-256, moderation, public search/catalog, published download routes, and legacy APPROCERY compatibility routes.
- `android/`: original APPROCERY Store Android wrapper with unknown-app installation permission, native installer bridge, and APK retry/response validation.

## API contract

Canonical public routes are `/api/v1/apps`, `/api/v1/apps/search`, `/api/v1/apps/:slug`, and `/api/v1/versions/:id/download`.
Legacy APPROCERY-compatible routes are `/api/apps/feed`, `/api/apps/search`, `/api/apps/details/:packageName`, and `/api/download/apk/:packageName`.

Only published releases with stored APK files are exposed. Unpublished or rejected releases remain private.

## Deployment requirement

The original `approcery-store.ai.studio` domain must be routed to the `console/` backend (or configured with a reverse proxy) for Developer Console releases to appear in the original APPROCERY website and for the legacy APK route to serve real files. The Android source remains pointed at the original domain.

Never commit `.env`, OAuth secrets, storage credentials, or database credentials.
