// @vitest-environment jsdom
//
// web#2017 (FabienM, fils forum 2176 et 2236) — « Autres versions » :
//   1. un menu « … » par version : Lire, Ajouter à la file, Aller à l'album,
//      Aller à l'artiste — en mode regroupé comme en mode plat, version de
//      service comprise ;
//   2. l'en-tête d'un groupe dit ce qui le distingue (album, interprète,
//      durée), au lieu de « Autre enregistrement » répété ;
//   3. « Jouée par défaut » porte son explication (bulle d'aide).
//
// Banc repris de tune-server-rust#2264 (`groupesVersions2264.test.ts`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { locale } from '../i18n';
import { type GroupesVersions, type MembreGroupe } from '../groupesVersions';
import { distinctionGroupe } from '../versionsPanneau';
import { gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { get } from 'svelte/store';

import fr from '../locales/fr';

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
let files: unknown[] = [];
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
  files = [];
  currentZoneId.set(3);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/library/tracks/900/versions/groups')) {
      return avecGroupes ? reponse(200, GROUPES) : reponse(404, { error: 'not found' });
    }
    if (url.includes('/library/tracks/900/versions')) return reponse(200, PLATE);
    if (url.includes('/queue')) { files.push(JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null'))); return reponse(200, {}); }
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

const F = fr as unknown as Record<string, string>;
const membres = () => [...document.querySelectorAll<HTMLElement>('.membre')];
async function ouvrirMenu(li: HTMLElement) {
  li.querySelector<HTMLButtonElement>('button.mv')!.click();
  await souffler(2);
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button[role="menuitem"]')];
}
const libelles = (items: HTMLButtonElement[]) => items.map((b) => (b.textContent ?? '').trim());

describe('#2017 — un menu « … » par version', () => {
  it('🔴 version de SERVICE : Lire, Ajouter à la file, Aller à l’album, Aller à l’artiste', async () => {
    await monter();
    const qobuz = membres().find((m) => m.textContent?.includes('Thriller 25'))!;
    expect(qobuz.querySelector('button.mv'), 'pas de bouton « … » sur la version').toBeTruthy();
    const items = await ouvrirMenu(qobuz);
    expect(libelles(items)).toEqual([F['common.play'], F['queue.addToQueue'], F['library.goToArtist']]);
  });

  it('🔴 « Aller à l’album » d’une version de service ouvre sa fiche chez le service', async () => {
    const GR = structuredClone(GROUPES);
    GR.groups[0].members[1].album_id = 'alb-25';
    const ouvrirAlbum = vi.fn();
    gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste: vi.fn() } as any);
    const avant = GROUPES.groups[0].members[1].album_id;
    GROUPES.groups[0].members[1].album_id = 'alb-25';
    try {
      await monter();
      const qobuz = membres().find((m) => m.textContent?.includes('Thriller 25'))!;
      const items = await ouvrirMenu(qobuz);
      expect(libelles(items)).toContain(F['library.goToAlbum']);
      items.find((b) => b.textContent?.trim() === F['library.goToAlbum'])!.click();
      expect(ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: 'alb-25', titre: 'Thriller 25' }));
    } finally {
      GROUPES.groups[0].members[1].album_id = avant;
      gestesNavigationService.set(null);
    }
  });

  it('🔴 « Ajouter à la file » envoie la version de service par sa paire', async () => {
    await monter();
    const qobuz = membres().find((m) => m.textContent?.includes('Thriller 25'))!;
    const items = await ouvrirMenu(qobuz);
    items.find((b) => b.textContent?.trim() === F['queue.addToQueue'])!.click();
    await souffler();
    expect(files).toEqual([expect.objectContaining({ tracks: [expect.objectContaining({ source: 'qobuz', source_id: 'q-25' })] })]);
  });

  it('version de la bibliothèque : « Aller à l’album » ouvre l’album local', async () => {
    await monter();
    const locale_ = membres().find((m) => m.textContent?.includes('cette piste'))!;
    const items = await ouvrirMenu(locale_);
    items.find((b) => b.textContent?.trim() === F['library.goToAlbum'])!.click();
    expect(get(pendingLibraryAlbum)).toBe(1);
  });

  it('mode plat (serveur antérieur) : la tuile a aussi son menu', async () => {
    avecGroupes = false;
    await monter();
    const tuile = document.querySelector<HTMLElement>('.tuile')!;
    const items = await ouvrirMenu(tuile);
    expect(libelles(items)).toEqual([F['common.play'], F['queue.addToQueue'], F['library.goToAlbum']]);
  });
});

describe('#2017 — l’en-tête dit ce qui distingue, « Jouée par défaut » s’explique', () => {
  it('🔴 plus de « Autre enregistrement » répété : album, interprète, durée', async () => {
    await monter();
    const titres = [...document.querySelectorAll('.groupe h3')].map(texte);
    expect(titres[1]).toBe('Live at Wembley · Michael Jackson · 4:54');
    expect(titres).not.toContain(F['library.versionGroups.other']);
  });

  it('🔴 « Jouée par défaut » porte sa bulle d’aide, règle comprise', async () => {
    await monter();
    const badge = document.querySelector<HTMLElement>('.par-defaut')!;
    expect(badge.getAttribute('title')).toBe(
      F['library.versionGroups.defaultHint'].replace('{rule}', F['profiles.versionRule.quality']),
    );
  });

  it('distinctionGroupe : rien d’inventé, et les albums en plus se comptent', () => {
    const g = GROUPES.groups[0];
    expect(distinctionGroupe(g)).toBe('Thriller 25 (+2) · Michael Jackson · 4:54');
    expect(distinctionGroupe({ ...g, members: [membre({ album_title: '', artist_name: '', duration_ms: null, is_default: true })] })).toBe('');
  });
});
