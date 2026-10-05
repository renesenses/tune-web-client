// @vitest-environment jsdom
//
// Fil forum 2149 (Tune 1.0.0-rc2, macOS, 109 152 pistes) — « lenteur lors de
// l'ouverture d'un raccourci vers une smart collection ».
//
// Le raccourci rouvre la collection par `tune:shortcut-restore`, 150 ms après
// l'écran (`stores/shortcuts.ts`). À ce moment la LISTE est encore en route :
// `GET /library/smart-collections` compte chaque collection sur toute la
// bibliothèque (le journal du testeur : 4 s pour un seul de ces comptes). Le
// gestionnaire ne trouvait donc pas la collection, relançait `charger()` — une
// SECONDE liste complète — et n'ouvrait la collection qu'à son retour.
//
// Ce témoin MONTE l'écran, RETIENT la réponse de la liste, et envoie le
// raccourci pendant ce temps. Il exige : les albums de la collection visée
// demandés tout de suite, une seule liste demandée, et la fiche qui prend le
// vrai nom quand la liste arrive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { dialogs } from '../stores/dialogs';

let requetes: string[] = [];
let libererLaListe: () => void = () => {};
let listeRetenue: Promise<void> = Promise.resolve();

const smart = [
  { id: 7, name: 'Jazz', description: null, rules: [], match_mode: 'all', album_count: 1, covers: [] },
  { id: 8, name: 'Rock', description: null, rules: [], match_mode: 'all', album_count: 0, covers: [] },
];

function corps(chemin: string): unknown {
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) {
    return [{ id: 1, title: 'Blue Train', artist_name: 'Coltrane', cover_path: '/p/bt.jpg' }];
  }
  if (chemin.endsWith('/library/smart-collections')) return smart;
  return [];
}

class Inerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  localStorage.clear();
  listeRetenue = new Promise((r) => { libererLaListe = r; });
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    requetes.push(chemin);
    // La liste des collections intelligentes est LENTE : retenue jusqu'à
    // ce que le témoin la libère.
    if (chemin.endsWith('/library/smart-collections')) await listeRetenue;
    const c = corps(chemin);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  libererLaListe();
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function tourner(tours = 12) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function attendreQue(condition: () => boolean, tours = 200): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return condition();
}

const listes = () => requetes.filter((c) => c.endsWith('/library/smart-collections'));
const albumsDe = (id: number) => requetes.filter((c) => c.endsWith(`/smart-collections/${id}/albums`));

describe('Fil 2149 — un raccourci vers une collection intelligente n’attend pas la liste', () => {
  it('la collection s’ouvre pendant que la liste est en route, sans seconde liste', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(CollectionsV2, { target: hote, props: {} as any });
    flushSync();
    expect(await attendreQue(() => listes().length === 1), `la liste part : ${requetes.join(', ')}`).toBe(true);

    // Le raccourci, pendant que la liste est retenue.
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { view: 'collections', target: { key: 'smartcollections:7', restore: { id: 7, name: 'Jazz' } } },
    }));
    await tourner();

    expect(
      albumsDe(7).length,
      '🔴 fil 2149 — les albums de la collection visée attendent la liste complète',
    ).toBe(1);
    expect(listes().length, '🔴 fil 2149 — le raccourci relance une seconde liste complète').toBe(1);
    expect(hote.querySelector('h1')?.textContent).toContain('Jazz');

    // La liste arrive : la fiche provisoire devient la vraie, sans rien redemander.
    libererLaListe();
    await tourner(20);
    expect(listes().length).toBe(1);
    expect(albumsDe(7).length).toBe(1);
    expect(hote.querySelector('h1')?.textContent).toContain('Jazz');
    expect(hote.textContent).toContain('Blue Train');
  });

  it('une collection supprimée entre-temps se referme quand la liste arrive', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(CollectionsV2, { target: hote, props: {} as any });
    flushSync();
    expect(await attendreQue(() => listes().length === 1)).toBe(true);
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { view: 'collections', target: { key: 'smartcollections:99', restore: { id: 99, name: 'Disparue' } } },
    }));
    await tourner();
    expect(hote.querySelector('h1')?.textContent).toContain('Disparue');
    libererLaListe();
    await tourner(20);
    expect(hote.querySelector('h1')?.textContent ?? '').not.toContain('Disparue');
  });

  it('témoin : la liste déjà là, le raccourci ouvre l’entrée connue sans rien relire', async () => {
    libererLaListe();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(CollectionsV2, { target: hote, props: {} as any });
    flushSync();
    expect(await attendreQue(() => listes().length === 1)).toBe(true);
    await tourner(20);
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { view: 'collections', target: { key: 'smartcollections:8', restore: { id: 8, name: 'Rock' } } },
    }));
    await tourner();
    expect(albumsDe(8).length).toBe(1);
    expect(listes().length).toBe(1);
    expect(hote.querySelector('h1')?.textContent).toContain('Rock');
  });
});
