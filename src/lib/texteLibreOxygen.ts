import { fold } from './utils';
import type { Track } from './types';

/**
 * tune-server-rust#5192 — le TEXTE LIBRE d'Oxygen.
 *
 * « Tout le monde n'a pas taggé sa bibliothèque » (fil 1966) : un dossier
 * « Mahler Kondrashin » restait introuvable, parce que ni le serveur ni ce
 * filtre ne regardaient le chemin.
 *
 * Les champs sont, MOT POUR MOT et dans le même ordre, ceux du serveur
 * (`tune-core/src/db/facet_filter.rs`, `CHAMPS_DU_TEXTE_LIBRE`) : le filtre
 * de la fenêtre chargée et celui que le serveur applique à la bibliothèque
 * entière (`GET /library/tracks?q=`) rendent la même liste. Avant #5192, le
 * serveur ne comparait que le titre et l'artiste, et ce filtre quatre champs.
 *
 * `path_terms` — le nom du dernier dossier et celui du fichier sans
 * extension, `_ - .` changés en espaces — est CALCULÉ PAR LE SERVEUR et servi
 * sur chaque piste : le client ne redécoupe pas `file_path`, il n'y a qu'une
 * définition (`full_text_search::termes_de_chemin`). Un serveur plus ancien ne
 * le sert pas : le champ manque, et il ne correspond à rien.
 */
export const CHAMPS_DU_TEXTE_LIBRE = ['title', 'artist_name', 'album_title', 'label', 'path_terms'] as const;

/** La saisie telle que les DEUX côtés la comparent : doubles guillemets ôtés,
 *  espaces de bord retirés (`motif_like` côté serveur), puis casse et accents
 *  repliés. */
export function normaliserTexteLibre(saisie: string): string {
  return fold(saisie.replace(/"/g, '').trim());
}

/** Vrai quand l'un des `CHAMPS_DU_TEXTE_LIBRE` de la piste CONTIENT la saisie
 *  (sous-chaîne littérale : `_` et `%` n'y sont pas des jokers, pas plus que
 *  côté serveur). Une saisie vide laisse tout passer. */
export function pisteRepondAuTexteLibre(piste: Track, saisie: string): boolean {
  const q = normaliserTexteLibre(saisie);
  if (!q) return true;
  const champs = piste as unknown as Record<string, string | null | undefined>;
  return CHAMPS_DU_TEXTE_LIBRE.some((c) => fold(champs[c] ?? '').includes(q));
}
