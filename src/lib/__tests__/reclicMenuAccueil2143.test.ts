// @vitest-environment jsdom
//
// Fil forum 2143, point 7 — FabienM, v1.0.0-rc2 : recliquer le menu où l'on
// se trouve ne ramène pas à son accueil.
//
// `Sidebar.go()` émettait bien `requestListReset()`, mais deux écrans
// seulement l'écoutaient (Bibliothèque, Playlists, #3843). Les autres
// restaient sur leur détail.
//
// Le correctif passe par la porte que tous les écrans à calque suivent déjà :
// `detailOuvert` (le Précédent du navigateur les referme par elle). Les
// Podcasts, qui ne la suivent pas, écoutent le signal de la barre.
//
// 🔴 CES TÉMOINS CLIQUENT : la vraie coquille, la vraie barre, le bouton actif.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const TAG = { id: 4, name: 'Etiquette temoin', color: '#808080' };
const FLUX = 'https://exemple.test/flux.xml';

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(url: string): unknown {
  if (url.includes('/tags/4/albums')) return { albums: [], count: 0 };
  if (url.includes('/tags/4/tracks')) return { tracks: [], count: 0 };
  if (url.includes('/tags/4/artists')) return { artists: [], count: 0 };
  if (url.includes('/tags/4/playlists')) return { playlists: [], count: 0 };
  if (url.includes('/tags/4/')) return {};
  if (/\/tags\/?(\?|$)/.test(url)) return [TAG];
  if (url.includes('/podcasts/episodes')) return [];
  return COLLECTIONS.test(url) ? [] : {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

function recliquerLeMenuActif(el: HTMLElement) {
  const actif = el.querySelector<HTMLButtonElement>('button.nav.active');
  expect(actif, 'aucune entrée active dans la barre latérale').not.toBeNull();
  actif!.click();
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const corps = corpsPour(String(input));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  vueDeRetour.set(null);
  detailOuvert.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('fil 2143 point 7 — recliquer le menu actif ramène à son accueil', () => {
  it('🔴 Étiquettes : l’étiquette ouverte se referme', async () => {
    const el = poserLaCoquille();
    activeView.set('tags');
    await souffler();
    const tuile = [...el.querySelectorAll<HTMLButtonElement>('button.tag')]
      .find((b) => b.textContent?.includes(TAG.name));
    expect(tuile, 'l’étiquette n’est pas listée — le témoin ne mesure rien').toBeTruthy();
    tuile!.click();
    await souffler();
    expect(get(detailOuvert)).toBe('etiquette:4');
    expect(el.querySelector('button.tag'), 'l’étiquette ne s’est pas ouverte').toBeNull();

    recliquerLeMenuActif(el);
    await souffler();

    expect(get(activeView)).toBe('tags');
    expect(get(detailOuvert), 'la clé du détail survit au reclic').toBeNull();
    expect(
      el.querySelector('button.tag'),
      'l’étiquette reste ouverte après le reclic sur « Étiquettes » — fil 2143, point 7',
    ).not.toBeNull();
  });

  it('🔴 Podcasts : la fiche du podcast se referme', async () => {
    const el = poserLaCoquille();
    activeView.set('podcasts');
    await souffler();
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { target: { key: `podcasts:${FLUX}`, restore: { feed: FLUX, name: 'Podcast temoin' } } },
    }));
    await souffler();
    expect(el.querySelector('.v2-pod .detail, .detail'), 'la fiche du podcast ne s’ouvre pas').not.toBeNull();

    recliquerLeMenuActif(el);
    await souffler();

    expect(get(activeView)).toBe('podcasts');
    expect(
      el.querySelector('.detail'),
      'la fiche du podcast reste ouverte après le reclic sur « Podcasts » — fil 2143, point 7',
    ).toBeNull();
  });
});
