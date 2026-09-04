/**
 * Nombres et années d'album au format de la LANGUE CHOISIE.
 *
 * ## Le défaut
 *
 * `formatNumber` et `formatAlbumYear` figeaient `'fr-FR'` dans `lib/utils.ts`.
 * Un utilisateur en anglais lisait donc `1 234` au lieu de `1,234`, et
 * « 3 sept. 2026 » au lieu de « Sep 3, 2026 » — au milieu d'une interface
 * anglaise. `formatAlbumYear` écrivait en plus « rééd. » en dur, sur chaque
 * carte d'album réédité.
 *
 * `check-i18n.mjs` ne pouvait pas les voir : il cherche du texte français
 * littéral dans les `.svelte`, or la chaîne fautive est un CODE DE LANGUE, et
 * ces deux fonctions vivent dans un `.ts`.
 *
 * ## Pourquoi des stores dérivés, et pas des fonctions pures
 *
 * Même patron que `$t` et que `lib/dates.ts`. Un `get(locale)` à l'intérieur
 * d'une fonction pure figerait le format au premier rendu : la langue
 * changerait partout SAUF sur les nombres et les années, et le défaut serait
 * plus difficile à voir qu'avant. Ici, `{$formatNombre(x)}` se redessine.
 *
 * ## Portée
 *
 * Partagé par le client actuel et le client v2 — 50 appels à `formatNumber`
 * dans 8 fichiers, 12 à `formatAlbumYear` dans 4 (mesure du 04/09/2026).
 * C'est pourquoi la reprise a été traitée à part des six sites de dates du v2 :
 * elle change les séparateurs de milliers dans toute l'application.
 */
import { derived } from 'svelte/store';
import { locale, t } from './i18n';

/** Séparateurs de milliers de la langue courante : `1 234` / `1,234`. */
export const formatNombre = derived(locale, ($l) => (n: number): string => {
  return Number.isFinite(n) ? n.toLocaleString($l) : '';
});

interface AlbumDate {
  year?: number | null;
  original_year?: number | null;
  release_date?: string | null;
  original_date?: string | null;
}

/**
 * L'année d'un album, en montrant l'originale quand elle diffère de l'édition.
 *
 * Rend `« 1975 (rééd. 1994) »` en français, `« 1975 (reissued 1994) »` en
 * anglais. Le gabarit est UNE clé, pas une concaténation : l'ordre des deux
 * dates et la place des parenthèses ne sont pas les mêmes partout.
 */
export const formatAnneeAlbum = derived([locale, t], ([$l, $t]) => (album: AlbumDate): string => {
  const rd = album?.release_date;
  const od = album?.original_date;
  const gabarit = (origine: string, edition: string) =>
    ($t('album.yearReissue' as any) || '{origine} ({edition})')
      .replace('{origine}', origine)
      .replace('{edition}', edition);

  if (rd || od) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString($l, { day: 'numeric', month: 'short', year: 'numeric' });
    if (od && rd && od !== rd) return gabarit(fmt(od), fmt(rd));
    return fmt((od || rd)!);
  }
  const y = album?.year;
  const oy = album?.original_year;
  if (oy && y && oy !== y) return gabarit(String(oy), String(y));
  return String(oy || y || '');
});
