/**
 * Canonical `X-Profile-Id` header for every API request.
 *
 * Single source of truth for "who is acting": the active profile id persisted
 * by the profile store in `localStorage['tune-profile-id']`. Spread into every
 * request header (the `api.ts` helpers and `api/_client.ts`) so the server's
 * `ActiveProfile` extractor scopes favorites / notes / playlists to the caller's
 * profile instead of falling back to the global default — the whole point of
 * making the active profile per-device rather than a shared server setting.
 *
 * Reads `localStorage` directly (no store import) to stay free of import cycles,
 * matching the pre-existing `displayFields.ts` helper it replaces.
 *
 * NB: view-scope endpoints (dashboard, history stats) deliberately IGNORE this
 * header and take an explicit `?profile_id=` query param — sending the header
 * everywhere must not flip their default from "household total" to per-profile.
 * See the server's `ActiveProfile` convention doc.
 */
export function profileHeader(): Record<string, string> {
  try {
    const id = localStorage.getItem('tune-profile-id');
    if (id) return { 'X-Profile-Id': id };
  } catch {
    /* localStorage unavailable (SSR / private mode) — no header */
  }
  return {};
}
