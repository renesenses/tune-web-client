// @vitest-environment jsdom
//
// tune-server-rust#7915 — sur un NAS lent, le premier scan finit en 2 h, puis
// les empreintes et la plage dynamique décodent toute la bibliothèque une nuit
// entière. L'indicateur de la barre latérale s'éteignait à la fin du scan :
// rien ne disait ce qui tournait, combien il en restait ni quand ce serait fini.
//
// 🔴 CE BANC MONTE LA BARRE LATÉRALE — présente sur tous les écrans, dont la
// Bibliothèque et l'État du serveur — et fait parler le VRAI bus (`tuneWS`)
// comme le serveur le fait pendant une analyse de fond.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { tuneWS } from '../websocket';
import { activeView } from '../stores/navigation';
import { terminerAvancement } from '../analyseBibliotheque';
import {
  analyseDeFond, depuisInstantane, dureeLisible, fusionnerAnalyseDeFond, libelleAnalyseDeFond,
} from '../analysesDeFond';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import de from '../locales/de';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
const tFr = (cle: string) => fr[cle] ?? cle;

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 3000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

/** Ce que répond `GET /system/background-tasks`. */
let instantane: unknown = { tasks: [], pausable: [] };
let hote: HTMLElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  instantane = { tasks: [], pausable: [] };
  terminerAvancement();
  analyseDeFond.set(null);
  locale.set('fr');
  activeView.set('home');
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/system\/scan\/status/.test(u)) return reponse({ scanning: false });
    if (/\/system\/background-tasks$/.test(u)) return reponse(instantane);
    return reponse([]);
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  terminerAvancement();
  analyseDeFond.set(null);
  activeView.set('home');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SidebarV2, { target: hote });
  flushSync();
}
function emettre(type: string, data?: unknown) {
  ((tuneWS as any).handlers as ((e: unknown) => void)[]).slice().forEach((h) => h({ type, data }));
  flushSync();
}
const indicateur = () => hote?.querySelector<HTMLButtonElement>('[data-testid="bg-analysis"]') ?? null;

describe('#7915 — les analyses qui suivent le scan se voient dans la barre', () => {
  it('🔴 les empreintes en cours s’affichent avec leur pourcentage et le temps restant', () => {
    monter();
    expect(indicateur(), 'rien ne tourne : pas d’indicateur').toBeNull();
    emettre('library.analysis.progress', {
      phase: 'progress', task: 'fingerprints', active: true,
      processed: 350, total: 1000, eta_seconds: 7500,
    });
    expect(indicateur(), 'les empreintes tournent et la barre n’en dit rien').not.toBeNull();
    const texte = indicateur()!.textContent?.trim();
    expect(texte).toContain(fr['v2.nav.bgTask.fingerprints']);
    expect(texte).toContain('35');
    expect(texte).toContain('2 h 05');
    // web#2874 : la bulle nomme la passe (stable), plus « Analyse de fond en cours ».
    expect(indicateur()!.getAttribute('title')).toBe(fr['v2.nav.bgTaskOpenHint'].replace('{task}', fr['v2.nav.bgTask.fingerprints']));
  });

  it('🔴 il disparaît à la fin de la passe et mène à l’État du serveur', () => {
    monter();
    emettre('library.analysis.progress', {
      task: 'dynamic_range', active: true, processed: 10, total: 20, eta_seconds: 60,
    });
    expect(indicateur()!.textContent).toContain(fr['v2.nav.bgTask.dynamic_range']);
    indicateur()!.click();
    flushSync();
    expect(get(activeView)).toBe('diagnostics');
    emettre('library.analysis.progress', {
      phase: 'idle', task: 'dynamic_range', active: false, processed: 20, total: 20,
    });
    expect(indicateur(), 'la passe est finie et l’indicateur reste').toBeNull();
  });

  it('🔴 une analyse DÉJÀ en cours à l’ouverture se signale sans attendre un événement', async () => {
    instantane = {
      tasks: [],
      pausable: [
        { id: 'replaygain', state: 'au_repos', paused: false, progress: null },
        { id: 'fingerprints', state: 'en_cours', paused: false,
          progress: { processed: 5, total: 10, detail: 'cascade', eta_seconds: 30 } },
      ],
    };
    monter();
    await jusqua(() => !!indicateur());
    expect(indicateur(), 'le serveur analyse et la barre se tait').not.toBeNull();
    expect(indicateur()!.textContent).toContain('50');
  });

  it('le scan garde la priorité : un seul indicateur à la fois', () => {
    monter();
    emettre('library.analysis.progress', { task: 'fingerprints', active: true, processed: 1, total: 10 });
    emettre('library.scan.progress', { phase: 'files', scanned: 10, total: 20 });
    expect(indicateur()).toBeNull();
    expect(hote!.querySelector('button.analyse')!.textContent?.trim())
      .toBe(fr['v2.nav.scanRunningPct'].replace('{p}', '50'));
  });
});

