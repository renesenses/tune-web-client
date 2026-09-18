/**
 * La COPIE LOCALE d'un album de « Ma collection » Bandcamp.
 *
 * Yves (Sevy Tabroc), réunion du 17/09/2026 : « à partir de ma collection,
 * rechercher l'album acheté en local en meilleure résolution, car pour le
 * moment il est en mp3/128 ». Il a acheté ces albums et les a copiés dans sa
 * bibliothèque : Tune a donc le FLAC sur disque, mais « Ma collection » jouait
 * le flux public de Bandcamp, plafonné à mp3-128.
 *
 * Ce module rapproche un article de la collection d'un album de la
 * bibliothèque, pour que la collection joue la copie locale et annonce sa vraie
 * qualité.
 *
 * ## Le rapprochement
 *
 * Même artiste (accents, casse, ponctuation repliés) ET même titre d'édition
 * (`cleEdition`, la clé de la page artiste commune #4330). Une édition
 * différente — « Deluxe », « Live » — n'est donc PAS prise pour l'album
 * acheté.
 *
 * Une seule tolérance, bornée : les annotations de QUALITÉ que l'on trouve
 * dans les titres de fichiers rippés ou téléchargés — « (24bit) »,
 * « [FLAC 24-96] », « (96kHz/24bit) », « (Hi-Res) » — sont retirées du titre
 * LOCAL avant comparaison. Elles ne désignent pas une édition, seulement le
 * format du fichier.
 *
 * Plusieurs copies locales : la meilleure résolution gagne (profondeur ×
 * fréquence), puis la première rencontrée.
 */
import type { Album } from './types';
import { cleEdition } from './discographieCommune';

export interface CopieLocale {
  albumId: number;
  title: string;
  format: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
}

const pli = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Annotations de format dans un titre : (24bit), [FLAC 24-96], (96kHz/24bit), (Hi-Res)… */
const ANNOTATION_QUALITE =
  /[\[(]\s*(?:[^\])]*?\b(?:\d{2}\s*-?\s*bits?|\d{2,3}(?:[.,]\d)?\s*k?hz|flac|alac|wav|aiff|dsd\d*|hi[\s-]?res|lossless|24[\s/-]\d{2,3}|16[\s/-]44(?:[.,]1)?)\b[^\])]*?)\s*[\])]/gi;

export function titreSansAnnotationDeQualite(titre: string | null | undefined): string {
  return (titre ?? '').replace(ANNOTATION_QUALITE, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function cleCollection(artiste: string | null | undefined, titre: string | null | undefined): string {
  return `${pli(artiste)}|${cleEdition(titre)}`;
}

const poids = (c: CopieLocale) => (c.bit_depth ?? 0) * (c.sample_rate ?? 0);

/** L'index des albums de la bibliothèque, par artiste + titre d'édition. */
export function indexerAlbumsLocaux(albums: readonly Album[] | null | undefined): Map<string, CopieLocale> {
  const index = new Map<string, CopieLocale>();
  for (const a of albums ?? []) {
    if (a?.id == null || !a.title) continue;
    const copie: CopieLocale = {
      albumId: a.id,
      title: a.title,
      format: a.format ?? null,
      sample_rate: a.sample_rate ?? null,
      bit_depth: a.bit_depth ?? null,
    };
    const cle = cleCollection(a.artist_name, titreSansAnnotationDeQualite(a.title));
    const deja = index.get(cle);
    if (!deja || poids(copie) > poids(deja)) index.set(cle, copie);
  }
  return index;
}

/** La copie locale d'un article de la collection, ou `null`. */
export function copieLocale(
  article: { artist?: string | null; title?: string | null } | null | undefined,
  index: Map<string, CopieLocale>,
): CopieLocale | null {
  if (!article?.title) return null;
  return index.get(cleCollection(article.artist, article.title)) ?? null;
}
