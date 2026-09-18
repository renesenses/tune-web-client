// Bandcamp, lot 3 : les achats en FLAC (`tune-server-rust`, plugin
// `tune-bandcamp`, module `achats.rs`).
//
// Yves, 16/09/2026 : « les albums achetés ne sont pas joués à la résolution
// d'achat mais en mp3/128 ». Bandcamp ne diffuse pas de lossless : il le LIVRE,
// en fichiers, derrière le cookie de session `identity`. Tune fait donc ce
// que fait l'acheteur à la main — descendre le FLAC — puis confie le dossier
// obtenu à l'assistant d'import, qui sait déjà ranger et scanner.
//
// Le cookie est un secret : `POST` l'envoie, `GET` ne dit que « présent ».
//
// Importé via la barrel `lib/api`.

import { BASE, fetchJSON } from './_client';

const EXT = () => `${BASE}/ext/bandcamp/collection`;

/** L'état d'un téléchargement, tel que le greffon le suit. */
export type BandcampEtatTelechargement =
  | { state: 'page' }
  | { state: 'telechargement'; octets: number }
  | { state: 'extraction' }
  | { state: 'termine'; dossier: string; fichiers: number }
  | { state: 'echec'; erreur: string };

export type BandcampTelechargement = {
  /** La clé d'achat (`sale_item` de l'article de collection). */
  sale_item: string;
  artist: string;
  title: string;
} & BandcampEtatTelechargement;

/** Un téléchargement est-il encore en route ? */
export function bandcampTelechargementEnCours(t: BandcampEtatTelechargement): boolean {
  return t.state === 'page' || t.state === 'telechargement' || t.state === 'extraction';
}

export function bandcampSession() {
  return fetchJSON<{ session: boolean }>(`${EXT()}/session`);
}

export function bandcampPoserSession(identity: string) {
  return fetchJSON<{ session: boolean }>(`${EXT()}/session`, {
    method: 'POST',
    body: JSON.stringify({ identity }),
  });
}

export function bandcampOublierSession() {
  return fetchJSON<{ session: boolean }>(`${EXT()}/session`, { method: 'DELETE' });
}

export function bandcampTelechargements() {
  return fetchJSON<{ downloads: BandcampTelechargement[] }>(`${EXT()}/download`);
}

export function bandcampTelecharger(saleItem: string) {
  return fetchJSON<{ download: BandcampTelechargement | null }>(`${EXT()}/download`, {
    method: 'POST',
    body: JSON.stringify({ sale_item: saleItem }),
  });
}