describe('#7915 — lecture des chiffres du serveur', () => {
  it('un serveur antérieur (sans `progress`) laisse la barre muette', () => {
    expect(depuisInstantane({ tasks: [], pausable: [{ id: 'fingerprints', state: 'en_cours', paused: false }] })).toBeNull();
    expect(depuisInstantane({ tasks: [] })).toBeNull();
  });

  it('une passe en pause ou finie ne s’affiche pas', () => {
    const p = { processed: 5, total: 10 };
    expect(depuisInstantane({ pausable: [{ id: 'fingerprints', state: 'en_pause', paused: true, progress: p }] })).toBeNull();
    expect(depuisInstantane({ pausable: [{ id: 'fingerprints', state: 'en_cours', paused: false, progress: { processed: 10, total: 10 } }] })).toBeNull();
  });

  it('la fin d’une passe n’efface pas une autre passe qui a pris la suite', () => {
    const dr = fusionnerAnalyseDeFond(null, { task: 'dynamic_range', active: true, processed: 1, total: 4 });
    expect(fusionnerAnalyseDeFond(dr, { task: 'fingerprints', active: false })).toEqual(dr);
  });

  it('les durées restent lisibles, sans fausse précision', () => {
    expect(dureeLisible(20, tFr)).toBe('1 min');
    expect(dureeLisible(45 * 60, tFr)).toBe('45 min');
    expect(dureeLisible(7500, tFr)).toBe('2 h 05');
    expect(dureeLisible(3600 * 3, tFr)).toBe('3 h');
    expect(dureeLisible(3600 * 2 + 59 * 60 + 50, tFr)).toBe('3 h');
  });

  it('les unités des durées suivent la langue de l’interface', () => {
    const tDe = (cle: string) => (de as Record<string, string>)[cle] ?? cle;
    expect(dureeLisible(45 * 60, tDe)).toBe('45 Min.');
    expect(dureeLisible(7500, tDe)).toBe('2 Std. 05 Min.');
    expect(dureeLisible(3600 * 3, tDe)).toBe('3 Std.');
  });

  it('chaque langue traduit les trois gabarits de durée, avec leurs marques', () => {
    for (const langue of ONZE_LANGUES) {
      const textes = dictionnaire(langue);
      expect(textes['v2.nav.bgDurMin'], langue).toContain('{m}');
      expect(textes['v2.nav.bgDurH'], langue).toContain('{h}');
      expect(textes['v2.nav.bgDurHMin'], langue).toContain('{h}');
      expect(textes['v2.nav.bgDurHMin'], langue).toContain('{mm}');
    }
  });

  it('une passe inconnue reçoit un nom générique traduit', () => {
    const l = libelleAnalyseDeFond({ tache: 'nouvelle', traitees: 1, total: 4, resteSecondes: null }, tFr);
    expect(l).toBe(fr['v2.nav.bgAnalysisPct'].replace('{task}', fr['v2.nav.bgTask.other']).replace('{p}', '25'));
  });
});
