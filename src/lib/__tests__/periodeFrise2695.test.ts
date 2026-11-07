// @vitest-environment jsdom
/**
 * web#2695 — Bibliothèque › Albums › vue Années : choisir une PÉRIODE.
 *
 * Bertrand, 07/11/2026 : deux champs « De » / « À » au-dessus de la frise,
 * deux poignées sur la frise, synchronisés ; la période filtre la grille
 * selon l'année retenue, se cumule avec les filtres et la recherche, affiche
 * le nombre d'albums, s'efface, et vit dans l'adresse de la page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import {
  anneeAuClavier, anneeSaisie, anneeSousLePointeur, dansPeriode, ecrirePeriode, lirePeriode,
} from '../periodeAnnees';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const cd = { format: 'FLAC', sample_rate: 44100, bit_depth: 16 };
const hr = { format: 'FLAC', sample_rate: 96000, bit_depth: 24 };
const CATALOGUE: Album[] = [
  { id: 1, title: 'Avant 1965', artist_name: 'A', year: 1965, source: 'local', ...cd },
  { id: 2, title: 'Borne basse 1970', artist_name: 'A', year: 1970, source: 'local', ...cd },
  { id: 3, title: 'Rouge 1975', artist_name: 'B', year: 1975, source: 'local', ...hr },
  { id: 4, title: 'Rouge 1976', artist_name: 'B', year: 1976, source: 'local', ...cd },
  { id: 5, title: 'Bleu 1977', artist_name: 'C', year: 1977, source: 'local', ...hr },
  { id: 6, title: 'Borne haute 1979', artist_name: 'A', year: 1979, source: 'local', ...cd },
  { id: 7, title: 'Après 1980', artist_name: 'A', year: 1980, source: 'local', ...cd },
  { id: 8, title: 'Sans date', artist_name: 'A', source: 'local', ...cd },
  // Édition 1994, origine 1975 : dans 1970–1979 en « origine sinon édition »,
  // hors période en « année d'édition ».
  { id: 9, title: 'Réédition', artist_name: 'D', year: 1994, original_year: 1975, source: 'local', ...cd },
] as Album[];

function reponse(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  history.replaceState(null, '', '/#library');
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (u: any) => {
    const url = String(typeof u === 'string' ? u : u?.url ?? u);
    if (/\/library\/albums/.test(url)) return reponse({ items: CATALOGUE, total: CATALOGUE.length, limit: 500, offset: 0 });
    return reponse([]);
  }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(CATALOGUE);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albums.set([]);
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ecran(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await flush();
  return hote;
}
const bouton = (el: HTMLElement, sel: string, texte: string) =>
  [...el.querySelectorAll<HTMLButtonElement>(sel)].find((b) => b.textContent?.trim().startsWith(texte)) ?? null;
async function vueAnnees(el: HTMLElement) {
  const b = bouton(el, '.navmode > button', 'Années');
  expect(b, 'le bouton Années manque').not.toBeNull();
  b!.click();
  await flush();
}
const champ = (el: HTMLElement, cote: 'de' | 'a') => el.querySelector<HTMLInputElement>(`.periode-${cote}`)!;
async function saisir(el: HTMLElement, cote: 'de' | 'a', v: string) {
  const c = champ(el, cote);
  expect(c, `le champ ${cote} manque`).not.toBeNull();
  c.value = v;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}
const corps = (el: HTMLElement) => el.querySelector('.body')!.textContent ?? '';
function grilleMontre(el: HTMLElement, attendus: string[], absents: string[]) {
  const t = corps(el);
  for (const a of attendus) expect(t, `« ${a} » devrait être affiché`).toContain(a);
  for (const a of absents) expect(t, `« ${a} » ne devrait pas être affiché`).not.toContain(a);
}

describe('règles de la période (lib/periodeAnnees)', () => {
  it('bornes comprises, ordre indifférent, sans année exclu', () => {
    const p = { de: 1970, a: 1979 };
    expect(dansPeriode(1970, p)).toBe(true);
    expect(dansPeriode(1979, p)).toBe(true);
    expect(dansPeriode(1969, p)).toBe(false);
    expect(dansPeriode(1980, p)).toBe(false);
    expect(dansPeriode(null, p)).toBe(false);
    expect(dansPeriode(1975, { de: 1979, a: 1970 })).toBe(true);
    expect(dansPeriode(1975, { de: 1976, a: null })).toBe(false);
    expect(dansPeriode(null, { de: null, a: null })).toBe(true);
  });
  it('adresse, saisie, clavier et pointeur', () => {
    expect(lirePeriode('?annees=1970-1979')).toEqual({ de: 1970, a: 1979 });
    expect(lirePeriode('?v2=1&annees=-1979')).toEqual({ de: null, a: 1979 });
    expect(lirePeriode('?annees=n%27importe')).toEqual({ de: null, a: null });
    expect(ecrirePeriode('?v2=1', { de: 1970, a: null })).toBe('?v2=1&annees=1970-');
    expect(ecrirePeriode('?v2=1&annees=1970-', { de: null, a: null })).toBe('?v2=1');
    expect(anneeSaisie('19')).toBeNull();
    expect(anneeSaisie(' 1975 ')).toBe(1975);
    expect(anneeAuClavier('ArrowRight', 1979, 1965, 1994)).toBe(1980);
    expect(anneeAuClavier('PageDown', 1970, 1965, 1994)).toBe(1965);
    expect(anneeAuClavier('End', 1970, 1965, 1994)).toBe(1994);
    expect(anneeAuClavier('a', 1970, 1965, 1994)).toBeNull();
    expect(anneeSousLePointeur(-50, 300, 1965, 30)).toBe(1965);
    expect(anneeSousLePointeur(155, 300, 1965, 30)).toBe(1980);
    expect(anneeSousLePointeur(9999, 300, 1965, 30)).toBe(1994);
  });
});

describe('Bibliothèque › Années : la période De / À (web#2695)', () => {
  it('les deux champs filtrent la grille, bornes comprises, et le compte s’affiche', async () => {
    const el = await ecran();
    await vueAnnees(el);
    grilleMontre(el, ['Avant 1965', 'Après 1980', 'Sans date'], []);
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1979');
    grilleMontre(el,
      ['Borne basse 1970', 'Rouge 1975', 'Rouge 1976', 'Bleu 1977', 'Borne haute 1979', 'Réédition'],
      ['Avant 1965', 'Après 1980', 'Sans date']);
    expect(el.querySelector('.periode-n')?.textContent).toContain('6');
    // L'écran dit que l'album sans année est écarté.
    expect(el.querySelector('.periode-sans')?.textContent).toContain('1');
    expect(location.search).toBe('?annees=1970-1979');
  });

  it('une poignée déplacée au clavier met le champ à jour', async () => {
    const el = await ecran();
    await vueAnnees(el);
    const de = el.querySelector<HTMLElement>('.poignee-de')!;
    const a = el.querySelector<HTMLElement>('.poignee-a')!;
    expect(de.getAttribute('role')).toBe('slider');
    expect(de.getAttribute('aria-valuemin')).toBe('1965');
    // En « origine sinon édition », la Réédition compte pour 1975 : la frise finit en 1980.
    expect(de.getAttribute('aria-valuemax')).toBe('1980');
    expect(de.getAttribute('aria-valuenow')).toBe('1965');
    for (let i = 0; i < 5; i++) de.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flush();
    expect(champ(el, 'de').value).toBe('1970');
    expect(de.getAttribute('aria-valuenow')).toBe('1970');
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    await flush();
    expect(champ(el, 'a').value).toBe('1970');
    grilleMontre(el, ['Borne basse 1970'], ['Avant 1965', 'Rouge 1975', 'Après 1980', 'Sans date']);
    // Et dans l'autre sens : le champ déplace la poignée.
    await saisir(el, 'a', '1979');
    expect(a.getAttribute('aria-valuenow')).toBe('1979');
  });

  it('la période se cumule avec la recherche et un filtre de qualité', async () => {
    const el = await ecran();
    await vueAnnees(el);
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1979');
    const rech = el.querySelector<HTMLInputElement>('.v2-rech input')!;
    rech.value = 'rouge';
    rech.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    grilleMontre(el, ['Rouge 1975', 'Rouge 1976'], ['Bleu 1977', 'Borne basse 1970']);
    bouton(el, '.filters button.chip', 'Qualité')!.click();
    await flush();
    bouton(el, '.filters .drop.open .menu button', 'Hi-Res')!.click();
    await flush();
    grilleMontre(el, ['Rouge 1975'], ['Rouge 1976', 'Bleu 1977']);
    // Resserrer la période fait sortir le dernier album restant.
    await saisir(el, 'de', '1976');
    expect(corps(el)).not.toContain('Rouge 1975');
  });

  it('« Effacer » retire la période, des champs comme de l’adresse', async () => {
    const el = await ecran();
    await vueAnnees(el);
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1979');
    expect(corps(el)).not.toContain('Après 1980');
    bouton(el, '.periode-effacer', 'Effacer')!.click();
    await flush();
    grilleMontre(el, ['Avant 1965', 'Après 1980', 'Sans date', 'Rouge 1975'], []);
    expect(champ(el, 'de').value).toBe('');
    expect(champ(el, 'a').value).toBe('');
    expect(location.search).toBe('');
    expect(el.querySelector('.periode-effacer')).toBeNull();
  });

  it('la période est relue depuis l’adresse de la page', async () => {
    history.replaceState(null, '', '/?annees=1976-1979#library');
    const el = await ecran();
    // La frise s'ouvre d'elle-même : un filtre posé doit se voir.
    expect(el.querySelector('.frise'), 'la frise n’est pas affichée').not.toBeNull();
    expect(champ(el, 'de').value).toBe('1976');
    expect(champ(el, 'a').value).toBe('1979');
    grilleMontre(el, ['Rouge 1976', 'Borne haute 1979'], ['Rouge 1975', 'Avant 1965', 'Après 1980']);
  });

  it('le changement d’année retenue est respecté', async () => {
    const el = await ecran();
    await vueAnnees(el);
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1979');
    expect(corps(el)).toContain('Réédition');
    bouton(el, '.anmodes button', 'Année d\'édition')!.click();
    await flush();
    // 1994 en édition : hors période. La période, elle, reste posée.
    expect(corps(el)).not.toContain('Réédition');
    expect(champ(el, 'de').value).toBe('1970');
    bouton(el, '.anmodes button', 'Origine sinon édition')!.click();
    await flush();
    expect(corps(el)).toContain('Réédition');
  });

  it('le mode A–Z ne lit pas la période, et y passer la retire', async () => {
    const el = await ecran();
    await vueAnnees(el);
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1979');
    bouton(el, '.navmode > button', 'A–Z')!.click();
    await flush();
    expect(el.querySelector('.periode')).toBeNull();
    grilleMontre(el, ['Avant 1965', 'Après 1980', 'Sans date'], []);
    expect(location.search).toBe('');
  });
});
