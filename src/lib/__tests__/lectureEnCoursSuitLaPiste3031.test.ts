// @vitest-environment jsdom
//
// Fil 3031 (Lio, rc13 et rc13.1, sortie S/PDIF du serveur, bibliothèque
// locale) — « Affichage lecture en cours ne suit pas la lecture » : au passage
// à la piste suivante, la barre du bas montre la nouvelle piste, l'écran
// « Lecture en cours » reste sur l'ancienne, sur le WebUI comme sur l'iPad.
//
// Les deux lisent pourtant le MÊME magasin (`currentTrack`, dérivé de la zone
// courante) : la donnée arrivait bien. C'est le rendu de l'écran qui mourait.
// `creditsEnLigne` groupait les crédits avec `Object.groupBy`, qui n'existe
// qu'à partir de Safari 17.4 / iPadOS 17.4 (la cible de build est Safari 14).
// Sur un iPad plus ancien, le `$derived` levait un TypeError dès que les
// crédits de la piste arrivaient, l'effet de rendu qui le lit cessait de se
// mettre à jour, et titre, pochette et crédits restaient figés. La barre du
// bas, qui ne lit pas les crédits, continuait de suivre.
//
// Le témoin monte l'écran pour de bon dans un navigateur SANS `Object.groupBy`
// (comme Safari 16), change la piste de la zone suivie, et exige la nouvelle
// piste : titre, pochette, crédits.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { libelleRole } from '../library/credits';

const A = {
  track_id: 77, album_id: 5, artist_id: 3, title: 'Piste A', artist_name: 'Artiste',
  album_title: 'Album A', cover_path: 'covers/a.jpg', source: 'local', duration_ms: 200000,
  format: 'flac', sample_rate: 44100, bit_depth: 16,
};
const B = {
  track_id: 78, album_id: 6, artist_id: 3, title: 'Piste B', artist_name: 'Artiste',
  album_title: 'Album B', cover_path: 'covers/b.jpg', source: 'local', duration_ms: 210000,
  format: 'flac', sample_rate: 44100, bit_depth: 16,
};
const CREDITS: Record<number, unknown[]> = {
  77: [{ role: 'performer', artist_name: 'Pianiste A', artist_id: 9, instrument: 'piano' }],
  78: [
    { role: 'performer', artist_name: 'Pianiste B', artist_id: 11, instrument: 'piano' },
    { role: 'composer', artist_name: 'Compositeur B', artist_id: 12 },
  ],
};

function reponse(brute: string): Response {
  const url = new URL(brute, 'http://localhost').pathname;
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(history|favorites|plays)/.test(url)) corps = [];
  const credits = url.match(/\/tracks\/(\d+)\/credits$/);
  if (credits) corps = CREDITS[Number(credits[1])] ?? [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let groupByOriginal: unknown;

function titre(): string | null | undefined {
  return hote?.querySelector('.track-title')?.textContent?.trim();
}
function pochette(): string | null | undefined {
  return hote?.querySelector('.artwork-clickable img')?.getAttribute('src');
}
function credits(): string {
  return hote?.querySelector('.inline-credits')?.textContent ?? '';
}

beforeEach(() => {
  locale.set('fr');
  // Safari 16 / iPadOS 16 : pas d'`Object.groupBy`.
  groupByOriginal = (Object as any).groupBy;
  delete (Object as any).groupBy;
  vi.stubGlobal('fetch', vi.fn(async (e: unknown) => reponse(String(typeof e === 'string' ? e : (e as Request)?.url ?? e))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  if (groupByOriginal) (Object as any).groupBy = groupByOriginal;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fil 3031 — « Lecture en cours » suit le changement de piste', () => {
  it('🔴 sans Object.groupBy (iPadOS < 17.4) : titre, pochette et crédits passent à la nouvelle piste', async () => {
    zones.set([{ id: 1, name: 'S/PDIF', state: 'playing', output_type: 'local', current_track: A, position_ms: 1000 }] as any);
    currentZoneId.set(1);
    queueTracks.set([] as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(NowPlaying, { target: hote, props: {} as any });
    flushSync();
    await vi.waitFor(() => { flushSync(); expect(credits()).toContain('Pianiste A'); });
    expect(titre()).toBe('Piste A');
    expect(pochette()).toMatch(/\/a\.jpg$/);

    // Suivant (ou enchaînement automatique) : la zone suivie change de piste.
    zones.update((zs) => zs.map((z) => ({ ...z, current_track: B as any, position_ms: 0 })));
    flushSync();
    await vi.waitFor(() => { flushSync(); expect(credits(), 'crédits restés sur la piste d’avant').toContain('Pianiste B'); });
    expect(titre(), 'l’écran reste sur la piste d’avant').toBe('Piste B');
    expect(pochette(), 'pochette restée sur la piste d’avant').toMatch(/\/b\.jpg$/);
    expect(credits()).not.toContain('Pianiste A');
  });

  it('un rôle de crédit absent ne fait rien lever', () => {
    expect(() => libelleRole(null as any, (c) => c)).not.toThrow();
    expect(libelleRole('', (c) => c)).toBe('Performer');
  });

  it('aucun Object.groupBy / Map.groupBy dans le client (cible Safari 14)', () => {
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) { if (nom !== '__tests__') parcourir(chemin); continue; }
        if (!/\.(ts|svelte)$/.test(nom) || /\.test\.ts$/.test(nom)) continue;
        if (/\b(Object|Map)\.groupBy\s*\(/.test(readFileSync(chemin, 'utf8'))) fautifs.push(chemin);
      }
    };
    parcourir('src');
    expect(fautifs).toEqual([]);
  });
});
