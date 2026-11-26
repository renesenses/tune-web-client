/**
 * tune-server-rust#9531 — l'avertissement du cache des pochettes.
 *
 * Le serveur publie dans `GET /system/diagnostics` un bloc `artwork_cache`
 * (`path`, `origin`, `warning: { code, message } | null`). Deux codes sont
 * traduits ici ; un code inconnu garde le message du serveur, pour qu'un
 * avertissement plus récent que l'interface reste visible.
 */
export function messageCachePochettes(
  bloc: unknown,
  t: (cle: string) => string,
): string | null {
  if (!bloc || typeof bloc !== 'object') return null;
  const b = bloc as { path?: unknown; warning?: { code?: unknown; message?: unknown } | null };
  const w = b.warning;
  if (!w || typeof w !== 'object') return null;
  const chemin = typeof b.path === 'string' ? b.path : '';
  const cle =
    w.code === 'artwork_cache_unwritable'
      ? 'diagnostics.artworkCacheUnwritable'
      : w.code === 'artwork_cache_relative_to_working_dir'
        ? 'diagnostics.artworkCacheRelative'
        : null;
  if (cle) return t(cle).replaceAll('{path}', chemin);
  return typeof w.message === 'string' && w.message ? w.message : null;
}
