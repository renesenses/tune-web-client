/**
 * Les sept préréglages d'égaliseur, définis UNE FOIS — #532.
 *
 * # Le défaut
 *
 * Le panneau « Égaliseur » de l'écran « En écoute » envoyait un NOM :
 *
 * ```ts
 * export function setEqualizer(zoneId: number, preset: string) {
 *   return fetchJSON(`${BASE}/zones/${zoneId}/eq`,
 *     { method: 'POST', body: JSON.stringify({ preset }) });
 * }
 * ```
 *
 * Ce que le serveur en fait a changé pendant l'été, et il faut lire les deux
 * états pour comprendre pourquoi envoyer un nom ne peut pas être la réponse :
 *
 * - **Avant** `tune-core/src/audio/eq_presets.rs` : `set_eq` n'appliquait que
 *   `bands` et `enabled`. `body.preset` était seulement RECOPIÉ dans la
 *   réponse (`"preset": body.preset.unwrap_or_else(|| "custom".into())`).
 *   Cliquer « Bass Boost » écrivait le profil inchangé, répondait 200 avec
 *   `"preset":"bass_boost"`, et n'altérait aucune bande — donc aucun son.
 * - **Depuis** : `set_eq` résout le nom par `eq_presets::bandes(nom)`
 *   (`tune-server/src/routes/playback.rs:2423`) et refuse en **400** un nom
 *   qu'il ne connaît pas.
 *
 * Or le panneau envoyait `vocal`, qui ne figure dans AUCUN des deux états :
 * les sept noms connus du serveur sont `flat`, `bass_boost`, `treble_boost`,
 * **`loudness`**, `rock`, `jazz`, `classical` (`eq_presets.rs`, `PREREGLAGES`).
 * « Vocal » était donc inerte sur un vieux serveur et refusé par un neuf.
 *
 * # Pourquoi on envoie des BANDES, et pas le nom
 *
 * `prereglage_a_appliquer` (`playback.rs:2346`) tranche ainsi :
 *
 * ```rust
 * preset.filter(|nom| !bandes_fournies && *nom != "custom")
 * ```
 *
 * Les bandes explicites sont donc PRIORITAIRES, sur toutes les versions. Un
 * panneau qui envoie des bandes agit sur un serveur récent comme sur un
 * ancien ; un panneau qui envoie un nom ne fait rien sur l'ancien. C'est déjà
 * le chemin de l'écran Égaliseur complet (`EqualizerView.svelte`,
 * `sendToServer` → `api.setEq`), le seul qui ait jamais fonctionné.
 *
 * # Pourquoi la table vit ici
 *
 * Elle vivait en dur dans `EqualizerView.svelte`, et le panneau en tenait une
 * seconde, réduite aux libellés — d'où le `vocal` qui n'existait nulle part
 * ailleurs. Une seule table, deux lecteurs.
 *
 * Les valeurs sont inchangées : ce sont celles que les auditeurs connaissent,
 * et ce correctif rend les préréglages AGISSANTS, il ne doit pas en changer le
 * son. Elles sont identiques, gain pour gain, à celles que le serveur porte
 * désormais dans `eq_presets.rs` — vérifié par la garde
 * `src/lib/__tests__/eqPrereglages.test.ts`.
 */
import type { EqBand } from './api';
import { ISO_OCTAVE_HZ } from './spectrumScale';

/**
 * La grille des préréglages : l'octave ISO, dix bandes.
 *
 * Partagée avec l'analyseur de spectre et le mode Expert à dix bandes ; c'est
 * aussi `GRILLE_10` côté serveur, aux mêmes fréquences.
 */
export const GRILLE_PREREGLAGES: readonly number[] = ISO_OCTAVE_HZ;

/** Le Q de cette grille — une octave. `Q_GRILLE_10` côté serveur. */
export const Q_PREREGLAGES = 1.0;

/** Un préréglage : sa clé de protocole, son libellé, sa courbe. */
export interface Prereglage {
  /** Le nom que le serveur connaît (`eq_presets::noms()`). */
  cle: string;
  /** Le libellé montré à l'écran. Nom propre, identique dans toutes les langues. */
  label: string;
  /** Dix gains en dB, un par bande de [`GRILLE_PREREGLAGES`]. */
  gains: readonly number[];
}

/** Les sept préréglages, dans l'ordre où les deux écrans les affichent. */
export const PREREGLAGES_EQ: readonly Prereglage[] = [
  { cle: 'flat', label: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cle: 'bass_boost', label: 'Bass Boost', gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { cle: 'treble_boost', label: 'Treble Boost', gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8] },
  { cle: 'loudness', label: 'Loudness', gains: [6, 4, 0, -2, -1, 0, 2, 4, 5, 6] },
  { cle: 'rock', label: 'Rock', gains: [5, 3, 0, -2, -1, 2, 4, 5, 5, 4] },
  { cle: 'jazz', label: 'Jazz', gains: [3, 2, 0, 2, -1, -1, 0, 2, 4, 5] },
  { cle: 'classical', label: 'Classical', gains: [0, 0, 0, 0, 0, 0, -2, -3, -2, -1] },
];

/** Le préréglage de cette clé, ou `undefined`. */
export function prereglage(cle: string): Prereglage | undefined {
  return PREREGLAGES_EQ.find((p) => p.cle === cle);
}

/** Le libellé d'une clé, ou la clé elle-même si elle est inconnue. */
export function libellePrereglage(cle: string): string {
  return prereglage(cle)?.label ?? cle;
}

/**
 * Les bandes d'un préréglage, prêtes pour `POST /zones/{id}/eq`.
 *
 * Rend `null` sur un nom inconnu — et ce `null` compte : l'appelant doit
 * refuser plutôt que d'envoyer une courbe vide, ce qui remettrait
 * l'égaliseur à plat en croyant appliquer un préréglage.
 *
 * Aucun `channel` : un préréglage graphique ne vise aucun canal en
 * particulier, et en nommer un ferait taire l'autre.
 */
export function bandesDuPrereglage(cle: string): EqBand[] | null {
  const p = prereglage(cle);
  if (!p) return null;
  return GRILLE_PREREGLAGES.map((freq, i) => ({
    freq,
    gain: p.gains[i] ?? 0,
    q: Q_PREREGLAGES,
  }));
}

/**
 * La clé du préréglage dont la courbe est exactement celle-ci, ou `null`.
 *
 * Sert à NOMMER ce que la zone joue déjà : le serveur ne mémorise pas quel
 * préréglage a produit un profil, il ne garde que les bandes. Comparer les
 * gains est la seule façon honnête de retrouver un nom — et rendre `null`
 * quand rien ne correspond évite d'en inventer un.
 */
export function prereglageDesBandes(bandes: readonly EqBand[] | null | undefined): string | null {
  if (!Array.isArray(bandes) || bandes.length !== GRILLE_PREREGLAGES.length) return null;
  // Une courbe posée sur d'autres fréquences n'est pas un préréglage, même si
  // ses gains coïncident : ce n'est pas la même correction.
  if (!bandes.every((b, i) => b.freq === GRILLE_PREREGLAGES[i])) return null;
  // Un préréglage graphique ne vise aucun canal ; une courbe par canal, si.
  if (bandes.some((b) => b.channel != null)) return null;
  for (const p of PREREGLAGES_EQ) {
    if (p.gains.every((g, i) => g === (bandes[i].gain ?? 0))) return p.cle;
  }
  return null;
}
