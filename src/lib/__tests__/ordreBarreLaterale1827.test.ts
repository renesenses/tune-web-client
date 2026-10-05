// @vitest-environment jsdom
//
// renesenses/tune-web-client#1827 — Bertrand, 30/09/2026 (point 4) : l'ordre
// de la barre latérale devient configurable. Glisser-déposer et flèches au
// clavier dans Réglages › Interface, entrées masquables (jamais Accueil),
// « Rétablir l'ordre par défaut », rangé dans `ui_preferences`.
//
// Ce que ce témoin prouve, dans le DOM de composants réellement montés :
//   - sans choix, la barre rend EXACTEMENT l'ordre livré, groupes et
//     intertitres compris (rien ne change) ;
//   - un ordre enregistré est suivi en LISTE LIBRE (arbitrage du 30/09) :
//     une seule liste, sans intertitre, entrées mêlées d'un groupe à l'autre ;
//   - une entrée Avancée reste cachée en Essentiel, puis s'affiche à sa place ;
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
  normaliserChoixBarre, ordonnerEntrees, ordreModifie, deplacer, avecOrdre, avecVisibilite,
} from '../ordreBarreLaterale';
import Sidebar, { CORE, ADVANCED, SELECTIONS, STUDIO, TOUTES_ENTREES } from '../../components/v2/Sidebar.svelte';
import OrdreBarreLateraleV2 from '../../components/v2/OrdreBarreLateraleV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const vues = (l: readonly { view: string }[]) => l.map((it) => it.view);
const NOYAU = vues(CORE);
const TOUTES = vues(TOUTES_ENTREES);
/** L'ordre livré, avec `v` déplacée à l'indice `i`. */
const avecEn = (v: string, i: number) => { const l = TOUTES.filter((x) => x !== v); l.splice(i, 0, v); return l; };

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

