// @vitest-environment jsdom
//
// renesenses/tune-web-client#1827 — Bertrand, 30/09/2026 (point 4) : l'ordre
// de la barre latérale devient configurable. Glisser-déposer et flèches au
// clavier dans Réglages › Interface, entrées masquables (jamais Accueil),
// « Rétablir l'ordre par défaut », rangé dans `ui_preferences`.
//
// Ce que ce témoin prouve, dans le DOM de composants réellement montés :
//   - sans choix, la barre rend EXACTEMENT l'ordre livré (rien ne change) ;
//   - un ordre enregistré est suivi, groupe par groupe ;
//   - une entrée masquée disparaît de la barre, Accueil jamais ;
//   - une entrée INCONNUE de l'ordre enregistré est ignorée, sans erreur ;
//   - une entrée NOUVELLE apparaît à sa place par défaut, sans casser l'ordre ;
//   - les services de Streaming restent sous Streaming, où qu'il aille ;
//   - le réglage déplace au clavier, au glisser-déposer, masque, rétablit.
//
// Ce qu'il ne prouve pas : jsdom ne fait ni mise en page ni vrai glisser
// (les évènements `drag*` sont émis à la main) ; aucun navigateur réel n'a été
// mesuré. La synchronisation serveur n'est vue que par son assainissement.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import { shortcuts } from '../stores/shortcuts';
import {
  normaliserChoixBarre, ordonnerEntrees, entreesAffichees, deplacer, avecOrdre, avecVisibilite,
} from '../ordreBarreLaterale';
import Sidebar, { CORE, ADVANCED, SELECTIONS, STUDIO } from '../../components/v2/Sidebar.svelte';
import OrdreBarreLateraleV2 from '../../components/v2/OrdreBarreLateraleV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const vues = (l: readonly { view: string }[]) => l.map((it) => it.view);
const NOYAU = vues(CORE);

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function poserChoix(barreLaterale: unknown) {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: barreLaterale as any }));
}

async function monterBarre() {
  monte = mount(Sidebar as any, { target: hote! });
  await laisserTourner();
}
async function monterReglage() {
  monte = mount(OrdreBarreLateraleV2 as any, { target: hote! });
  await laisserTourner(5);
}

