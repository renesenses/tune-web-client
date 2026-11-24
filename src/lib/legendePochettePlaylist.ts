/**
 * Légende d'une pochette dans la vue EN POCHETTES d'une playlist.
 *
 * Fil forum 2941 (Régis), go de Bertrand du 19/11/2026 (rc13) : un clic sur la
 * pochette ouvre l'ALBUM, la légende doit donc nommer l'album — en gras — puis
 * celui qui le signe : l'artiste de l'album, ou le COMPOSITEUR quand il est
 * renseigné et que l'album est du classique (une œuvre). Le nom de la piste
 * n'y figure plus. La vue en liste et l'ordre ne changent pas.
 *
 * Une ligne sans album (radio, titre isolé) garde son propre nom : sans lui
 * la carte resterait muette.
 */
import type { Track } from './types';
import { estLigneRadio } from './lignePlaylistRadio';

type PisteLegende = Pick<Track, 'title' | 'album_title' | 'album_artist' | 'artist_name' | 'composer' | 'genre' | 'work'>
  & { genres?: string | null; radio?: boolean; source?: Track['source'] };

/*
 * Le genre « classique » tel que les balises et les services l'écrivent, en
 * plusieurs langues. Mots entiers : « Classic Rock » n'en est pas.
 */
const GENRE_CLASSIQUE = /(^|[^\p{L}])(classical|classique|klassik|klassisch|cl[aá]sica|cl[aá]ssica|classica|klassiek|klasyczna|baroque|barock|barroco|op[ée]ra|lirica|symphon\p{L}*|chamber music|musique de chambre)([^\p{L}]|$)/iu;

/** L'album est du classique : son genre le dit, ou la piste nomme une œuvre. */
export function estAlbumClassique(p: PisteLegende): boolean {
  if ((p.work ?? '').trim()) return true;
  return [p.genre, p.genres].some((g) => !!g && GENRE_CLASSIQUE.test(g));
}

export interface LegendePochette {
  /** Le nom de l'album (à défaut, de la ligne). */
  titre: string;
  /** Le compositeur (classique) ou l'artiste de l'album ; vide si inconnu. */
  signataire: string;
  /** `titre — signataire`, pour l'`aria-label` de la pochette. */
  libelle: string;
}

export function legendePochette(p: PisteLegende): LegendePochette {
  const album = !estLigneRadio(p as any) ? (p.album_title ?? '').trim() : '';
  const titre = album || (p.title ?? '').trim();
  const compositeur = (p.composer ?? '').trim();
  const artiste = (p.album_artist ?? '').trim() || (p.artist_name ?? '').trim();
  const signataire = album && compositeur && estAlbumClassique(p) ? compositeur : artiste;
  const libelle = [titre, signataire].filter(Boolean).join(' — ');
  return { titre, signataire, libelle };
}
