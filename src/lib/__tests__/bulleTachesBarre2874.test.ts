// @vitest-environment jsdom
//
// web#2874 (forum, fil 2779, rc11, Windows/Chrome) : sous « Tune / MOZAIKLABS »,
// le libellé de la tâche de fond est coupé (« Récupération des… ») et aucune
// bulle ne le donne en entier.
//
//  - l'indicateur d'analyse de fond portait une bulle générique (« Analyse de
//    fond en cours — ouvrir l'État du serveur ») : le nom coupé n'était lisible
//    nulle part ;
//  - la ligne des tâches portait une bulle recopiée du texte, compteur compris :
//    réécrite à chaque sondage, elle se refermait sous le pointeur.
//
// Le banc monte la VRAIE barre latérale. Contre-épreuve : sur `origin/main`, le
// `title` de l'indicateur est la bulle générique (pas de nom de tâche) et
// celui de la ligne des tâches change quand seul le compteur change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { tachesDeFond } from '../stores/tachesDeFond';
import { bulleBanniereEnrichissement } from '../tachesDeFond';
import { analyseDeFond, nomAnalyseDeFond } from '../analysesDeFond';
import { terminerAvancement } from '../analyseBibliotheque';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const fr = lFr as unknown as Record<string, string>;
const tFr = (cle: string) => fr[cle] ?? cle;
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const credits = (processed: number) => ({
  id: 'credits_enrich_auto', label: 'Crédits (passe automatique)', kind: 'credits',
  progress: { processed, total: 4567, detail: 'Crédits' },
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function monterBarre() {
  monte = mount(Sidebar as never, { target: hote! }) as Record<string, unknown>;
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

beforeEach(() => {
  locale.set('fr');
  terminerAvancement();
  analyseDeFond.set(null);
  activeView.set('home');
  vi.stubGlobal('ResizeObserver', ObservateurInerte as never);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as never);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    const corps = /\/system\/scan\/status/.test(u) ? { scanning: false }
      : /\/system\/background-tasks$/.test(u) ? { tasks: get(tachesDeFond), pausable: [] }
      : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  tachesDeFond.set([]);
  analyseDeFond.set(null);
  activeView.set('home');
  vi.unstubAllGlobals();
});

describe('web#2874 — la bulle de la ligne des tâches', () => {
  it('🔴 elle nomme la tâche et sa phase, et ne bouge pas avec le compteur', async () => {
    tachesDeFond.set([credits(123)] as never);
    await monterBarre();
    const ligne = hote!.querySelector<HTMLButtonElement>('[data-testid="bg-tasks"]');
    expect(ligne, 'ligne des tâches absente').not.toBeNull();
    expect(ligne!.textContent).toContain('123/4567');
    const bulle = ligne!.getAttribute('title') ?? '';
    expect(bulle).toContain(fr['app.task.credits']);
    expect(bulle).toContain(fr['app.task.phase.credits']);
    expect(bulle, 'le compteur bouge : il ne doit pas être dans la bulle').not.toContain('123');

    tachesDeFond.set([credits(124)] as never);
    flushSync();
    expect(ligne!.textContent).toContain('124/4567');
    expect(ligne!.getAttribute('title'), 'la bulle a changé avec le compteur').toBe(bulle);
  });

  it('🔴 la ligne mène à l’État du serveur', async () => {
    tachesDeFond.set([credits(1)] as never);
    await monterBarre();
    hote!.querySelector<HTMLButtonElement>('[data-testid="bg-tasks"]')!.click();
    flushSync();
    expect(get(activeView)).toBe('diagnostics');
  });

  it('plusieurs tâches : toutes nommées, une seule fois chacune ; en pause : rien', () => {
    const t = [
      credits(5),
      { id: 'dynamic_range', label: 'DR', progress: { processed: 1, total: 9, detail: '' } },
      { id: 'credits_enrich_auto', label: 'x', progress: null },
    ] as never;
    const b = bulleBanniereEnrichissement(t, 'secours', tFr)!;
    expect(b.split(' · ')).toHaveLength(2);
    expect(b).toContain(fr['app.task.dynamicRange']);
    expect(bulleBanniereEnrichissement([{ ...credits(1), paused: true }] as never, 's', tFr)).toBeNull();
  });
});

describe('web#2874 — la bulle de l’indicateur d’analyse de fond', () => {
  it('🔴 elle dit le nom de la passe, pas « Analyse de fond en cours »', async () => {
    await monterBarre();
    analyseDeFond.set({ tache: 'dynamic_range', traitees: 45, total: 100, resteSecondes: 7500 });
    flushSync();
    const ind = hote!.querySelector<HTMLButtonElement>('[data-testid="bg-analysis"]');
    expect(ind).not.toBeNull();
    const bulle = ind!.getAttribute('title') ?? '';
    expect(bulle).toContain(fr['v2.nav.bgTask.dynamic_range']);
    // L'avancement suit : la bulle ne bouge pas.
    analyseDeFond.set({ tache: 'dynamic_range', traitees: 46, total: 100, resteSecondes: 7400 });
    flushSync();
    expect(ind!.getAttribute('title')).toBe(bulle);
  });

  it('nom seul, sans pourcentage ; tâche inconnue : « autre »', () => {
    expect(nomAnalyseDeFond({ tache: 'fingerprints', traitees: 1, total: 2, resteSecondes: null }, tFr))
      .toBe(fr['v2.nav.bgTask.fingerprints']);
    expect(nomAnalyseDeFond({ tache: 'inconnue', traitees: 1, total: 2, resteSecondes: null } as never, tFr))
      .toBe(fr['v2.nav.bgTask.other']);
    expect(nomAnalyseDeFond(null, tFr)).toBeNull();
  });
});

describe('web#2874 — le texte existe dans les quinze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    expect(d['v2.nav.bgTaskOpenHint'], code).toBeTruthy();
    expect(d['v2.nav.bgTaskOpenHint']).toContain('{task}');
  });
});
