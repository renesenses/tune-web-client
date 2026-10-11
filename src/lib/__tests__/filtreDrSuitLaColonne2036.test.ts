// @vitest-environment jsdom
//
// web#2036 — Cyrille Moutia, forum, fil 2196 « Affichage DR », 09/10/2026 :
//
// > « Alors que DR n'est pas sélectionné dans affichage il est pourtant
// > visible sur la bibliothèque. »
//
// La case « DR » de Réglages > Affichage ne gouvernait que la COLONNE des
// listes de pistes. Le FILTRE « DR Indifférent – Indifférent » de la barre de
// la Bibliothèque était dessiné dès qu'un album portait un DR, sans lire ce
// réglage. Décision de Bertrand (09/10/2026) : décocher DR masque AUSSI le
// filtre.
//
// Trois choses sont tenues ici, sur l'écran MONTÉ :
//  1. DR décoché pour le mode courant ⇒ aucune pastille `.chip.dr` ;
//  2. DR coché ⇒ la pastille revient (la garde ne doit pas tout masquer) ;
//  3. un filtre DR ACTIF ne survit pas à son masquage : sinon la grille
//     resterait filtrée par une commande que l'utilisateur ne voit plus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { preferences } from '../stores/preferences';

/** Six albums : quatre avec un DR (6, 8, 12, 14), deux sans. */
const ALBUMS = [6, 8, 12, 14, null, null].map((dr, i) => ({
  id: i + 1,
  title: `Album ${String.fromCharCode(65 + i)}`,
  artist_name: `Artiste ${i}`,
  year: 2000 + i,
  cover_path: null,
  source: 'local',
  dynamic_range: dr,
}));

function reponsePour() {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(predicat: () => boolean, limite = 4000): Promise<void> {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    flushSync();
    if (predicat()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}

/** Coche ou décoche la colonne DR du mode Avancé, comme le fait l'écran des Réglages. */
function colonneDr(cochee: boolean) {
  preferences.update((p) => {
    const sans = (p.v2Colonnes?.expert ?? []).filter((c) => c !== 'dr');
    return {
      ...p,
      settingsLevel: 'expert',
      v2Colonnes: { ...p.v2Colonnes, expert: cochee ? [...sans, 'dr'] : sans },
    };
  });
  flushSync();
}

async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await attendreQue(() => !!hote!.querySelector('button.chip.count'));
  return hote;
}

const pastilleDr = (el: HTMLElement) => el.querySelector<HTMLElement>('.chip.dr');
const compteTout = (el: HTMLElement) => el.querySelector('button.chip.count')?.textContent ?? '';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  vi.stubGlobal('fetch', vi.fn(async () => reponsePour()));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([] as any);
  colonneDr(false);
  vi.unstubAllGlobals();
});

describe('web#2036 — le filtre DR de la Bibliothèque suit la case « DR » de l’Affichage', () => {
  it('DR coché : la pastille DR est là (contrôle — la garde ne masque pas tout)', async () => {
    colonneDr(true);
    const el = await ecranMonte();
    await attendreQue(() => !!pastilleDr(el));
    expect(pastilleDr(el), 'DR coché, des albums portent un DR : le filtre doit être proposé').not.toBeNull();
  });

  it('🔴 DR décoché : la pastille DR n’est PAS dessinée (Cyrille, fil 2196)', async () => {
    colonneDr(false);
    const el = await ecranMonte();
    await attendreQue(() => compteTout(el).includes('6'));
    expect(
      pastilleDr(el),
      'DR est décoché dans Réglages > Affichage, mais le filtre DR reste visible dans la Bibliothèque',
    ).toBeNull();
  });

  it('🔴 décocher DR pendant qu’un filtre DR est actif rend TOUTE la bibliothèque', async () => {
    colonneDr(true);
    const el = await ecranMonte();
    await attendreQue(() => !!pastilleDr(el));
    const min = pastilleDr(el)!.querySelector<HTMLSelectElement>('select')!;
    min.value = '12';
    min.dispatchEvent(new Event('change', { bubbles: true })); // Svelte 5 délègue `change` : l'évènement doit remonter
    await attendreQue(() => compteTout(el).includes('(2)'));
    expect(compteTout(el), 'le filtre DR ≥ 12 doit garder 2 albums sur 6').toContain('(2)');

    colonneDr(false);
    await attendreQue(() => compteTout(el).includes('(6)'));
    expect(pastilleDr(el)).toBeNull();
    expect(
      compteTout(el),
      'le filtre DR est masqué mais filtre encore : la grille reste à 2 albums',
    ).toContain('(6)');
  });
});