function poserChoix(barreLaterale: unknown, settingsLevel: 'beginner' | 'intermediate' | 'expert' = 'expert') {
  preferences.update((p) => ({ ...p, settingsLevel, barreLaterale: barreLaterale as any }));
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
/** Les entrées de la liste libre et leurs sous-entrées, dans l'ordre du DOM. */
function sequenceLibre(): string[] {
  const nav = hote!.querySelector('nav[data-ordre="libre"]') as HTMLElement;
  return Array.from(nav.querySelectorAll<HTMLElement>('button.nav'))
    .map((b) => b.dataset.vue ?? `svc:${b.dataset.service}`);
}
const libre = () => hote!.querySelector('nav[data-ordre="libre"]');
const intertitres = () => Array.from(hote!.querySelectorAll('.grp-label')).map((e) => (e.textContent ?? '').trim());
const SELECTIONS_FR = 'Sélections';

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

describe('#1827 — la logique d’ordre (liste libre)', () => {
  it('sans ordre enregistré, l’ordre livré tel quel', () => {
    expect(vues(ordonnerEntrees(TOUTES_ENTREES, undefined))).toEqual(TOUTES);
    expect(ordreModifie(TOUTES_ENTREES, null)).toBe(false);
    expect(ordreModifie(TOUTES_ENTREES, { ordre: [], masquees: ['history'] })).toBe(false);
    expect(ordreModifie(TOUTES_ENTREES, { ordre: TOUTES, masquees: [] })).toBe(false);
    expect(ordreModifie(TOUTES_ENTREES, { ordre: avecEn('tags', 0), masquees: [] })).toBe(true);
  });

  it('une entrée inconnue et un doublon sont écartés', () => {
    const r = ordonnerEntrees(TOUTES_ENTREES, ['tags', 'hologramme', 'tags', ...TOUTES.filter((v) => v !== 'tags')]);
    expect(vues(r)).toEqual(avecEn('tags', 0));
  });

  it('une entrée nouvelle se place juste après sa voisine par défaut', () => {
    // Ordre enregistré sans les Podcasts, Radio déplacée en tête : ils la suivent.
    const enregistre = ['radios', ...TOUTES.filter((v) => v !== 'radios' && v !== 'podcasts')];
    expect(vues(ordonnerEntrees(TOUTES_ENTREES, enregistre)).slice(0, 2)).toEqual(['radios', 'podcasts']);
    // Sans voisine précédente, en tête.
    expect(vues(ordonnerEntrees(TOUTES_ENTREES, TOUTES.filter((v) => v !== 'home')))[0]).toBe('home');
  });

  it('Accueil ne se masque jamais, même écrit par le serveur', () => {
    expect(normaliserChoixBarre({ masquees: ['home', 'history'] })!.masquees).toEqual(['history']);
    expect(avecVisibilite(null, 'home', false).masquees).toEqual([]);
  });

  it('une valeur abîmée venue du serveur retombe sur le défaut', () => {
    expect(normaliserChoixBarre('n’importe quoi')).toBeNull();
    expect(normaliserChoixBarre([1, 2])).toBeNull();
    const c = normaliserChoixBarre({ ordre: ['search', 3, null, 'search'], masquees: 'history' })!;
    expect(c).toEqual({ ordre: ['search'], masquees: [] });
    // Un ancien format par groupe (jamais publié) retombe sur l'ordre livré.
    expect(normaliserChoixBarre({ ordre: { noyau: ['search'] } })!.ordre).toEqual([]);
  });

  it('déplacer, puis enregistrer, garde les masquées', () => {
    expect(deplacer(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(deplacer(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(avecOrdre({ ordre: ['x'], masquees: ['tags'] }, ['search', 'home'])).toEqual({ ordre: ['search', 'home'], masquees: ['tags'] });
  });

  it('les préférences assainissent la clé, au chargement ET à la synchronisation', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/stores/preferences.ts'), 'utf-8');
    expect(src).toContain('p.barreLaterale = normaliserChoixBarre(');
    expect(src).toContain('const choix = normaliserChoixBarre(server.barreLaterale);');
    // Fil 2109 : l'horodatage du dernier geste suit le défaut, à zéro.
    expect(src).toMatch(/barreLaterale: null,\n  barreLateraleMaj: 0,\n\};/);
  });
});

describe('#1827 — la barre suit le choix', () => {
  it('🔴 par défaut, rien ne change : les groupes, leurs intertitres, Recherche sous Accueil', async () => {
    await monterBarre();
    expect(libre()).toBeNull();
    expect(noyauRendu()).toEqual(NOYAU);
    expect(noyauRendu().slice(0, 2)).toEqual(['home', 'search']);
    expect(intertitres()).toContain(SELECTIONS_FR);
    const toutes = vuesRendues();
    expect(toutes.filter((v) => vues(SELECTIONS).includes(v))).toEqual(vues(SELECTIONS));
  });

  it('masquer seul garde les groupes ; l’entrée masquée disparaît, Accueil reste', async () => {
    poserChoix({ ordre: [], masquees: ['history', 'home', 'tags'] });
    await monterBarre();
    expect(libre()).toBeNull();
    const toutes = vuesRendues();
    expect(toutes).not.toContain('history');
    expect(toutes).not.toContain('tags');
    expect(toutes).toContain('home');
  });

  it('un ordre enregistré mêle les groupes : une liste unique, sans intertitre de groupe', async () => {
    // Étiquettes (Sélections) en tête, Égaliseur (Studio) sous Accueil.
    const ordre = ['tags', 'home', 'equalizer', ...TOUTES.filter((v) => !['tags', 'home', 'equalizer'].includes(v))];
    poserChoix({ ordre, masquees: [] });
    await monterBarre();
    expect(libre()).not.toBeNull();
    expect(sequenceLibre().slice(0, 3)).toEqual(['tags', 'home', 'equalizer']);
    expect(intertitres()).not.toContain(SELECTIONS_FR);
    expect(intertitres()).not.toContain('Studio');
    // Chaque entrée une seule fois.
    expect(new Set(vuesRendues()).size).toBe(vuesRendues().length);
  });

  it('niveau : une entrée Avancée placée en 2e reste cachée en Essentiel, puis s’affiche à sa place', async () => {
    const ordre = avecEn('zonemanager', 1);
    poserChoix({ ordre, masquees: [] }, 'beginner');
    await monterBarre();
    expect(vuesRendues()).not.toContain('zonemanager');
    expect(vuesRendues()).not.toContain('equalizer');
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    await laisserTourner(5);
    expect(sequenceLibre().slice(0, 3)).toEqual(['home', 'zonemanager', 'search']);
    expect(vuesRendues()).not.toContain('equalizer');
  });

  it('une entrée inconnue de l’ordre enregistré ne casse rien', async () => {
    poserChoix({ ordre: ['hologramme', ...avecEn('tags', 0)], masquees: ['fantome'] });
    await monterBarre();
    expect(sequenceLibre()[0]).toBe('tags');
    expect(vuesRendues()).not.toContain('hologramme');
  });

  it('une entrée nouvelle apparaît juste après sa voisine par défaut', async () => {
    // Enregistré par une version sans la Recherche : elle revient sous Accueil.
    const ancien = avecEn('tags', 1).filter((v) => v !== 'search');
    poserChoix({ ordre: ancien, masquees: [] });
    await monterBarre();
    expect(sequenceLibre().slice(0, 3)).toEqual(['home', 'search', 'tags']);
  });

  it('les services de Streaming suivent Streaming, où qu’il aille', async () => {
    poserChoix({ ordre: avecEn('streaming', 0), masquees: [] });
    await monterBarre();
    expect(sequenceLibre().slice(0, 3)).toEqual(['streaming', 'svc:qobuz', 'home']);
  });

  it('rétablir (choix `null`) rend les groupes et l’ordre livré', async () => {
    poserChoix({ ordre: [...TOUTES].reverse(), masquees: ['history'] });
    await monterBarre();
    expect(libre()).not.toBeNull();
    poserChoix(null);
    await laisserTourner(5);
    expect(libre()).toBeNull();
    expect(noyauRendu()).toEqual(NOYAU);
    expect(intertitres()).toContain(SELECTIONS_FR);
  });

  it('le réglage lit la même liste que la barre', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/OrdreBarreLateraleV2.svelte'), 'utf-8');
    expect(src).toContain("import { TOUTES_ENTREES, NIVEAU_ENTREE, type Item } from './Sidebar.svelte';");
    expect(TOUTES).toEqual([...CORE, ...ADVANCED, ...SELECTIONS, ...STUDIO].map((it) => it.view));
  });
});

describe('#1827 — le réglage, au clavier, à la souris', () => {
  const liste = () =>
    Array.from(hote!.querySelectorAll<HTMLElement>('[data-ordre-barre] li')).map((li) => li.dataset.vue!);
  const ligne = (v: string) => hote!.querySelector<HTMLElement>(`[data-ordre-barre] li[data-vue="${v}"]`)!;
  const choix = () => get(preferences).barreLaterale;

  it('par défaut : une seule liste, l’ordre livré, pastilles de niveau, Accueil non masquable', async () => {
    await monterReglage();
    expect(liste()).toEqual(TOUTES);
    expect(hote!.querySelector<HTMLButtonElement>('[data-action="retablir-ordre-barre"]')!.disabled).toBe(true);
    const caseAccueil = ligne('home').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(caseAccueil.disabled).toBe(true);
    expect(caseAccueil.checked).toBe(true);
    expect(ligne('zonemanager').querySelector('[data-niveau]')?.getAttribute('data-niveau')).toBe('intermediate');
    expect(ligne('equalizer').querySelector('[data-niveau]')?.getAttribute('data-niveau')).toBe('expert');
    expect(ligne('home').querySelector('[data-niveau]')).toBeNull();
  });

  it('descendre au clavier : Accueil passe sous Recherche, et c’est enregistré', async () => {
    await monterReglage();
    const bas = ligne('home').querySelector<HTMLButtonElement>('[data-sens="bas"]')!;
    bas.focus();
    bas.click();
    await laisserTourner(3);
    expect(choix()!.ordre.slice(0, 2)).toEqual(['search', 'home']);
    expect(liste().slice(0, 2)).toEqual(['search', 'home']);
    expect(ligne('search').querySelector<HTMLButtonElement>('[data-sens="haut"]')!.disabled).toBe(true);
    expect(hote!.querySelector('[role="status"]')!.textContent).toMatch(/2/);
    expect((document.activeElement as HTMLElement)?.closest('li')?.dataset.vue).toBe('home');
  });

  it('glisser-déposer d’un groupe à l’autre : les Étiquettes en tête', async () => {
    await monterReglage();
    ligne('tags').dispatchEvent(new Event('dragstart', { bubbles: true }));
    const survol = new Event('dragover', { bubbles: true, cancelable: true });
    ligne('home').dispatchEvent(survol);
    expect(survol.defaultPrevented, 'le dépôt doit être accepté').toBe(true);
    ligne('home').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await laisserTourner(3);
    expect(liste()[0]).toBe('tags');
    expect(choix()!.ordre[0]).toBe('tags');
  });

  it('masquer une entrée, puis rétablir l’ordre par défaut', async () => {
    await monterReglage();
    ligne('history').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await laisserTourner(3);
    expect(choix()!.masquees).toEqual(['history']);
    ligne('home').querySelector<HTMLButtonElement>('[data-sens="bas"]')!.click();
    await laisserTourner(3);
    const retablir = hote!.querySelector<HTMLButtonElement>('[data-action="retablir-ordre-barre"]')!;
    expect(retablir.disabled).toBe(false);
    retablir.click();
    await laisserTourner(3);
    expect(choix()).toBeNull();
    expect(liste()).toEqual(TOUTES);
    expect(ligne('history').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(retablir.disabled).toBe(true);
  });
});

describe('#1827 — traductions', () => {
  const CLES = [
    'sidebarOrder', 'sidebarOrderHint', 'sidebarMoveUp',
    'sidebarMoveDown', 'sidebarShow', 'sidebarAlwaysVisible', 'sidebarReset', 'sidebarResetDone',
    'sidebarMoved', 'sidebarDrag',
  ];
  const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
  it.each(LANGUES)('%s porte les dix clés, avec leurs jetons', (l) => {
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
