/**
 * « Bit-perfect strict » et conversion de fréquence — renesenses/tune-server-rust#3973.
 *
 * En mode PURE, quand la fréquence de la source dépasse ce que le périphérique
 * accepte, Tune rééchantillonnait EN SILENCE. Décision de Bertrand (option 3) :
 *
 *   1. par défaut, il joue ET le dit — le chemin du signal affiche la
 *      conversion et marque la lecture non bit-perfect (PURE dégradé) ;
 *   2. « Bit-perfect strict », par zone, désactivé par défaut : actif, Tune
 *      REFUSE la lecture et dit pourquoi.
 *
 * Ce module porte les deux phrases que l'interface construit elle-même à
 * partir des champs du serveur. Le serveur envoie bien une phrase, mais :
 *   - sur le WebSocket, elle est en FRANÇAIS quelle que soit la langue de
 *     l'interface (pas d'`Accept-Language` sur un événement poussé) ;
 *   - sur le 422 du POST, elle suit l'`Accept-Language` — mais une seule table
 *     de phrases, côté client, garantit que le toast et le bandeau disent la
 *     même chose par les deux chemins.
 * On construit donc depuis `code` + fréquences, et on retombe sur le texte du
 * serveur quand le code est inconnu ou que les fréquences manquent.
 */
import { get } from 'svelte/store';
import { locale, t } from './i18n';

/** Le code stable du refus, identique sur le 422 et sur `zone.playback_error`. */
export const CODE_REFUS_BITPERFECT = 'bitperfect_strict_refused';

/**
 * Une fréquence en kHz, décimale seulement si elle n'est pas entière :
 * 192000 → « 192 », 44100 → « 44,1 » (fr) / « 44.1 » (en), 22050 → « 22,05 ».
 * Sans séparateur de milliers : « 2822,4 » et non « 2 822,4 ».
 */
export function frequenceKhz(hz: number, loc: string = langue()): string {
  try {
    return new Intl.NumberFormat(loc, { maximumFractionDigits: 2, useGrouping: false }).format(hz / 1000);
  } catch {
    return String(Math.round(hz / 10) / 100);
  }
}

function langue(): string {
  try {
    return get(locale);
  } catch {
    return 'fr';
  }
}

function hzValide(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Ce que portent le corps du 422 et l'événement WebSocket. */
export interface RefusBitperfect {
  code?: unknown;
  requested_hz?: unknown;
  device_hz?: unknown;
}

/**
 * La phrase localisée du refus, ou `null` si ce n'est pas ce refus-là (ou si
 * le serveur n'a pas donné les deux fréquences) : l'appelant garde alors son
 * chemin habituel, texte du serveur compris.
 */
export function messageRefusBitperfect(
  d: RefusBitperfect | null | undefined,
  tr: (cle: string) => string = get(t),
  loc: string = langue(),
): string | null {
  if (!d || d.code !== CODE_REFUS_BITPERFECT) return null;
  const demande = hzValide(d.requested_hz);
  const sortie = hzValide(d.device_hz);
  if (demande == null || sortie == null) return null;
  return tr('bitperfect.refused')
    .replace('{requested}', frequenceKhz(demande, loc))
    .replace('{device}', frequenceKhz(sortie, loc));
}

/** Les champs de #3973 dans `signal_path` — tous absents sur un vieux serveur. */
export interface SignalPathConversion {
  pure?: boolean;
  pure_degraded?: boolean;
  rate_conversion?: { from_hz?: unknown; to_hz?: unknown } | null;
}

/**
 * « PURE dégradé — 192 → 96 kHz, pas bit-perfect » quand PURE est actif mais
 * que la fréquence est convertie ; « 192 → 96 kHz, pas bit-perfect » pour une
 * conversion hors PURE ; `null` sans conversion publiée (vieux serveur
 * compris) : l'affichage ne change pas.
 */
export function libelleConversion(
  sp: SignalPathConversion | null | undefined,
  tr: (cle: string) => string = get(t),
  loc: string = langue(),
): string | null {
  const rc = sp?.rate_conversion;
  if (!rc) return null;
  const de = hzValide(rc.from_hz);
  const vers = hzValide(rc.to_hz);
  if (de == null || vers == null) return null;
  const cle = sp?.pure_degraded ? 'bitperfect.pureDegraded' : 'bitperfect.rateConversion';
  return tr(cle).replace('{from}', frequenceKhz(de, loc)).replace('{to}', frequenceKhz(vers, loc));
}
