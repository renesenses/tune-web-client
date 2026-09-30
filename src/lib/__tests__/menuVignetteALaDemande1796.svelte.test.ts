// @vitest-environment jsdom
/**
 * #1796 — le menu d'une vignette n'est MONTÉ qu'à la première interaction.
 *
 * Décision de Bertrand du 29/09/2026 : chaque vignette de la bibliothèque
 * montait son propre `MenuObjetV2` (états, dérivés, effet) pour un menu qu'on
 * n'ouvre que sur une vignette à la fois. Il se monte désormais au premier
 * survol, au premier focus clavier ou au clic — sans rien changer de ce qu'on
 * voit ni de ce qu'on peut faire.
 *
 * ## Comment on sait qu'un menu « existe »
 *
 * Fermé, `MenuObjetV2` ne rend rien dans le DOM (`bouton={false}`) : son
 * absence ne se lit donc pas dans le balisage. On COMPTE ses instances, en
 * enveloppant le vrai composant : chaque montage passe par l'enveloppe, qui
 * rend exactement ce que rend l'original (ses `basculer` / `fermer` compris).
 *
 * ## Ce que « complet » veut dire
 *
 * Le menu ouvert par la vignette a les MÊMES entrées, dans le même ordre, que
 * celui d'une ligne (`MenuObjetV2` avec son propre bouton) pour le même objet
 * et les mêmes gestes — et le bouton garde son rôle, ses `aria-*`, son focus
 * et la fermeture à Échap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';

const compteur = vi.hoisted(() => ({ montes: 0 }));
vi.mock('../../components/v2/MenuObjetV2.svelte', async (orig) => {
  // `orig()` rend le module DÉJÀ collecté : aucun chargement dans un cas (#1333).
  const vrai = (await orig()) as { default: (...a: unknown[]) => unknown };
  const Vrai = vrai.default;
  const Enveloppe = (...a: unknown[]) => {
    compteur.montes++;
    return Vrai(...a);
  };
  return { ...vrai, default: Enveloppe };
});

import type { ObjetMenu } from '../gestesObjet';
import MenuObjetV2 from '../../components/v2/MenuObjetV2.svelte';
import PochetteActions from '../../components/v2/PochetteActions.svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';

const ALBUM: ObjetMenu = { type: 'album', id: 7, nom: 'Requiem', artisteId: 3, artisteNom: 'Mozart' };
const pochette = createRawSnippet(() => ({ render: () => '<i data-pochette></i>' }));
const ouvrir = () => {};

function reponse() {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  } as unknown as Response;
}

let hote: HTMLDivElement;
let montes: Record<string, any>[] = [];
function poser(C: any, props: Record<string, unknown>) {
  const m = mount(C, { target: hote, props: props as any });
  montes.push(m);
  flushSync();
  return m;
}

beforeEach(() => {
  compteur.montes = 0;
  vi.stubGlobal('fetch', vi.fn(async () => reponse()));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  for (const m of montes) { try { unmount(m); } catch { /* déjà démonté */ } }
  montes = [];
  hote.remove();
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

const coin = () => hote.querySelector<HTMLButtonElement>('.pa button.coin.bl');
const entrees = () => [...document.querySelectorAll<HTMLButtonElement>('.fond .menu button[role="menuitem"]')]
  .map((b) => b.dataset.cle ?? '');

/** Les entrées du MÊME objet dans une ligne — la référence de « complet ». */
function entreesDeReference(): string[] {
  const m = poser(MenuObjetV2, { objet: ALBUM, gestes: { ouvrir }, nom: 'Requiem' });
  const b = hote.querySelector<HTMLButtonElement>('button.mo-bouton');
  expect(b, 'la ligne témoin n’a pas de bouton').not.toBeNull();
  b!.click();
  flushSync();
  const cles = entrees();
  unmount(m);
  montes = montes.filter((x) => x !== m);
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  compteur.montes = 0;
  return cles;
}

function vignette() {
  poser(PochetteActions, { children: pochette, objet: ALBUM, onOuvrir: ouvrir, nom: 'Requiem' });
}

