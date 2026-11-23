// @vitest-environment jsdom
//
// web#3333 / tune-server-rust#9362 (fil forum 3000, Régis ; accord de Bertrand
// du 22/11/2026, rc15) : chaque playlist garde SON tri, et trois critères de
// plus — compositeur, date d'ajout à la playlist, fréquence d'échantillonnage.
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : `criteresDisponibles` qui rend toujours
// `CLES_TRI_PISTES` fait rougir « un serveur antérieur à #9362… » ; une clé
// de stockage commune à toutes les playlists dans `lireTriPlaylist` /
// `ecrireTriPlaylist` fait rougir « deux playlists, deux tris ».
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLES_TRI_PISTES, LIBELLES_TRI_PISTES, criteresDisponibles, ecrireTriPlaylist, lireTriPlaylist,
  triApplicable, trierPistes,
} from '../trierPistes';
import type { Track } from '../types';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const t = (title: string, extra: Partial<Track> = {}) => ({ id: title.length, title, ...extra }) as Track;
const titres = (l: Track[]) => l.map((x) => x.title);

const classique = [
  t('Gnossienne', { composer: 'Erik Satie', sample_rate: 44100, bit_depth: 16, playlist_added_at: 300 }),
  t('Clair de lune', { composer: 'Claude Debussy', sample_rate: 96000, bit_depth: 24, playlist_added_at: 100 }),
  t('Improvisation', { composer: null, sample_rate: null, playlist_added_at: null }),
  t('Pavane', { composer: 'Gabriel Fauré', sample_rate: 96000, bit_depth: 16, playlist_added_at: 200 }),
];

describe('web#3333 — nouveaux critères', () => {
  it('compositeur : accents repliés, sans compositeur en dernier dans les deux sens', () => {
    expect(titres(trierPistes(classique, 'composer', 'asc'))).toEqual(['Clair de lune', 'Gnossienne', 'Pavane', 'Improvisation']);
    expect(titres(trierPistes(classique, 'composer', 'desc'))).toEqual(['Pavane', 'Gnossienne', 'Clair de lune', 'Improvisation']);
  });
  it('date d\'ajout à la playlist : la plus ancienne d\'abord, inconnue en dernier', () => {
    expect(titres(trierPistes(classique, 'added', 'asc'))).toEqual(['Clair de lune', 'Pavane', 'Gnossienne', 'Improvisation']);
    expect(titres(trierPistes(classique, 'added', 'desc'))).toEqual(['Gnossienne', 'Pavane', 'Clair de lune', 'Improvisation']);
  });
  it('fréquence : départagée par la résolution, inconnue en dernier', () => {
    expect(titres(trierPistes(classique, 'sample_rate', 'asc'))).toEqual(['Gnossienne', 'Pavane', 'Clair de lune', 'Improvisation']);
    expect(titres(trierPistes(classique, 'sample_rate', 'desc'))).toEqual(['Clair de lune', 'Pavane', 'Gnossienne', 'Improvisation']);
  });
  it('trier n\'agit que sur une copie : l\'ordre composé reste intact', () => {
    const avant = titres(classique);
    trierPistes(classique, 'composer', 'asc');
    trierPistes(classique, 'added', 'desc');
    expect(titres(classique)).toEqual(avant);
  });
});

describe('web#3333 — critères masqués quand le champ manque', () => {
  it('un serveur antérieur à #9362 (aucun champ) : seuls les critères d\'avant', () => {
    const ancien = [t('A', { year: 2001 }), t('B')];
    expect(criteresDisponibles(ancien)).toEqual(['ordre', 'title', 'artist', 'album', 'year']);
  });
  it('champs présents mais tous nuls : rien à trier, critère masqué', () => {
    const vides = [t('A', { composer: null, sample_rate: null, playlist_added_at: null }), t('B', { composer: '  ' })];
    expect(criteresDisponibles(vides)).toEqual(['ordre', 'title', 'artist', 'album', 'year']);
  });
  it('un seul champ porté : seul ce critère s\'ajoute, dans l\'ordre de la liste', () => {
    expect(criteresDisponibles([t('A', { sample_rate: 44100 })])).toEqual(['ordre', 'title', 'artist', 'album', 'year', 'sample_rate']);
    expect(criteresDisponibles(classique)).toEqual([...CLES_TRI_PISTES]);
  });
  it('un choix retenu qui ne s\'applique pas retombe sur l\'ordre de la playlist', () => {
    expect(triApplicable([t('A')], { cle: 'composer', sens: 'desc' })).toEqual({ cle: 'ordre', sens: 'asc' });
    expect(triApplicable(classique, { cle: 'composer', sens: 'desc' })).toEqual({ cle: 'composer', sens: 'desc' });
    expect(triApplicable([], { cle: 'title', sens: 'desc' })).toEqual({ cle: 'title', sens: 'desc' });
  });
});

describe('web#3333 — tri retenu par playlist', () => {
  beforeEach(() => localStorage.clear());
  it('une playlist jamais réglée reste sur l\'ordre de la playlist, même après un choix ailleurs', () => {
    ecrireTriPlaylist('local:1', { cle: 'composer', sens: 'asc' });
    // L'ancienne clé unique, écrite par une version antérieure : plus lue.
    localStorage.setItem('tune_v2_ecran_v2.playlist.pistes.tri', 'artist');
    expect(lireTriPlaylist('local:2')).toEqual({ cle: 'ordre', sens: 'asc' });
    expect(lireTriPlaylist(null)).toEqual({ cle: 'ordre', sens: 'asc' });
  });
  it('deux playlists, deux tris', () => {
    ecrireTriPlaylist('local:1', { cle: 'composer', sens: 'asc' });
    ecrireTriPlaylist('local:2', { cle: 'artist', sens: 'desc' });
    ecrireTriPlaylist('qobuz:abc', { cle: 'added', sens: 'desc' });
    expect(lireTriPlaylist('local:1')).toEqual({ cle: 'composer', sens: 'asc' });
    expect(lireTriPlaylist('local:2')).toEqual({ cle: 'artist', sens: 'desc' });
    expect(lireTriPlaylist('qobuz:abc')).toEqual({ cle: 'added', sens: 'desc' });
  });
  it('une valeur illisible retombe sur le défaut', () => {
    localStorage.setItem('tune_v2_ecran_v2.playlist.pistes.tri.local:3', 'inconnu');
    localStorage.setItem('tune_v2_ecran_v2.playlist.pistes.sens.local:3', 'bof');
    expect(lireTriPlaylist('local:3')).toEqual({ cle: 'ordre', sens: 'asc' });
  });
});

describe('web#3333 — libellés traduits dans toutes les langues', () => {
  it('chaque critère a son libellé dans chaque dictionnaire', () => {
    for (const langue of ONZE_LANGUES) {
      const dico = dictionnaire(langue);
      for (const k of CLES_TRI_PISTES) {
        expect(dico[LIBELLES_TRI_PISTES[k]], `${langue} : ${LIBELLES_TRI_PISTES[k]}`).toBeTruthy();
      }
    }
  });
});
