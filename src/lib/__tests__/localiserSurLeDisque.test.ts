/**
 * « Localiser sur le disque » (Bertrand, 09/09/2026).
 *
 * ## Ce que le serveur donne, et ce qu'il ne donne pas
 *
 * Mesuré sur le .18 le 09/09/2026 : un ALBUM ne porte AUCUN chemin. Ses clés
 * sont `added_at, artist_id, …, source_id, title, track_count, year` — ni
 * `file_path` ni `folder`. Une PISTE, si :
 *
 *     /data/music/NEW_FLAC/CHANSON FRANCAISE/M/1997-M - Le baptême/01-M-La fleur.flac
 *
 * Le dossier de l'album se DÉDUIT donc de ses pistes.
 *
 * ## Le piège des multi-disques
 *
 * Un album gravé en deux disques range ses pistes dans `CD1/` et `CD2/`.
 * Prendre le dossier de la PREMIÈRE piste ouvrirait `CD1` — la moitié de
 * l'album. On remonte au plus long préfixe commun.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dossierDeLAlbum, dossierDuFichier } from '../dossierAlbum';

const RACINE = '/data/music/NEW_FLAC/CHANSON FRANCAISE/M/1997-M - Le baptême';

describe('dossierDuFichier', () => {
  it('rend le dossier du chemin MESURÉ sur le .18', () => {
    expect(dossierDuFichier(`${RACINE}/01-M-La fleur.flac`)).toBe(RACINE);
  });

  it('comprend aussi un chemin Windows', () => {
    expect(dossierDuFichier('D:\\Musique\\Genesis\\Abacab\\01.dsf')).toBe('D:\\Musique\\Genesis\\Abacab');
  });

  it('rend null quand il n’y a pas de dossier à ouvrir', () => {
    for (const c of ['', '   ', null, undefined, 'fichier.flac', '/racine.flac']) {
      expect(dossierDuFichier(c), String(c)).toBeNull();
    }
  });
});

describe('dossierDeLAlbum', () => {
  it('un album à disque unique ouvre SON dossier', () => {
    const pistes = [1, 2, 3].map((n) => ({ file_path: `${RACINE}/0${n}-M.flac`, source: 'local' }));
    expect(dossierDeLAlbum(pistes)).toBe(RACINE);
  });

  it('🔴 un album en deux disques ouvre le dossier de l’ALBUM, pas CD1', () => {
    const pistes = [
      { file_path: `${RACINE}/CD1/01.flac`, source: 'local' },
      { file_path: `${RACINE}/CD1/02.flac`, source: 'local' },
      { file_path: `${RACINE}/CD2/01.flac`, source: 'local' },
    ];
    expect(dossierDeLAlbum(pistes)).toBe(RACINE);
    // Le défaut qu'on évite : ouvrir la moitié de l'album.
    expect(dossierDeLAlbum(pistes)).not.toBe(`${RACINE}/CD1`);
  });

  it('🔴 un album de STREAMING n’a pas de dossier — le bouton ne doit pas paraître', () => {
    expect(dossierDeLAlbum([{ source: 'qobuz', file_path: null }])).toBeNull();
    expect(dossierDeLAlbum([{ source: 'tidal' }, { source: 'bandcamp' }])).toBeNull();
  });

  it('ignore les pistes de service mêlées à des pistes locales', () => {
    const pistes = [
      { file_path: `${RACINE}/01.flac`, source: 'local' },
      { file_path: null, source: 'qobuz' },
    ];
    expect(dossierDeLAlbum(pistes)).toBe(RACINE);
  });

  it('rend null sur une liste vide ou absente', () => {
    expect(dossierDeLAlbum([])).toBeNull();
    expect(dossierDeLAlbum(null)).toBeNull();
    expect(dossierDeLAlbum(undefined)).toBeNull();
  });

  it('ne rend pas la RACINE quand les pistes n’ont rien en commun', () => {
    // Deux dossiers sans parent utile : mieux vaut ne rien proposer que
    // d'ouvrir « / » et prétendre que c'est l'album.
    expect(dossierDeLAlbum([
      { file_path: '/a/01.flac', source: 'local' },
      { file_path: '/b/01.flac', source: 'local' },
    ])).toBeNull();
  });
});

describe('le bouton est BRANCHÉ, pas seulement écrit', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

  it('la fiche album appelle la règle et bascule sur les Répertoires', () => {
    const fiche = lire('components/v2/AlbumDetailV2.svelte');
    expect(fiche).toContain("from '../../lib/dossierAlbum'");
    expect(fiche).toContain('dossierDeLAlbum(tracks)');
    expect(fiche).toContain('ouvrirLeRepertoire(dossier)');
    expect(fiche).toContain("activeView.set('browse')");
    // Le bouton n'existe que s'il y a un dossier.
    expect(fiche).toContain('{#if dossier}');
    expect(fiche).toContain("v2.album.locate");
  });

  it('🔴 les Répertoires OUVRENT le dossier demandé, et le consomment', () => {
    // Sans consommation, revenir aux Répertoires par la barre latérale
    // rouvrirait indéfiniment le dernier album localisé.
    const br = lire('components/BrowseView.svelte');
    expect(br).toContain("from '../lib/stores/repertoireCible'");
    expect(br).toContain('consommerRepertoireCible()');
    expect(br).toContain('void navigateTo(cible)');
  });

  it('le libellé existe dans les 11 langues', () => {
    for (const l of ['en', 'fr', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu']) {
      expect(lire(`lib/locales/${l}.ts`), l).toContain('v2.album.locate');
    }
  });
});