/** Le bouton est celui d'avant : présent, focalisable, annoncé comme un menu. */
function boutonIntact(b: HTMLButtonElement | null, ouvert: boolean) {
  expect(b, 'le coin du menu a disparu').not.toBeNull();
  expect(b!.tagName).toBe('BUTTON');
  expect(b!.disabled).toBe(false);
  expect(b!.tabIndex).toBe(0);
  expect(b!.getAttribute('aria-haspopup')).toBe('menu');
  expect(b!.getAttribute('aria-expanded')).toBe(String(ouvert));
  expect(b!.getAttribute('aria-label')).toBe(b!.getAttribute('title'));
  expect(b!.getAttribute('aria-label')).toBeTruthy();
}

describe('#1796 — avant toute interaction, aucun menu n’est monté', () => {
  it('une vignette seule : le bouton est là, le menu non', () => {
    vignette();
    boutonIntact(coin(), false);
    expect(compteur.montes, 'le menu est monté avec la vignette').toBe(0);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('une grille de 260 albums de la Bibliothèque : 260 boutons, zéro menu', { timeout: 30000 }, async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set(Array.from({ length: 260 }, (_, i) => ({
      id: i + 1, title: `A${String(i).padStart(3, '0')}`, artist_name: 'X', year: 2000, cover_path: null, source: 'local',
    })) as any);
    try {
      poser(LibraryV2, {});
      await new Promise((r) => setTimeout(r, 30));
      flushSync();
      const coins = hote.querySelectorAll('.grid .card .pa button.coin.bl');
      expect(coins.length, 'la grille n’a pas ses 260 boutons de menu').toBe(260);
      expect(compteur.montes, 'la grille monte encore un menu par vignette').toBe(0);

      // Et le survol d'UNE vignette en monte UN, pas 260.
      hote.querySelectorAll<HTMLElement>('.grid .card .pa')[5].dispatchEvent(new Event('pointerenter'));
      flushSync();
      expect(compteur.montes).toBe(1);
    } finally {
      albums.set([] as any);
    }
  });

  it('une vignette SANS menu (radio) ne monte rien, même survolée ou focalisée', () => {
    poser(PochetteActions, { children: pochette, objet: { type: 'radio', id: 3, nom: 'FIP' }, onOuvrir: ouvrir });
    expect(coin()).toBeNull();
    const pa = hote.querySelector<HTMLElement>('.pa')!;
    pa.dispatchEvent(new Event('pointerenter'));
    hote.querySelector<HTMLButtonElement>('.pa button.ouvrir')!.focus();
    flushSync();
    expect(compteur.montes).toBe(0);
  });
});

describe('#1796 — après la première interaction, le menu est complet', () => {
  const INTERACTIONS: [string, (b: HTMLButtonElement) => void][] = [
    ['un survol', () => hote.querySelector<HTMLElement>('.pa')!.dispatchEvent(new Event('pointerenter'))],
    ['un focus clavier', (b) => b.focus()],
    ['un clic', (b) => b.click()],
  ];

  for (const [nomGeste, geste] of INTERACTIONS) {
    it(`après ${nomGeste}`, () => {
      const reference = entreesDeReference();
      expect(reference.length, 'la référence est vide : le cas ne prouverait rien').toBeGreaterThan(5);

      vignette();
      expect(compteur.montes).toBe(0);
      const b = coin()!;
      geste(b);
      flushSync();
      expect(compteur.montes, `le menu n’est pas monté après ${nomGeste}`).toBe(1);

      // Le clic ouvre déjà ; survol et focus ont seulement préparé.
      if (nomGeste !== 'un clic') {
        expect(document.querySelector('[role="menu"]'), 'le menu s’est ouvert tout seul').toBeNull();
        b.click();
        flushSync();
      }
      expect(entrees(), 'le menu de la vignette n’a pas les entrées de la ligne').toEqual(reference);
      boutonIntact(coin(), true);
      expect(compteur.montes, 'le menu a été monté deux fois').toBe(1);

      // Échap referme, et le bouton le dit.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      flushSync();
      expect(document.querySelector('[role="menu"]')).toBeNull();
      boutonIntact(coin(), false);

      // Un second clic rouvre le même menu, sans en monter un autre.
      coin()!.click();
      flushSync();
      expect(entrees()).toEqual(reference);
      expect(compteur.montes).toBe(1);
    });
  }

  it('le focus clavier reste sur le bouton pendant le montage', () => {
    vignette();
    const b = coin()!;
    b.focus();
    flushSync();
    expect(document.activeElement).toBe(b);
    expect(compteur.montes).toBe(1);
  });
});
