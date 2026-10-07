// @vitest-environment jsdom
//
// tune-server-rust#2264 — « Autres versions » regroupées par enregistrement,
// avec la qualité, la source et la version jouée par défaut.
//
// 🔴 CE TÉMOIN MONTE LE PANNEAU. Il sert deux réponses : la route regroupée
// (`/versions/groups`), et la liste plate (`/versions`) d'un serveur
// antérieur. Contre-épreuve : quand la route regroupée répond 404, le panneau
// retombe sur la liste plate au lieu d'annoncer « aucune autre version ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { locale } from '../i18n';
import { cleLien, corpsMembre, groupeVide, qualiteMembre, type GroupesVersions, type MembreGroupe } from '../groupesVersions';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

function membre(p: Partial<MembreGroupe>): MembreGroupe {
  return {
    source: 'local', track_id: null, source_id: null, title: 'Billie Jean',
    artist_name: 'Michael Jackson', album_title: 'Thriller', album_id: null, cover_path: null,
    kind: 'version', duration_ms: 294000, isrc: null, musicbrainz_recording_id: null,
    quality: null, available: null, link: null, is_reference: false, is_default: false, ...p,
  };
}

// Forme de `routes/library/versions_groupes.rs`.
const GROUPES: GroupesVersions = {
  track_id: 900, title: 'Billie Jean', artist_name: 'Michael Jackson', rule: 'quality',
  rule_origin: 'setting',
  groups: [
    {
      identity: 'title_artist_duration', isrc: 'USSM18200001', musicbrainz_recording_id: null,
      contains_reference: true, default: 1,
      members: [
        membre({ track_id: 900, album_id: 1, kind: 'reference', is_reference: true,
          quality: { format: 'flac', sample_rate: 44100, bit_depth: 16 } }),
        membre({ source: 'qobuz', source_id: 'q-25', album_title: 'Thriller 25', link: 'title_artist_duration',
          quality: { format: 'flac', sample_rate: 192000, bit_depth: 24 }, is_default: true }),
        membre({ source: 'tidal', source_id: 't-1', album_title: 'Thriller (Tidal)', link: 'title_artist_duration',
          available: false }),
      ],
    },
    {
      identity: null, isrc: null, musicbrainz_recording_id: null, contains_reference: false, default: 0,
      members: [membre({ source: 'qobuz', source_id: 'q-live', album_title: 'Live at Wembley', is_default: true })],
    },
  ],
};

const PLATE = {
  track_id: 900, title: 'Billie Jean', artist_name: 'Michael Jackson', played_album: 'Thriller',
  versions: [{ track_id: 901, album_id: 2, album_title: 'Number Ones', cover_path: null, duration_ms: 294500 }],
  streaming: [],
};

let avecGroupes = true;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status < 400, status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(corps),
    json: async () => corps,
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/library/tracks/900/versions/groups')) {
      return avecGroupes ? reponse(200, GROUPES) : reponse(404, { error: 'not found' });
    }
    if (url.includes('/library/tracks/900/versions')) return reponse(200, PLATE);
    return reponse(200, {});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  avecGroupes = true;
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(VersionsPistePanneau, { target: hote, props: { trackId: 900, titre: 'Billie Jean', onClose: () => {} } });
  await souffler();
}

const texte = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#2264 — le panneau dessine les groupes du serveur', () => {
  it('deux groupes : cet enregistrement, puis un autre', async () => {
    await monter();
    const titres = [...document.querySelectorAll('.groupe h3')].map(texte);
    expect(titres).toEqual(['Cet enregistrement · titre, artiste et durée', 'Autre enregistrement']);
    expect(document.querySelectorAll('.tuile')).toHaveLength(0);
  });

  it('🔴 la version jouée par défaut est marquée, une par groupe, celle que le serveur désigne', async () => {
    await monter();
    const defauts = [...document.querySelectorAll('.membre.defaut')].map(texte);
    expect(defauts).toHaveLength(2);
    expect(defauts[0]).toContain('Thriller 25');
    expect(defauts[0]).toContain('Jouée par défaut');
  });

  it('chaque membre dit sa qualité et sa source ; la piste de départ est nommée', async () => {
    await monter();
    const lignes = [...document.querySelectorAll('.groupe.courant .membre')].map(texte);
    expect(lignes[0]).toContain('FLAC 44 kHz / 16 bit');
    expect(lignes[0]).toContain('cette piste');
    expect(lignes[0]).toContain('LOCAL');
    expect(lignes[1]).toContain('FLAC 192 kHz / 24 bit');
  });

  it('une version indisponible est montrée, mais inerte', async () => {
    await monter();
    const inertes = [...document.querySelectorAll('.membre.inerte')].map(texte);
    expect(inertes).toHaveLength(1);
    expect(inertes[0]).toContain('Thriller (Tidal)');
    const bouton = document.querySelectorAll('.membre.inerte button.cv')[0] as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it('contre-épreuve : un serveur sans la route (404) rend la liste plate, pas « aucune version »', async () => {
    avecGroupes = false;
    await monter();
    expect(document.querySelectorAll('.groupe')).toHaveLength(0);
    const tuiles = [...document.querySelectorAll('.tuile')].map(texte);
    expect(tuiles).toHaveLength(1);
    expect(tuiles[0]).toContain('Number Ones');
  });
});

describe('#2264 — les aides pures', () => {
  it('la qualité inconnue ne s’écrit pas', () => {
    expect(qualiteMembre(membre({ quality: null }))).toBeNull();
    expect(qualiteMembre(membre({ quality: { format: null, sample_rate: null, bit_depth: null } }))).toBeNull();
    expect(qualiteMembre(membre({ quality: { format: 'flac', sample_rate: 96000, bit_depth: 24 } }))).toBe('FLAC 96 kHz / 24 bit');
  });

  it('on joue LA PISTE : de la bibliothèque par son id, du service par source + source_id', () => {
    // #2264 (07/10) — un lancement depuis le panneau est un CHOIX EXPLICITE :
    // la règle de version du profil ne s'y applique pas.
    expect(corpsMembre(membre({ track_id: 7 }))).toEqual({ track_id: 7, explicit_version: true });
    expect(corpsMembre(membre({ source: 'qobuz', source_id: 'q1', album_id: 'a1' }))).toMatchObject({ source: 'qobuz', source_id: 'q1', explicit_version: true });
    expect(corpsMembre(membre({ source: 'qobuz' }))).toBeNull();
  });

  it('un groupe réduit à la piste de départ ne s’affiche pas', () => {
    expect(groupeVide({ ...GROUPES.groups[0], members: [GROUPES.groups[0].members[0]] })).toBe(true);
    expect(groupeVide(GROUPES.groups[0])).toBe(false);
    expect(groupeVide(GROUPES.groups[1])).toBe(false);
  });

  it('chaque lien a son libellé, dans les onze langues', () => {
    const cles = ['same', 'other', 'byIsrc', 'byMbid', 'byTitle', 'default', 'thisTrack'].map((k) => `library.versionGroups.${k}`);
    for (const l of ['isrc', 'mbid', 'title_artist_duration'] as const) expect(cles).toContain(cleLien(l));
    expect(cleLien(null)).toBeNull();
    for (const dict of [fr, en, de, es, it_, ja, ko, ro, sv, zh, hu] as Record<string, string | undefined>[]) {
      for (const c of cles) expect(dict[c], c).toBeTruthy();
    }
  });
});
