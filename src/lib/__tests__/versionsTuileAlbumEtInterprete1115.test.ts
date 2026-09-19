// @vitest-environment jsdom
//
// #1115 — « Il manque aussi le nom de l'album à côté de chaque vignette »
// (FabienM, fil 1829, 0.9.152, point 11).
//
// La tuile de SERVICE du panneau « Autres versions » n'avait qu'une ligne :
// l'interprète pour une reprise, l'album pour une version. Le serveur rend
// pourtant les deux. La charge ci-dessous est un extrait de la réponse RÉELLE
// du .18 le 19/09/2026 :
//
//   GET /api/v1/library/tracks/25930/versions?streaming=true   (« Lovely Day »)
//
// 🔴 CE TÉMOIN MONTE LE PANNEAU et lit le texte de chaque tuile.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { locale } from '../i18n';
import { libellesVersionService } from '../versionsPiste';

const CHARGE = {
  track_id: 25930,
  title: 'Lovely Day',
  artist_name: 'Bill Withers',
  played_album: 'Menagerie',
  versions: [
    { album_id: 4411, album_title: 'Menagerie', cover_path: null, duration_ms: 257000, track_id: 46940 },
  ],
  streaming: [
    { kind: 'version', service: 'qobuz', source_id: '101', album_id: 'a1', cover_path: null,
      title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Pledging My Love' },
    { kind: 'reprise', service: 'qobuz', source_id: '102', album_id: 'a2', cover_path: null,
      title: 'Lovely Day', artist_name: 'Jill Scott',
      album_title: 'Hidden Beach Presents: The Original Jill Scott - from the vault, Vol. 1' },
    { kind: 'reprise', service: 'tidal', source_id: '103', album_id: 'a3', cover_path: null,
      title: 'Lovely Day (In the Style of Bill Withers) [Karaoke Version]',
      artist_name: 'The Karaoke Channel',
      album_title: 'The Karaoke Channel - Sing Lovely Day Like Bill Withers' },
  ],
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const charge = url.includes('/library/tracks/25930/versions') ? CHARGE : {};
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

/** Le texte de chaque tuile, tel qu'il s'affiche. */
async function tuiles(): Promise<string[]> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(VersionsPistePanneau, { target: hote, props: { trackId: 25930, titre: 'Lovely Day', onClose: () => {} } });
  await souffler();
  // Le panneau se pose dans un portail : on le cherche dans tout le document.
  return [...document.querySelectorAll('.tuile')].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('#1115 — une tuile de service dit son album ET son interprète', () => {
  it('le panneau rend bien les quatre tuiles (contre-épreuve du montage)', async () => {
    expect(await tuiles()).toHaveLength(4);
  });

  it('🔴 une REPRISE montre son album, pas seulement l’interprète', async () => {
    const t = (await tuiles()).find((x) => x.includes('Jill Scott'));
    expect(t, 'la reprise de Jill Scott n’est pas rendue').toBeTruthy();
    expect(t, 'la tuile d’une reprise ne dit pas de quel album elle vient')
      .toContain('Hidden Beach Presents');
  });

  it('🔴 une VERSION montre son interprète, pas seulement l’album', async () => {
    const t = (await tuiles()).find((x) => x.includes('Pledging My Love'));
    expect(t, 'la version « Pledging My Love » n’est pas rendue').toBeTruthy();
    expect(t, 'la tuile d’une version ne dit pas de qui elle est').toContain('Bill Withers');
  });

  it('les deux reprises se distinguent par l’interprète ET par l’album', async () => {
    const t = (await tuiles()).find((x) => x.includes('The Karaoke Channel - Sing'));
    expect(t).toBeTruthy();
    expect(t).toContain('The Karaoke Channel');
  });
});

describe('libellesVersionService — la règle, appelée', () => {
  it('l’album d’abord, l’interprète ensuite ; le titre ne sert que de repli', () => {
    expect(libellesVersionService({ title: 'T', artist_name: 'A', album_title: 'B' }))
      .toEqual({ album: 'B', interprete: 'A' });
    expect(libellesVersionService({ title: 'T', artist_name: null, album_title: null }))
      .toEqual({ album: 'T', interprete: null });
    expect(libellesVersionService({ title: 'T', artist_name: '  ', album_title: ' ' }))
      .toEqual({ album: 'T', interprete: null });
  });
});
