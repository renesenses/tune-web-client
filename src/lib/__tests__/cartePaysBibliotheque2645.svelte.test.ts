// @vitest-environment jsdom
/**
 * renesenses/tune-web-client#2645 — la carte du monde de la Bibliothèque,
 * montée : un clic sur un pays filtre la grille, la croix retire le filtre, et
 * une bibliothèque sans pays montre un message propre au lieu d'un globe vide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import CartePaysBibliothequeV2 from '../../components/v2/CartePaysBibliothequeV2.svelte';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

let hote: HTMLDivElement;
let montes: Record<string, any>[] = [];
let facette: { value: string; count: number }[];
let appels: string[];

const json = (corps: unknown) => new Response(JSON.stringify(corps), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

function route(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  if (u.pathname.endsWith('/library/facets')) return { country: facette };
  if (u.pathname.endsWith('/library/albums-detailed')) {
    const pays = u.searchParams.getAll('country');
    // Les albums 1 et 3 sont parus en France ; « fr » en minuscules compte aussi.
    const ids = pays.some((p) => p.toUpperCase() === 'FR') ? [1, 3] : pays.includes('JP') ? [4] : [];
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const items = offset ? [] : ids.map((album_id) => ({ album_id }));
    return { items, total: ids.length };
  }
  return [];
}

async function stabiliser() {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function poser(C: any, props: Record<string, unknown>) {
  const m = mount(C, { target: hote, props: props as any });
  montes.push(m);
  flushSync();
  return m;
}
const titres = () => [...hote.querySelectorAll('.grid .card')].map((c) => c.textContent ?? '');
const compteTitres = (t: string) => titres().filter((x) => x.includes(t)).length;

beforeEach(() => {
  locale.set('fr');
  appels = [];
  facette = [{ value: 'FR', count: 12 }, { value: 'fr', count: 2 }, { value: 'JP', count: 3 }, { value: 'XE', count: 5 }];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { appels.push(String(url)); return json(route(String(url))); }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  for (const m of montes) { try { unmount(m); } catch { /* déjà démonté */ } }
  montes = [];
  hote.remove();
  albums.set([] as any);
  vi.unstubAllGlobals();
});

describe('#2645 — clic sur un pays = filtre de la Bibliothèque', () => {
  it('choisir la France ne garde que ses albums ; la croix rend toute la bibliothèque', { timeout: 30000 }, async () => {
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set([
      { id: 1, title: 'Paris-Un', artist_name: 'A', year: 2000, cover_path: null, source: 'local' },
      { id: 2, title: 'Berlin-Deux', artist_name: 'B', year: 2001, cover_path: null, source: 'local' },
      { id: 3, title: 'Lyon-Trois', artist_name: 'C', year: 2002, cover_path: null, source: 'local' },
      { id: 4, title: 'Tokyo-Quatre', artist_name: 'D', year: 2003, cover_path: null, source: 'local' },
    ] as any);
    poser(LibraryV2, {});
    await stabiliser();
    expect(titres().length, 'la grille de départ n’a pas ses 4 albums').toBe(4);

    // La puce ouvre la carte, qui lit la facette country.
    const puce = hote.querySelector<HTMLButtonElement>('[data-carte-pays-puce]');
    expect(puce, 'la puce Pays manque').not.toBeNull();
    puce!.click();
    await stabiliser();
    expect(appels.some((u) => u.includes('/library/facets') && u.includes('fields=country'))).toBe(true);
    const carte = hote.querySelector('[data-carte-pays]');
    expect(carte).not.toBeNull();
    // XE (Europe) n'est pas un pays de la carte ; FR et fr n'en font qu'un.
    expect([...carte!.querySelectorAll('[data-pays]')].map((b) => (b as HTMLElement).dataset.pays)).toEqual(['FR', 'JP']);

    hote.querySelector<HTMLButtonElement>('[data-pays="FR"]')!.click();
    await stabiliser();

    const requete = appels.find((u) => u.includes('/library/albums-detailed') && u.includes('country='));
    expect(requete, 'aucun appel albums-detailed avec le pays').toBeDefined();
    const params = new URL(requete!, 'http://localhost').searchParams.getAll('country');
    expect(params.sort()).toEqual(['FR', 'fr']);
    expect(titres().length, 'le filtre de pays n’a rien retiré').toBe(2);
    expect(compteTitres('Paris-Un')).toBe(1);
    expect(compteTitres('Lyon-Trois')).toBe(1);
    expect(puce!.textContent).toContain('France');
    expect(hote.querySelector('[data-pays="FR"]')!.getAttribute('aria-pressed')).toBe('true');

    hote.querySelector<HTMLButtonElement>('[data-carte-pays-retirer]')!.click();
    await stabiliser();
    expect(titres().length, 'retirer le pays ne rend pas toute la bibliothèque').toBe(4);
  });
});

