/**
 * Paroles (lib/lyrics) — normalisation des réponses serveur, détection des
 * métadonnées radio exploitables et ancrage temporel des paroles radio.
 */
import { describe, it, expect } from 'vitest';
import {
  parseLrc,
  normalizeLyricsResponse,
  radioTrackHasMeta,
  metaLyricsQuery,
  radioAnchorFrom,
} from '../lyrics';

describe('normalizeLyricsResponse', () => {
  it('accepte la nouvelle forme {synced, lines}', () => {
    const r = normalizeLyricsResponse({
      synced: true,
      source: 'lrclib',
      lines: [
        { t_ms: 1000, text: 'Première ligne' },
        { t_ms: 4000, text: 'Deuxième ligne' },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.synced).toBe(true);
    expect(r!.source).toBe('lrclib');
    expect(r!.lines).toHaveLength(2);
    expect(r!.lines[0].t_ms).toBe(1000);
  });

  it('nouvelle forme non synchronisée : t_ms null', () => {
    const r = normalizeLyricsResponse({
      synced: false,
      source: 'lrclib',
      lines: [{ t_ms: null, text: 'Texte brut' }],
    });
    expect(r!.synced).toBe(false);
    expect(r!.lines[0].t_ms).toBeNull();
  });

  it('accepte la forme historique (LRC brut dans `synced`)', () => {
    const r = normalizeLyricsResponse({
      lyrics: null,
      synced: '[00:12.34] Bonjour\n[00:15.00] Le monde',
      source: 'lrclib',
    });
    expect(r!.synced).toBe(true);
    expect(r!.lines[0].t_ms).toBe(12_340);
    expect(r!.lines[1].text).toBe('Le monde');
  });

  it('forme historique texte simple', () => {
    const r = normalizeLyricsResponse({ lyrics: 'ligne 1\nligne 2', synced: null, source: 'tag' });
    expect(r!.synced).toBe(false);
    expect(r!.lines).toHaveLength(2);
  });

  it('rend null pour vide / invalide', () => {
    expect(normalizeLyricsResponse(null)).toBeNull();
    expect(normalizeLyricsResponse({})).toBeNull();
    expect(normalizeLyricsResponse({ lines: [] })).toBeNull();
    expect(normalizeLyricsResponse({ lyrics: '   ' })).toBeNull();
  });
});

describe('parseLrc', () => {
  it('parse minutes/secondes/centisecondes', () => {
    const lines = parseLrc('[01:02.50] Troisième');
    expect(lines).toHaveLength(1);
    expect(lines[0].t_ms).toBe(62_500);
  });
});

describe('radioTrackHasMeta', () => {
  it('vrai pour une radio avec titre + artiste distincts de la station', () => {
    expect(
      radioTrackHasMeta({
        source: 'radio',
        title: 'So What',
        artist_name: 'Miles Davis',
        album_title: 'FIP',
      }),
    ).toBe(true);
  });

  it('faux quand l’artiste est le nom de la station (repli serveur)', () => {
    expect(
      radioTrackHasMeta({
        source: 'radio',
        title: 'Émission du soir',
        artist_name: 'FIP',
        album_title: 'FIP',
      }),
    ).toBe(false);
  });

  it('faux sans artiste, sans titre, ou hors radio', () => {
    expect(radioTrackHasMeta({ source: 'radio', title: 'X', artist_name: '' })).toBe(false);
    expect(radioTrackHasMeta({ source: 'radio', title: '', artist_name: 'Y' })).toBe(false);
    expect(
      radioTrackHasMeta({ source: 'local', title: 'X', artist_name: 'Y', album_title: 'Z' }),
    ).toBe(false);
  });
});

describe('metaLyricsQuery', () => {
  it('radio : titre+artiste, marqué radio, sans album/durée', () => {
    const q = metaLyricsQuery({
      source: 'radio',
      title: 'So What',
      artist_name: 'Miles Davis',
      album_title: 'FIP',
    });
    expect(q).not.toBeNull();
    expect(q!.radio).toBe(true);
    expect(q!.title).toBe('So What');
    expect(q!.album).toBeUndefined();
  });

  it('streaming Qobuz (id nul) : album + durée transmis, non radio', () => {
    const q = metaLyricsQuery({
      id: null,
      track_id: null,
      source: 'qobuz',
      title: 'Repenti',
      artist_name: 'Renan Luce',
      album_title: 'Repenti',
      duration_ms: 245000,
    });
    expect(q).not.toBeNull();
    expect(q!.radio).toBe(false);
    expect(q!.album).toBe('Repenti');
    expect(q!.durationSecs).toBe(245);
  });

  it('piste de bibliothèque (id présent) : pas de requête par métadonnées', () => {
    expect(
      metaLyricsQuery({ id: 42, source: 'local', title: 'X', artist_name: 'Y' }),
    ).toBeNull();
    // Forme /zones : id sous track_id.
    expect(
      metaLyricsQuery({ track_id: 42, source: 'local', title: 'X', artist_name: 'Y' }),
    ).toBeNull();
  });

  it('radio dont l’artiste = station → non éligible', () => {
    expect(
      metaLyricsQuery({ source: 'radio', title: 'Live', artist_name: 'FIP', album_title: 'FIP' }),
    ).toBeNull();
  });

  it('titre ou artiste manquant → null', () => {
    expect(metaLyricsQuery({ source: 'qobuz', title: '', artist_name: 'Y' })).toBeNull();
    expect(metaLyricsQuery({ source: 'qobuz', title: 'X', artist_name: '' })).toBeNull();
    expect(metaLyricsQuery(null)).toBeNull();
  });
});

describe('radioAnchorFrom', () => {
  it('recule l’ancrage de l’âge serveur', () => {
    // Le serveur dit « la métadonnée a 30 s » → le morceau a commencé il y a 30 s.
    expect(radioAnchorFrom(30_000, 100_000)).toBe(70_000);
  });

  it('sans âge serveur, l’ancrage est « maintenant »', () => {
    expect(radioAnchorFrom(undefined, 100_000)).toBe(100_000);
    expect(radioAnchorFrom(null, 100_000)).toBe(100_000);
    expect(radioAnchorFrom(-5, 100_000)).toBe(100_000);
  });
});
