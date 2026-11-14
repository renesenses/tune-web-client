// @vitest-environment jsdom
//
// Recette de Bertrand sur le .18 (14/11) — Bibliothèque › Statistiques : les
// champs « Chercher un artiste » / « Chercher un genre » (web#2969) sont là,
// mais taper un nom n'y fait rien. Le banc de web#2969 montait l'écran SEUL ;
// celui-ci le monte DANS la Bibliothèque, comme l'utilisateur le voit, et
// tape lettre à lettre (keydown + input), comme un clavier.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';

const STATS = {
  tracks: 10, albums: 3, artists: 2,
  distributions: {
    by_codec: [{ value: 'flac', tracks: 6 }, { value: 'mp3', tracks: 4 }],
    by_sample_rate: [{ value: 44100, tracks: 10 }],
    by_decade: [{ value: 1990, tracks: 10 }],
    by_credit_role: [],
  },
  rankings: {
    by_artist: { items: [{ value: 'Bach', tracks: 9 }, { value: 'Miles Davis', tracks: 3 }], total: 2967 },
    by_genre: { items: [{ value: 'Classique', tracks: 9 }, { value: 'Jazz', tracks: 3 }], total: 198 },
  },
};

function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => JSON.parse(texte), text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: string[] = [];

async function attendreQue(predicat: () => boolean, limite = 4000): Promise<void> {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    flushSync();
    if (predicat()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}

async function statistiquesOuvertes(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  flushSync();
  await attendreQue(() => !!hote!.querySelector('[data-stats-bibliotheque-ouvrir]'));
  hote.querySelector<HTMLButtonElement>('[data-stats-bibliotheque-ouvrir]')!.click();
  await attendreQue(() => !!hote!.querySelector('[data-recherche-classement="by_artist"]'));
  return hote;
}

/** Une frappe au clavier : keydown (que la Bibliothèque écoute), puis la saisie. */
function frappe(champ: HTMLInputElement, touche: string) {
  const ev = new KeyboardEvent('keydown', { key: touche, bubbles: true, cancelable: true });
  champ.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  champ.value += touche;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

const espaces = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(String(url), 'http://tune.test');
    appels.push(u.pathname + u.search);
    const p = u.pathname.replace(/^\/api\/v1/, '');
    if (p === '/library/stats') return reponse(STATS);
    if (p === '/library/stats/rankings') {
      const by = u.searchParams.get('by');
      return reponse(by === 'artist'
        ? { by, items: [{ rank: 31, value: 'Genesis', tracks: 406 }], matched: 1, total: 2967 }
        : { by, items: [{ rank: 2, value: 'Jazz', tracks: 15090 }, { rank: 8, value: 'Jazz Europe', tracks: 1629 }], matched: 2, total: 198 });
    }
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  pendingLibraryFiltre.set(null);
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set([] as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

// Monter la Bibliothèque entière est lent sur une machine chargée.
describe('Recette 14/11 — chercher dans les Statistiques, DANS la Bibliothèque', { timeout: 20_000 }, () => {
  it('🔴 taper « Genesis » au clavier interroge tout le classement et montre la ligne trouvée', async () => {
    const h = await statistiquesOuvertes();
    const champ = h.querySelector<HTMLInputElement>('[data-recherche-classement="by_artist"]')!;
    champ.focus();
    for (const c of 'Genesis') frappe(champ, c);
    expect(champ.value, 'des lettres tapées dans le champ des Statistiques se sont perdues').toBe('Genesis');
    await attendreQue(() => appels.some((a) => a.startsWith('/api/v1/library/stats/rankings')), 2000);
    expect(appels.filter((a) => a.includes('/library/stats/rankings')))
      .toContain('/api/v1/library/stats/rankings?by=artist&q=Genesis&limit=100');
    const carte = h.querySelector('[data-classement="by_artist"]')!;
    await attendreQue(() => espaces(carte.querySelector('li')?.textContent).includes('Genesis'));
    expect([...carte.querySelectorAll('li')].map((li) => espaces(li.textContent))).toEqual(['31 Genesis 406 pistes']);
  });

  it('🔴 taper « Jazz » dans la carte Genres rend les genres trouvés', async () => {
    const h = await statistiquesOuvertes();
    const champ = h.querySelector<HTMLInputElement>('[data-recherche-classement="by_genre"]')!;
    champ.focus();
    for (const c of 'Jazz') frappe(champ, c);
    const carte = h.querySelector('[data-classement="by_genre"]')!;
    await attendreQue(() => espaces(carte.querySelector('li')?.textContent).startsWith('2 Jazz'));
    expect(appels).toContain('/api/v1/library/stats/rankings?by=genre&q=Jazz&limit=100');
    expect([...carte.querySelectorAll('li')].map((li) => espaces(li.textContent)))
      .toEqual(['2 Jazz 15 090 pistes', '8 Jazz Europe 1 629 pistes']);
  });

  it('🔴 sur l’onglet Statistiques, l’en-tête ne propose pas « Rechercher dans Albums… »', async () => {
    const h = await statistiquesOuvertes();
    const entete = h.querySelector('.v2-lib > header.v2-top')!;
    expect(entete.querySelector('input'), 'le champ de l’en-tête cherche dans un onglet masqué').toBeNull();
    // Retour aux Albums : le champ revient.
    h.querySelector<HTMLButtonElement>('[data-onglet="albums"]')!.click();
    flushSync();
    expect(entete.querySelector('input')).not.toBeNull();
  });

  it('🔴 taper sans cliquer (#1872) écrit dans « Chercher un artiste », pas dans les Albums masqués', async () => {
    const h = await statistiquesOuvertes();
    (document.activeElement as HTMLElement | null)?.blur?.();
    for (const c of 'Genesis') {
      const cible = document.activeElement ?? document.body;
      const ev = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
      cible.dispatchEvent(ev);
      flushSync();
      // Une fois le champ focalisé, le navigateur écrit lui-même la lettre.
      if (!ev.defaultPrevented && cible instanceof HTMLInputElement) {
        cible.value += c;
        cible.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
      }
    }
    const champ = h.querySelector<HTMLInputElement>('[data-recherche-classement="by_artist"]')!;
    expect(document.activeElement, 'la frappe n’a pas atteint la recherche des Statistiques').toBe(champ);
    expect(champ.value).toBe('Genesis');
    const carte = h.querySelector('[data-classement="by_artist"]')!;
    await attendreQue(() => espaces(carte.querySelector('li')?.textContent).includes('Genesis'));
    expect(appels).toContain('/api/v1/library/stats/rankings?by=artist&q=Genesis&limit=100');
    expect([...carte.querySelectorAll('li')].map((li) => espaces(li.textContent))).toEqual(['31 Genesis 406 pistes']);
  });
});
