/**
 * Décide s'il faut remettre à zéro la zone « paroles » de l'écran Lecture en
 * cours pour la piste `idPiste`.
 *
 * ── Pourquoi cette fonction existe ────────────────────────────────────────
 *
 * L'effet de `NowPlaying.svelte` testait uniquement `id !== npLyricsTrackId`.
 * Or `npLyricsTrackId` n'est écrit que par `loadNpLyrics`, appelé SEULEMENT
 * quand le panneau Paroles est ouvert. Panneau fermé — le cas courant — la
 * garde restait donc vraie indéfiniment : à chaque passage de l'effet elle
 * réécrivait `syncedLines = []`, un TABLEAU NEUF, transmis ensuite à un
 * composant enfant. Un effet qui ne converge jamais est exactement ce que
 * Svelte 5 sanctionne par `effect_update_depth_exceeded` — et quand il lève
 * cette erreur, il ARRÊTE son ordonnanceur : l'URL change encore, plus rien
 * ne s'affiche (#2555, trois testeurs, macOS et Linux).
 *
 * ── Le piège à ne pas reproduire ──────────────────────────────────────────
 *
 * Il serait tentant de refermer la garde en posant `npLyricsTrackId = id`
 * quand le panneau est fermé. **Ce serait une régression** : `loadNpLyrics`
 * commence par `if (trackId === npLyricsTrackId) return;`, donc ouvrir le
 * panneau ensuite ne chargerait plus jamais les paroles. D'où un témoin
 * SÉPARÉ, qui dit « la zone a été remise à zéro pour cette piste » sans rien
 * affirmer sur ce qui a été chargé.
 */
export function doitReinitialiserLesParoles(
  idPiste: number | null,
  idCharge: number | null,
  idDejaReinitialise: number | null,
): boolean {
  if (idPiste == null) return false;
  if (idPiste === idCharge) return false;
  return idPiste !== idDejaReinitialise;
}
