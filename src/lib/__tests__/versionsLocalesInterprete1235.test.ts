// @vitest-environment jsdom
//
// #1235 — « Autres versions — manque nom du groupe » (Bertrand, 18/09/2026).
//
// Une tuile de la BIBLIOTHÈQUE ne portait que l'album : deux versions d'un même
// titre par deux formations se ressemblaient en tout, sauf la pochette. La
// route transporte l'interprète sur ce chemin depuis tune-server-rust#4468
// (0.9.157, `COALESCE(ar2.name, ar.name) AS artist_name`) : l'écran doit le
// dire.
//
// 🔴 CE TÉMOIN MONTE LE PANNEAU et lit le texte de chaque tuile locale.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { locale } from '../i18n';
import { libellesVersionLocale } from '../versionsPiste';

// Forme de `routes/versions.rs` (chemin local) après #4484.
const CHARGE = {
  track_id: 700,
  title: 'Knockin’ on Heaven’s Door',
  artist_name: 'Bob Dylan',
  played_album: 'Pat Garrett & Billy the Kid',
  versions: [
    { track_id: 701, album_id: 81, album_title: 'Greatest Hits', cover_path: null,
      duration_ms: 150000, artist_name: 'Bob Dylan' },
    { track_id: 702, album_id: 82, album_title: 'Greatest Hits', cover_path: null,
      duration_ms: 336000, artist_name: "Guns N' Roses" },
    // Un serveur antérieur à la 0.9.157 : pas de champ du tout.
    { track_id: 703, album_id: 83, album_title: 'Live 1975', cover_path: null, duration_ms: 290000 },
  ],
  streaming: [],
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = url.includes('/library/tracks/700/versions') ? CHARGE : {};
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

async function tuiles(): Promise<string[]> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(VersionsPistePanneau, { target: hote, props: { trackId: 700, titre: 'x', onClose: () => {} } });
  await souffler();
  return [...document.querySelectorAll('.tuile')].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('#1235 — une version de la bibliothèque dit de qui elle est', () => {
  it('le panneau rend les trois tuiles locales (contre-épreuve du montage)', async () => {
    expect(await tuiles()).toHaveLength(3);
  });

  it('🔴 deux « Greatest Hits » se départagent par le nom du groupe', async () => {
    const t = await tuiles();
    expect(t[0], 'la première version ne nomme pas son interprète').toContain('Bob Dylan');
    expect(t[1], 'la seconde version ne nomme pas son interprète').toContain("Guns N' Roses");
    expect(t[0]).not.toBe(t[1]);
  });

  it('un serveur sans le champ : l’album et la durée, sans nom inventé', async () => {
    const t = (await tuiles())[2];
    expect(t).toContain('Live 1975');
    expect(t).toContain('4:50');
    expect(t).not.toMatch(/undefined|null/);
  });
});

describe('libellesVersionLocale — la règle, appelée', () => {
  it('l’album, puis l’interprète ; un nom vide ou absent vaut null', () => {
    expect(libellesVersionLocale({ album_title: 'A', artist_name: 'B' })).toEqual({ album: 'A', interprete: 'B' });
    expect(libellesVersionLocale({ album_title: 'A', artist_name: '  ' })).toEqual({ album: 'A', interprete: null });
    expect(libellesVersionLocale({ album_title: null })).toEqual({ album: '', interprete: null });
  });
});