describe('#2645 — bibliothèque sans pays', () => {
  it('message vide propre, ni globe ni liste', async () => {
    facette = [];
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    const vide = hote.querySelector('[data-carte-vide]');
    expect(vide, 'pas de message vide').not.toBeNull();
    expect(vide!.textContent).toContain('Aucun pays renseigné');
    expect(hote.querySelector('canvas')).toBeNull();
    expect(hote.querySelector('[data-pays]')).toBeNull();
  });

  it('seulement des pays hors carte : message vide, et le nombre hors carte est dit', async () => {
    facette = [{ value: 'XW', count: 9 }];
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    expect(hote.querySelector('[data-carte-vide]')).not.toBeNull();
    expect(hote.textContent).toContain('9 morceaux portent un pays absent de la carte');
  });

  it('un seul morceau : le singulier, et le nom entier au survol', async () => {
    facette = [{ value: 'VC', count: 1 }, { value: 'XE', count: 1 }];
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    const ligne = hote.querySelector('[data-pays="VC"]')!;
    expect(ligne.textContent).toContain('1 morceau');
    expect(ligne.textContent).not.toContain('1 morceaux');
    expect(hote.textContent).toContain('1 morceau porte un pays absent de la carte');
    const nom = ligne.querySelector('.nom')!;
    expect(nom.getAttribute('title')).toBe(nom.textContent);
  });

  it('un serveur en erreur : un message, pas un écran blanc', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    expect(hote.querySelector('[data-carte-erreur]')).not.toBeNull();
  });
});

describe('#2710 / #2691 — vignette compacte et rail A–Z', () => {
  it('la carte est compacte par défaut, le bouton l’agrandit et la ramène', async () => {
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    const carte = hote.querySelector<HTMLElement>('[data-carte-pays]')!;
    expect(carte.dataset.carteMode).toBe('compacte');
    expect(carte.classList.contains('compacte')).toBe(true);
    expect(carte.querySelector('canvas')!.style.width).toBe('200px');
    expect(carte.querySelector('[data-pays]'), 'la liste reste dans le DOM').not.toBeNull();
    const bouton = carte.querySelector<HTMLButtonElement>('[data-carte-agrandir]')!;
    bouton.click(); await stabiliser();
    expect(carte.dataset.carteMode).toBe('grande');
    expect(carte.querySelector('canvas')!.style.width).toBe('320px');
    bouton.click(); await stabiliser();
    expect(carte.dataset.carteMode).toBe('compacte');
  });

  it('dans la Bibliothèque : carte compacte, grille visible, filtre actif, rail dans le corps sous la carte', { timeout: 30000 }, async () => {
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set([
      { id: 1, title: 'Paris-Un', artist_name: 'A', year: 2000, cover_path: null, source: 'local' },
      { id: 4, title: 'Tokyo-Quatre', artist_name: 'D', year: 2003, cover_path: null, source: 'local' },
    ] as any);
    poser(LibraryV2, {});
    await stabiliser();
    hote.querySelector<HTMLButtonElement>('[data-carte-pays-puce]')!.click();
    await stabiliser();
    const carte = hote.querySelector<HTMLElement>('[data-carte-pays]')!;
    expect(carte.dataset.carteMode).toBe('compacte');
    const grille = hote.querySelector('.grid');
    expect(grille, 'la grille manque').not.toBeNull();
    expect(titres().length).toBe(2);
    // La grille et le rail sont dans .body, APRÈS la carte : le rail ne peut pas être dans la carte.
    const corps = hote.querySelector('.body')!;
    expect(corps.contains(carte)).toBe(false);
    expect(carte.compareDocumentPosition(corps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(carte.querySelector('.rail')).toBeNull();
    expect(corps.contains(grille!)).toBe(true);
    hote.querySelector<HTMLButtonElement>('[data-pays="JP"]')!.click();
    await stabiliser();
    expect(titres().length).toBe(1);
    // Agrandie : le rail se masque par la règle :has (structure : l'attribut de mode est posé).
    carte.querySelector<HTMLButtonElement>('[data-carte-agrandir]')!.click();
    await stabiliser();
    expect(hote.querySelector('[data-carte-mode="grande"]')).not.toBeNull();
  });
});
