import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { auNiveauZero, cleDeNiveau, type PositionStreaming } from '../niveauStreaming';

/**
 * Streaming, Gestionnaire de playlists et Serveurs multimédia — les trois vues
 * que la PR précédente avait laissées de côté, parce que leur retour gère
 * plusieurs niveaux et, pour le streaming, une provenance.
 */

const racine: PositionStreaming = { service: 'qobuz', searchQuery: '', tab: 'home' };

describe('ce qui compte comme un niveau dans la vue streaming', () => {
  it('taper dans la recherche ne descend PAS d’un niveau', () => {
    // Le piège : l'instantané de la vue suit chaque frappe. S'il alimentait
    // l'historique tel quel, sortir d'une recherche demanderait autant
    // d'appuis sur Retour que de lettres tapées.
    const avant = cleDeNiveau({ ...racine, tab: 'search', searchQuery: 'gen' });
    const apres = cleDeNiveau({ ...racine, tab: 'search', searchQuery: 'genesis' });
    expect(apres).toBe(avant);
  });

  it('changer d’onglet non plus', () => {
    expect(cleDeNiveau({ ...racine, tab: 'search' })).toBe(cleDeNiveau({ ...racine, tab: 'home' }));
  });

  it('ouvrir un artiste, puis un de ses albums, fait DEUX niveaux distincts', () => {
    const artiste = { ...racine, selectedArtist: { id: 'ar-77' } };
    const album = { ...artiste, selectedAlbum: { id: 'al-12' } };
    expect(cleDeNiveau(artiste)).not.toBe(cleDeNiveau(racine));
    expect(cleDeNiveau(album)).not.toBe(cleDeNiveau(artiste));
  });

  it('changer de service change de niveau', () => {
    expect(cleDeNiveau({ ...racine, service: 'tidal' })).not.toBe(cleDeNiveau(racine));
  });

  it('le fil de genres compte, et sa profondeur aussi', () => {
    const un = { ...racine, genreBreadcrumb: [{ id: 'jazz' }] };
    const deux = { ...racine, genreBreadcrumb: [{ id: 'jazz' }, { id: 'bebop' }] };
    expect(cleDeNiveau(un)).not.toBe(cleDeNiveau(racine));
    expect(cleDeNiveau(deux)).not.toBe(cleDeNiveau(un));
  });

  it('une playlist de service est un niveau', () => {
    const pl = { ...racine, selectedStreamingPlaylist: { source_id: 'pl-9' } };
    expect(cleDeNiveau(pl)).not.toBe(cleDeNiveau(racine));
  });

  it('la racine du service n’est pas une descente', () => {
    expect(auNiveauZero(racine)).toBe(true);
    expect(auNiveauZero({ ...racine, tab: 'search', searchQuery: 'genesis' })).toBe(true);
    expect(auNiveauZero({ ...racine, selectedAlbum: { id: 'al-1' } })).toBe(false);
    expect(auNiveauZero({ ...racine, genreBreadcrumb: [{ id: 'jazz' }] })).toBe(false);
  });
});

describe('les trois vues sont câblées sur le mécanisme', () => {
  const source = (chemin: string) => readFileSync(resolve(__dirname, '../..', chemin), 'utf-8');

  for (const [vue, fichier] of [
    ['streaming', 'components/StreamingView.svelte'],
    ['playlistmanager', 'components/PlaylistManagerView.svelte'],
    ['mediaservers', 'components/MediaServersView.svelte'],
  ] as const) {
    it(`${vue} publie son niveau, se déclare, et délègue son retour`, () => {
      const s = source(fichier);
      expect(s).toMatch(new RegExp(`declarerPorteeDeVue\\('${vue}'`));
      expect(s).toMatch(/ouvrirNiveau\('|niveauDeVue\.set/);
      expect(s).toMatch(/reculerDansLaVue/);
    });
  }

  it('aucune des trois ne remet son état à zéro dans son coin sans reculer', () => {
    // Le défaut d'origine : `goBack()` vidait des variables locales et ne
    // touchait pas à `history`, d'où une pile parallèle par vue.
    for (const fichier of [
      'components/StreamingView.svelte',
      'components/PlaylistManagerView.svelte',
      'components/MediaServersView.svelte',
    ]) {
      const s = source(fichier);
      const corps = s.slice(s.indexOf('function goBack()'));
      const fin = corps.indexOf('\n  }\n');
      expect(corps.slice(0, fin)).toMatch(/reculerDansLaVue|activeView\.set/);
    }
  });

  it('Serveurs multimédia porte le chemin parcouru, pas seulement le serveur', () => {
    const s = source('components/MediaServersView.svelte');
    expect(s).toMatch(/ouvrirNiveau\('mediaservers', \{ server: selectedServer, stack: navigationStack \}\)/);
  });

  it('la vue streaming filtre les frappes avant d’écrire dans l’historique', () => {
    const s = source('components/StreamingView.svelte');
    expect(s).toMatch(/cleDeNiveau/);
    expect(s).toMatch(/auNiveauZero/);
  });
});

describe('une fiche de streaming ne s’identifie pas comme une fiche locale', () => {
  /**
   * 🔴 Défaut attrapé dans le NAVIGATEUR. Un album Qobuz n'a pas d'`id` : la
   * recherche rend `artist_id, artist_name, cover_path, quality, source_id,
   * title, track_count, year`. Ne lire que `id` rendait `null` pour tout album
   * de service — ouvrir un album depuis une discographie ne changeait donc pas
   * de niveau, et son entrée d'historique n'était jamais écrite. Le bouton
   * retour sautait le niveau album.
   */
  const racineQobuz: PositionStreaming = { service: 'qobuz' };
  // L'album Qobuz « Invisible Touch » : pas d'`id`, seulement un `source_id`.
  const albumQobuz = { source_id: '0603497947447' };

  it('un album identifié par `source_id` est bien un niveau', () => {
    expect(cleDeNiveau({ ...racineQobuz, selectedAlbum: albumQobuz }))
      .not.toBe(cleDeNiveau(racineQobuz));
    expect(auNiveauZero({ ...racineQobuz, selectedAlbum: albumQobuz })).toBe(false);
  });

  it('deux albums de service différents sont deux niveaux différents', () => {
    const autre = { source_id: '0603497947999' };
    expect(cleDeNiveau({ ...racineQobuz, selectedAlbum: albumQobuz }))
      .not.toBe(cleDeNiveau({ ...racineQobuz, selectedAlbum: autre }));
  });

  it('artiste puis album de service : deux crans, pas un', () => {
    const artiste = { ...racineQobuz, selectedArtist: { id: '4438885' } };
    const album = { ...artiste, selectedAlbum: albumQobuz };
    expect(cleDeNiveau(artiste)).not.toBe(cleDeNiveau(racineQobuz));
    expect(cleDeNiveau(album)).not.toBe(cleDeNiveau(artiste));
  });

  it('un album local, lui, garde son `id` numérique', () => {
    expect(cleDeNiveau({ ...racineQobuz, selectedAlbum: { id: 2691 } }))
      .not.toBe(cleDeNiveau(racineQobuz));
  });

  it('`id` prime sur `source_id` quand les deux existent', () => {
    const a = { ...racineQobuz, selectedAlbum: { id: 7, source_id: 'x' } };
    const b = { ...racineQobuz, selectedAlbum: { id: 7, source_id: 'y' } };
    expect(cleDeNiveau(a)).toBe(cleDeNiveau(b));
  });
});