/** Les vues du NOYAU telles que la barre les rend (premier groupe). */
function noyauRendu(): string[] {
  const nav = hote!.querySelector('.navscroll nav.grp') as HTMLElement;
  return Array.from(nav.querySelectorAll<HTMLElement>('button.nav[data-vue]')).map((b) => b.dataset.vue!);
}
function vuesRendues(): string[] {
  return Array.from(hote!.querySelectorAll<HTMLElement>('button.nav[data-vue]')).map((b) => b.dataset.vue!);
}
/** L'entrée du noyau et ses sous-entrées, dans l'ordre du DOM. */
function sequenceNoyau(): string[] {
  const nav = hote!.querySelector('.navscroll nav.grp') as HTMLElement;
  return Array.from(nav.querySelectorAll<HTMLElement>('button.nav'))
    .map((b) => b.dataset.vue ?? `svc:${b.dataset.service}`);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
    if (/\/streaming\/services/.test(u)) {
      return reponse({ qobuz: { enabled: true, authenticated: true, username: 'b' } });
    }
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  shortcuts.set([]);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('home');
  poserChoix(null);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1827 — la logique d’ordre', () => {
  it('sans ordre enregistré, l’ordre livré tel quel', () => {
    expect(vues(ordonnerEntrees(CORE, undefined))).toEqual(NOYAU);
    expect(vues(entreesAffichees('noyau', CORE, null))).toEqual(NOYAU);
  });

  it('une entrée inconnue et un doublon sont écartés', () => {
    const enregistre = ['search', 'hologramme', 'search', 'home', ...NOYAU.filter((v) => v !== 'search' && v !== 'home')];
    const r = ordonnerEntrees(CORE, enregistre);
    expect(vues(r)).toEqual(['search', 'home', ...NOYAU.filter((v) => v !== 'search' && v !== 'home')]);
    expect(vues(r)).not.toContain('hologramme');
    expect(new Set(vues(r)).size).toBe(CORE.length);
  });

  it('une entrée nouvelle se place juste après sa voisine par défaut', () => {
    // Un ordre enregistré AVANT les Podcasts : ils suivent Radio, où qu'elle soit.
    const sansPodcasts = ['radios', ...NOYAU.filter((v) => v !== 'radios' && v !== 'podcasts')];
    const r = vues(ordonnerEntrees(CORE, sansPodcasts));
    expect(r.slice(0, 2)).toEqual(['radios', 'podcasts']);
    // Une nouvelle entrée de TÊTE (sans voisine précédente) va en tête.
    expect(vues(ordonnerEntrees(CORE, NOYAU.filter((v) => v !== 'home')))[0]).toBe('home');
  });

  it('Accueil ne se masque jamais, même écrit par le serveur', () => {
    expect(normaliserChoixBarre({ masquees: ['home', 'history'] })!.masquees).toEqual(['history']);
    expect(avecVisibilite(null, 'home', false).masquees).toEqual([]);
    expect(vues(entreesAffichees('noyau', CORE, { ordre: {}, masquees: ['home'] }))).toContain('home');
  });

  it('une valeur abîmée venue du serveur retombe sur le défaut', () => {
    expect(normaliserChoixBarre('n’importe quoi')).toBeNull();
    expect(normaliserChoixBarre([1, 2])).toBeNull();
    const c = normaliserChoixBarre({ ordre: { noyau: ['search', 3, null], inconnu: ['x'] }, masquees: 'history' })!;
    expect(c.ordre).toEqual({ noyau: ['search'] });
    expect(c.masquees).toEqual([]);
  });

  it('déplacer, puis enregistrer, garde les autres groupes', () => {
    expect(deplacer(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(deplacer(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    const c = avecOrdre({ ordre: { studio: ['metadata'] }, masquees: ['tags'] }, 'noyau', ['search', 'home']);
    expect(c).toEqual({ ordre: { studio: ['metadata'], noyau: ['search', 'home'] }, masquees: ['tags'] });
  });

  it('les préférences assainissent la clé, au chargement ET à la synchronisation', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/stores/preferences.ts'), 'utf-8');
    expect(src).toContain('p.barreLaterale = normaliserChoixBarre(');
    expect(src).toContain('const choix = normaliserChoixBarre(server.barreLaterale);');
    expect(src).toMatch(/barreLaterale: null,\n\};/);
  });
});

describe('#1827 — la barre suit le choix', () => {
  it('🔴 par défaut, rien ne change : l’ordre livré, Recherche sous Accueil', async () => {
    await monterBarre();
    expect(noyauRendu()).toEqual(NOYAU);
    expect(noyauRendu().slice(0, 2)).toEqual(['home', 'search']);
    const toutes = vuesRendues();
    for (const v of vues(SELECTIONS)) expect(toutes, v).toContain(v);
    // L'ordre des sélections, lui aussi, est celui livré.
    expect(toutes.filter((v) => vues(SELECTIONS).includes(v))).toEqual(vues(SELECTIONS));
  });

  it('un ordre enregistré est suivi, groupe par groupe', async () => {
    const noyau = ['library', 'home', ...NOYAU.filter((v) => v !== 'library' && v !== 'home')];
    const selections = [...vues(SELECTIONS)].reverse();
    poserChoix({ ordre: { noyau, selections }, masquees: [] });
    await monterBarre();
    expect(noyauRendu()).toEqual(noyau);
    expect(vuesRendues().filter((v) => selections.includes(v))).toEqual(selections);
  });

  it('une entrée masquée disparaît, Accueil reste', async () => {
    poserChoix({ ordre: {}, masquees: ['history', 'home', 'tags'] });
    await monterBarre();
    const toutes = vuesRendues();
    expect(toutes).not.toContain('history');
    expect(toutes).not.toContain('tags');
    expect(toutes).toContain('home');
  });

  it('une entrée inconnue de l’ordre enregistré ne casse rien', async () => {
    poserChoix({ ordre: { noyau: ['hologramme', 'search', ...NOYAU.filter((v) => v !== 'search')] }, masquees: ['fantome'] });
    await monterBarre();
    expect(noyauRendu()).toEqual(['search', ...NOYAU.filter((v) => v !== 'search')]);
  });

  it('une entrée nouvelle apparaît à sa place par défaut', async () => {
    // Ordre enregistré par une version qui n'avait pas encore la Recherche au
    // noyau : elle revient juste après Accueil, le reste de l'ordre tient.
    const ancien = ['home', 'podcasts', ...NOYAU.filter((v) => !['home', 'podcasts', 'search'].includes(v))];
    poserChoix({ ordre: { noyau: ancien }, masquees: [] });
    await monterBarre();
    expect(noyauRendu()).toEqual(['home', 'search', ...ancien.slice(1)]);
  });

  it('les services de Streaming restent sous Streaming', async () => {
    poserChoix({ ordre: { noyau: ['streaming', ...NOYAU.filter((v) => v !== 'streaming')] }, masquees: [] });
    await monterBarre();
    const seq = sequenceNoyau();
    expect(seq.slice(0, 2)).toEqual(['streaming', 'svc:qobuz']);
  });

  it('rétablir (choix `null`) rend l’ordre livré', async () => {
    poserChoix({ ordre: { noyau: [...NOYAU].reverse() }, masquees: ['history'] });
    await monterBarre();
    expect(noyauRendu()).not.toEqual(NOYAU);
    poserChoix(null);
    await laisserTourner(5);
    expect(noyauRendu()).toEqual(NOYAU);
  });

  it('les quatre groupes sont connus du réglage', () => {
    // Le réglage lit les MÊMES tableaux que la barre : aucune entrée oubliée.
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/OrdreBarreLateraleV2.svelte'), 'utf-8');
    expect(src).toContain("import { CORE, ADVANCED, SELECTIONS, STUDIO, type Item } from './Sidebar.svelte';");
    expect(ADVANCED.length + STUDIO.length).toBeGreaterThan(0);
  });
});

describe('#1827 — le réglage, au clavier, à la souris', () => {
  const liste = (g: string) =>
    Array.from(hote!.querySelectorAll<HTMLElement>(`[data-ordre-barre="${g}"] li`)).map((li) => li.dataset.vue!);
  const ligne = (g: string, v: string) =>
    hote!.querySelector<HTMLElement>(`[data-ordre-barre="${g}"] li[data-vue="${v}"]`)!;
  const choix = () => get(preferences).barreLaterale;

  it('par défaut : l’ordre livré, « Rétablir » inactif, Accueil non masquable', async () => {
    await monterReglage();
    expect(liste('noyau')).toEqual(NOYAU);
    expect(liste('selections')).toEqual(vues(SELECTIONS));
    const retablir = hote!.querySelector<HTMLButtonElement>('[data-action="retablir-ordre-barre"]')!;
    expect(retablir.disabled).toBe(true);
    const caseAccueil = ligne('noyau', 'home').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(caseAccueil.disabled).toBe(true);
    expect(caseAccueil.checked).toBe(true);
  });

  it('descendre au clavier : Accueil passe sous Recherche, et c’est enregistré', async () => {
    await monterReglage();
    const bas = ligne('noyau', 'home').querySelector<HTMLButtonElement>('[data-sens="bas"]')!;
    bas.focus();
    bas.click();
    await laisserTourner(3);
    expect(choix()!.ordre.noyau!.slice(0, 2)).toEqual(['search', 'home']);
    expect(liste('noyau').slice(0, 2)).toEqual(['search', 'home']);
    // La première ligne n'a pas de « monter », la dernière pas de « descendre ».
    expect(ligne('noyau', 'search').querySelector<HTMLButtonElement>('[data-sens="haut"]')!.disabled).toBe(true);
    // L'annonce dit la nouvelle place.
    expect(hote!.querySelector('[role="status"]')!.textContent).toMatch(/2/);
    // Le focus suit l'entrée déplacée : on peut presser encore.
    expect((document.activeElement as HTMLElement)?.closest('li')?.dataset.vue).toBe('home');
  });

  it('glisser-déposer dans le groupe ; refusé vers un autre groupe', async () => {
    await monterReglage();
    const podcasts = ligne('noyau', 'podcasts');
    podcasts.dispatchEvent(new Event('dragstart', { bubbles: true }));
    const cible = ligne('noyau', 'home');
    cible.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    cible.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await laisserTourner(3);
    expect(liste('noyau')[0]).toBe('podcasts');

    const avant = liste('selections');
    ligne('noyau', 'home').dispatchEvent(new Event('dragstart', { bubbles: true }));
    const autre = ligne('selections', avant[0]);
    const survol = new Event('dragover', { bubbles: true, cancelable: true });
    autre.dispatchEvent(survol);
    expect(survol.defaultPrevented, 'le dépôt vers un autre groupe doit être refusé').toBe(false);
    autre.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await laisserTourner(3);
    expect(liste('selections')).toEqual(avant);
    expect(liste('noyau')).toContain('home');
  });

  it('masquer une entrée, puis rétablir l’ordre par défaut', async () => {
    await monterReglage();
    const caseHisto = ligne('noyau', 'history').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    caseHisto.click();
    await laisserTourner(3);
    expect(choix()!.masquees).toEqual(['history']);
    ligne('noyau', 'home').querySelector<HTMLButtonElement>('[data-sens="bas"]')!.click();
    await laisserTourner(3);

    const retablir = hote!.querySelector<HTMLButtonElement>('[data-action="retablir-ordre-barre"]')!;
    expect(retablir.disabled).toBe(false);
    retablir.click();
    await laisserTourner(3);
    expect(choix()).toBeNull();
    expect(liste('noyau')).toEqual(NOYAU);
    expect(ligne('noyau', 'history').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(retablir.disabled).toBe(true);
  });
});

describe('#1827 — traductions', () => {
  const CLES = [
    'sidebarOrder', 'sidebarOrderHint', 'sidebarGroupMain', 'sidebarGroupAdvanced', 'sidebarMoveUp',
    'sidebarMoveDown', 'sidebarShow', 'sidebarAlwaysVisible', 'sidebarReset', 'sidebarResetDone',
    'sidebarMoved', 'sidebarDrag',
  ];
  const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
  it.each(LANGUES)('%s porte les douze clés, avec leurs jetons', (l) => {
    const src = readFileSync(resolve(process.cwd(), `src/lib/locales/${l}.ts`), 'utf-8');
    for (const k of CLES) {
      const m = src.match(new RegExp(`"settings\\.${k}": "([^"]+)"`));
      expect(m, `${l} : settings.${k} manque`).not.toBeNull();
      if (['sidebarMoveUp', 'sidebarMoveDown', 'sidebarShow', 'sidebarDrag', 'sidebarMoved'].includes(k)) {
        expect(m![1], `${l} : settings.${k} sans {x}`).toContain('{x}');
      }
      if (k === 'sidebarMoved') {
        expect(m![1]).toContain('{p}');
        expect(m![1]).toContain('{n}');
      }
    }
  });
});
