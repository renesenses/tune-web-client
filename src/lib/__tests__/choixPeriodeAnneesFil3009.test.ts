// @vitest-environment jsdom
/**
 * Fil 3009 (FabienM, 1.0.0-rc13), point 19 — Bibliothèque › Albums, filtre
 * sur l'année : « très lourd la barre de sélection de l'année, de plus elle
 * prend beaucoup de place […]. Proposer une solution de sélection d'une
 * période et d'une année plus simple qui tienne dans la ligne "Année retenue,
 * origine sinon édition, …" ».
 *
 * La vue Années tient désormais en UNE ligne : la liste « Période » (toutes
 * les années, chaque décennie, chaque année qui a un album, « Autre
 * période… »), et la frise se déplie à la demande.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { decenniesDeLaListe, effetDuChoix, valeurDuChoix } from '../choixPeriodeAnnees';
import { SANS_PERIODE } from '../periodeAnnees';
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
/** web#2732 : l'adresse est écrite 300 ms après le dernier changement. */
const adresseEcrite = () => new Promise((r) => setTimeout(r, 380));
const corps = (el: HTMLElement) => el.querySelector('.body')!.textContent ?? '';
function grilleMontre(el: HTMLElement, attendus: string[], absents: string[]) {
  const t = corps(el);
  for (const a of attendus) expect(t, `« ${a} » devrait être affiché`).toContain(a);
  for (const a of absents) expect(t, `« ${a} » ne devrait pas être affiché`).not.toContain(a);
}

const liste = (el: HTMLElement) => el.querySelector<HTMLSelectElement>('.anbar select[data-choix-periode]');
async function choisir(el: HTMLElement, v: string) {
  const l = liste(el)!;
  l.value = v;
  l.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

describe('fil 3009 point 19 — les règles de la liste', () => {
  it('décennies et années qui ont un album, dans l’ordre demandé', () => {
    const bars = [{ year: 1968, n: 1 }, { year: 1969, n: 0 }, { year: 1970, n: 2 }, { year: 1975, n: 3 }, { year: 1976, n: 0 }];
    expect(decenniesDeLaListe(bars, 'desc')).toEqual([
      { decennie: 1970, n: 5, annees: [{ year: 1975, n: 3 }, { year: 1970, n: 2 }] },
      { decennie: 1960, n: 1, annees: [{ year: 1968, n: 1 }] },
    ]);
    expect(decenniesDeLaListe(bars, 'asc').map((d) => d.decennie)).toEqual([1960, 1970]);
  });
  it('la valeur affichée suit l’état, et le choix le produit', () => {
    expect(valeurDuChoix(null, SANS_PERIODE)).toBe('');
    expect(valeurDuChoix(1975, { de: 1970, a: 1979 })).toBe('a:1975');
    expect(valeurDuChoix(null, { de: 1970, a: 1979 })).toBe('d:1970');
    expect(valeurDuChoix(null, { de: 1965, a: 1972 })).toBe('perso');
    expect(effetDuChoix('a:1975', { de: 1970, a: 1979 })).toEqual({ annee: 1975, periode: SANS_PERIODE, perso: false });
    expect(effetDuChoix('d:1970', SANS_PERIODE)).toEqual({ annee: null, periode: { de: 1970, a: 1979 }, perso: false });
    expect(effetDuChoix('perso', { de: 1965, a: 1972 })).toEqual({ annee: null, periode: { de: 1965, a: 1972 }, perso: true });
    expect(effetDuChoix('', { de: 1965, a: 1972 })).toEqual({ annee: null, periode: SANS_PERIODE, perso: false });
  });
});

describe('fil 3009 point 19 — la vue Années tient dans la ligne « Année retenue »', () => {
  it('🔴 par défaut : la liste dans la ligne, ni frise ni rangée De / À', async () => {
    const el = await ecran();
    await vueAnnees(el);
    expect(liste(el), 'pas de liste « Période » dans la ligne « Année retenue »').not.toBeNull();
    expect(el.querySelector('.frise'), 'la frise est encore affichée d’office').toBeNull();
    expect(el.querySelector('.periode-de')).toBeNull();
    // Les années vides n'encombrent pas la liste : 7 années datées, 3 décennies
    // (« Réédition » se range en 1975, son année d'origine).
    const valeurs = [...liste(el)!.options].map((o) => o.value);
    expect(valeurs).toEqual(['', 'd:1980', 'a:1980', 'd:1970', 'a:1979', 'a:1977', 'a:1976', 'a:1975', 'a:1970', 'd:1960', 'a:1965', 'perso']);
  });

  it('🔴 une année, puis une décennie, filtrent la grille', async () => {
    const el = await ecran();
    await vueAnnees(el);
    await choisir(el, 'a:1975');
    grilleMontre(el, ['Rouge 1975', 'Réédition'], ['Rouge 1976', 'Avant 1965', 'Sans date']);
    await choisir(el, 'd:1970');
    grilleMontre(el,
      ['Borne basse 1970', 'Rouge 1975', 'Rouge 1976', 'Bleu 1977', 'Borne haute 1979', 'Réédition'],
      ['Avant 1965', 'Après 1980', 'Sans date']);
    expect(el.querySelector('.anbar .periode-n')?.textContent).toContain('6');
    await choisir(el, '');
    grilleMontre(el, ['Avant 1965', 'Après 1980', 'Sans date'], []);
  });

  it('« Autre période… » ouvre les champs De / À dans la même ligne', async () => {
    const el = await ecran();
    await vueAnnees(el);
    await choisir(el, 'perso');
    expect(el.querySelector('.anbar .periode-de'), 'les champs ne sont pas dans la ligne').not.toBeNull();
    await saisir(el, 'de', '1976');
    await saisir(el, 'a', '1977');
    grilleMontre(el, ['Rouge 1976', 'Bleu 1977'], ['Rouge 1975', 'Borne haute 1979']);
    expect(liste(el)!.value).toBe('perso');
  });

  it('la frise se déplie à la demande, s’annonce, et le choix est retenu', async () => {
    const el = await ecran();
    await vueAnnees(el);
    const b = el.querySelector<HTMLButtonElement>('.anbar [data-basculer-frise]')!;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    b.click();
    await flush();
    expect(el.querySelector('#lib-frise-annees.frise')).not.toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-controls')).toBe('lib-frise-annees');
    expect(localStorage.getItem('tune_v2_ecran_lib.frise')).toBe('1');
  });
});
