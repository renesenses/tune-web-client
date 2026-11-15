/**
 * web#2387 — le refus qui ferme VRAIMENT l'égaliseur de l'écran de lecture.
 *
 * `POST /zones/{id}/eq` passe par `premium_audio_plugins::require_installed`
 * (tune-server-rust, `routes/playback.rs` `set_eq`) : greffon `equalizer`
 * absent, désactivé ou non chargé → `409 { error: "plugin_unavailable" }`,
 * rangé par `apiError` dans `status` / `code`.
 */
export function estGreffonEqAbsent(e: unknown): boolean {
  return (e as { code?: string } | null | undefined)?.code === 'plugin_unavailable';
}
