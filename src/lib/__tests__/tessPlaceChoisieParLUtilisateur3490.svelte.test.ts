// @vitest-environment jsdom
//
// #3490 (fil 3137) — décision de Bertrand : TESS ne se place juste après
// « File d'attente » que tant que l'utilisateur ne l'a JAMAIS déplacée.
// Dès qu'il l'a déplacée (`tessPlace`), sa place est respectée. Un ordre
// enregistré AVANT l'arrivée de TESS la voit encore venir après la File.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
vi.mock('../../components/v2/CrossfeedProV2.svelte', () => ({ default: () => {} }));
vi.mock('../../components/v2/CrosstalkV2.svelte', () => ({ default: () => {} }));
import Sidebar, { TOUTES_ENTREES } from '../../components/v2/Sidebar.svelte';
import OrdreBarreLateraleV2 from '../../components/v2/OrdreBarreLateraleV2.svelte';
import { activeView } from '../stores/navigation';
import { capaciteTess } from '../stores/tess';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { ordreAvecTess, placerTessApresLaFile } from '../placementMenuTess';
import { avecOrdre, avecVisibilite, normaliserChoixBarre } from '../ordreBarreLaterale';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false, status: 404, statusText: 'Not Found',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('home');
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote.remove();
  capaciteTess.set('inconnue');
  preferences.update((p) => ({ ...p, barreLaterale: null, barreGroupesReplies: [] }));
  vi.unstubAllGlobals();
});
async function laisserTourner() {
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function monter(composant: any, choix: any) {
  if (monte) { unmount(monte); monte = null; hote.innerHTML = ''; }
  capaciteTess.set('oui');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: choix, barreGroupesReplies: [] }));
  monte = mount(composant, { target: hote });
  await laisserTourner();
}
const barre = () =>
  Array.from(hote.querySelectorAll<HTMLElement>('button.nav[data-vue]')).map((b) => b.dataset.vue as string);
const reglage = () =>
  Array.from(hote.querySelectorAll<HTMLElement>('[data-ordre-barre] [data-vue]')).map((e) => e.dataset.vue as string);
/** Les entrées montrées par les deux vues, dans l'ordre de la première. */
const commun = (a: string[], b: string[]) => a.filter((v) => b.includes(v));

// Un ordre réordonné AVANT TESS : Recherche avant Bibliothèque, TESS absente.
const AVANT_TESS = TOUTES_ENTREES.map((it) => it.view).filter((v) => v !== 'tess');
const i1 = AVANT_TESS.indexOf('library');
const i2 = AVANT_TESS.indexOf('search');
[AVANT_TESS[i1], AVANT_TESS[i2]] = [AVANT_TESS[i2], AVANT_TESS[i1]];

describe('#3490 — la place de TESS', () => {
  it('TESS nouvelle dans un ordre existant : juste après la File, dans la barre ET dans le réglage', async () => {
    const choix = { ordre: AVANT_TESS, masquees: [] };
    await monter(Sidebar, choix);
    const b = barre();
    expect(b.indexOf('tess')).toBe(b.indexOf('queue') + 1);
    await monter(OrdreBarreLateraleV2, choix);
    const r = reglage();
    expect(r.indexOf('tess')).toBe(r.indexOf('queue') + 1);
    expect(commun(b, r)).toEqual(commun(r, b));
  });

  it('TESS déplacée par l’utilisateur : sa place est gardée, barre et réglage d’accord', async () => {
    const ordre = [...AVANT_TESS.slice(0, 3), 'tess', ...AVANT_TESS.slice(3)];
    const choix = { ordre, masquees: [], tessPlace: true };
    await monter(Sidebar, choix);
    const b = barre();
    expect(b.indexOf('tess')).not.toBe(b.indexOf('queue') + 1);
    await monter(OrdreBarreLateraleV2, choix);
    const r = reglage();
    expect(r.indexOf('tess')).not.toBe(r.indexOf('queue') + 1);
    expect(commun(b, r)).toEqual(commun(r, b));
    expect(commun(r, ordre)).toEqual(commun(ordre, r));
  });

  it('déplacer TESS dans le réglage l’enregistre, et la place survit au rechargement', async () => {
    await monter(OrdreBarreLateraleV2, { ordre: AVANT_TESS, masquees: [] });
    const k = reglage().indexOf('tess');
    hote.querySelector<HTMLButtonElement>('[data-ordre-barre] [data-vue="tess"] [data-sens="haut"]')!.click();
    await laisserTourner();
    const choix = get(preferences).barreLaterale!;
    expect(choix.tessPlace).toBe(true);
    const apres = reglage();
    expect(apres.indexOf('tess')).toBe(k - 1);
    // « Rechargement » : on remonte avec la valeur enregistrée, relue du serveur.
    const relue = normaliserChoixBarre(JSON.parse(JSON.stringify(choix)));
    await monter(OrdreBarreLateraleV2, relue);
    expect(reglage()).toEqual(apres);
    await monter(Sidebar, relue);
    const b = barre();
    expect(commun(b, apres)).toEqual(commun(apres, b));
  });

  it('déplacer une AUTRE entrée ne fige pas TESS ; masquer ne la défige pas', () => {
    expect(avecOrdre({ ordre: [], masquees: [] }, ['a', 'b']).tessPlace).toBeUndefined();
    expect(avecOrdre({ ordre: [], masquees: [] }, ['a', 'tess'], true).tessPlace).toBe(true);
    expect(avecOrdre({ ordre: [], masquees: [], tessPlace: true }, ['a']).tessPlace).toBe(true);
    expect(avecVisibilite({ ordre: [], masquees: [], tessPlace: true }, 'a', false).tessPlace).toBe(true);
    // Rétrocompat : un ordre ancien se relit sans la clé.
    expect(normaliserChoixBarre({ ordre: ['a'], masquees: [] })).toEqual({ ordre: ['a'], masquees: [] });
  });

  it('contre-épreuve : l’ancienne règle (toujours après la File) écraserait la place choisie', () => {
    const l = ['a', 'queue', 'b', 'tess'].map((view) => ({ view }));
    const v = (x: { view: string }[]) => x.map((i) => i.view);
    expect(v(placerTessApresLaFile(l))).toEqual(['a', 'queue', 'tess', 'b']);
    expect(v(ordreAvecTess(l, { tessPlace: true }))).toEqual(['a', 'queue', 'b', 'tess']);
    expect(v(ordreAvecTess(l, null))).toEqual(['a', 'queue', 'tess', 'b']);
  });
});
