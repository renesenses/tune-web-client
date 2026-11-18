/**
 * La TAILLE DES POCHETTES de la Bibliothèque — tune-web-client#3189
 * (go de Bertrand du 18/11/2026 ; Lio, fil 2897, et Joaquim Ventura, fil 2900).
 *
 * ## Pas de mécanisme neuf
 *
 * Bertrand : « On le fait déjà sur certains écrans (playlists !) ». C'est le
 * curseur « Taille des vignettes » de la fiche d'une playlist (web#2601,
 * `lib/vuePlaylist`) : on en reprend les BORNES de la vue pochettes
 * (`BORNES_TAILLE.pochettes`, 96 à 320 px au pas de 8), le bornage
 * (`bornerTaille`), le libellé (`v2.pl.thumbSize`, déjà dans les seize
 * langues) et le rangement (`lib/preferencesEcran`, lecture validée).
 *
 * ## Une préférence pour TOUTE la Bibliothèque
 *
 * Comme la playlist, qui retient UNE taille de pochettes pour toutes les
 * playlists (`v2.playlist.taillePochettes`), la Bibliothèque retient UNE
 * taille pour toutes ses grilles — Albums, Artistes, Genres, Années, Labels,
 * Derniers ajouts, Coffrets. Changer d'onglet ne change pas la taille des
 * pochettes : c'est la même famille de vignettes. La clé est propre à l'écran
 * (`lib.…`, comme `lib.display` à côté de `pl.display`) : la place à l'écran
 * d'une grille d'albums n'est pas celle des pistes d'une playlist.
 *
 * ## Rien ne change pour qui n'y touche pas
 *
 * Tant qu'aucun choix n'est retenu, `lireTaillePochettesBibliotheque` rend
 * `null` et l'écran ne pose AUCUNE variable : chaque grille garde son pas
 * d'origine (148 px pour les albums, 150 px pour les Derniers ajouts). Règle de
 * #1650 : rien n'est écrit au montage, seulement sur un geste.
 */
import { lireNombre, ecrireChoix } from './preferencesEcran';
import { BORNES_TAILLE, bornerTaille } from './vuePlaylist';

export const CLE_TAILLE_POCHETTES_BIBLIOTHEQUE = 'lib.taillePochettes';

/** Les bornes du curseur de la playlist ; le repos est le pas d'origine de la grille des albums. */
export const BORNES_POCHETTES_BIBLIOTHEQUE = { ...BORNES_TAILLE.pochettes, defaut: 148 } as const;

/** La taille retenue, bornée ; `null` tant qu'aucun choix n'a été fait. */
export function lireTaillePochettesBibliotheque(): number | null {
  const n = lireNombre(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE);
  return n == null ? null : bornerTaille('pochettes', n);
}

export function ecrireTaillePochettesBibliotheque(n: number): number {
  const v = bornerTaille('pochettes', n);
  ecrireChoix(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE, String(v));
  return v;
}
