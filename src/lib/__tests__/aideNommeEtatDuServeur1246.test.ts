// @vitest-environment jsdom
//
// #1246 — « il ne faut pas dire "leur avancement se suit dans processing"
// puisque "processing" n'existe plus » (Tades, fil 1746, 0.9.155).
//
// #999 a renommé l'entrée de la barre latérale (`v2.nav.processing` =
// « État du serveur ») sans emporter les deux phrases d'aide des Réglages qui
// la citaient EN DUR : `settings.acousticPassesHint` (carte Bibliothèque ▸
// Enrichissement) et `settings.backgroundTasksHint` (carte Système ▸ État du
// serveur). Les deux libellés coexistaient à l'écran, dans onze langues.
//
// Le correctif fait comme `v2.hint.tracksAnalysed` : la phrase porte `{tab}`,
// et l'écran y interpole la clé de navigation. Elle survit donc au prochain
// renommage.
//
// 🔴 CES TÉMOINS MONTENT `SettingsV2` et lisent le TEXTE RENDU de la carte.
// Un témoin qui ne lirait que les dictionnaires serait vert avec une phrase
// qui afficherait « {tab} » littéralement à l'écran — c'est-à-dire avec
// l'interpolation oubliée au point d'appel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

beforeEach(() => {
  // La carte Enrichissement n'est offerte qu'au niveau « expert ».
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      let charge: unknown = {};
      if (url.includes('/system/health')) charge = { status: 'ok' };
      else if (url.includes('/zones') || url.includes('/devices')) charge = [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  locale.set('fr');
  vi.unstubAllGlobals();
});

async function dico(code: string): Promise<Record<string, string>> {
  return dictionnaire(code);
}

/** Monte les Réglages sur une carte, et rend le texte de la phrase d'aide. */
async function phraseRendue(code: string, tab: string, section: string, cle: string): Promise<string> {
  locale.set(code as any);
  v2SettingsTarget.set({ tab: tab as V2SettingsTabId, section });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  // La phrase est retrouvée par son DÉBUT, pris dans le dictionnaire avant
  // l'emphase : c'est ce qu'un humain lirait, et ce qui ne dépend pas du
  // correctif.
  const d = await dico(code);
  const debut = d[cle].split('*')[0].trim().slice(0, 12);
  const p = [...hote.querySelectorAll('p.hint')].find((e) => (e.textContent ?? '').includes(debut));
  expect(p, `${code} : la phrase d'aide « ${cle} » n'est pas rendue sur la carte ${tab}/${section}`).toBeTruthy();
  return (p!.textContent ?? '').trim();
}

const CARTES = [
  { cle: 'settings.acousticPassesHint', tab: 'library', section: 'enrichment' },
  { cle: 'settings.backgroundTasksHint', tab: 'system', section: 'health' },
];

describe('#1246 — les deux phrases d’aide nomment l’écran par son nom actuel', () => {
  for (const { cle, tab, section } of CARTES) {
    for (const code of ['fr', 'en'] as const) {
      it(`🔴 ${code} : ${cle} rendue à l’écran nomme « ${code === 'fr' ? 'État du serveur' : 'Server status'} »`, async () => {
        const nom = (await dico(code))['v2.nav.processing'];
        const texte = await phraseRendue(code, tab, section, cle);
        expect(texte, `${code} : l'aide envoie encore vers « Processing », un écran qui ne porte plus ce nom`)
          .not.toContain('Processing');
        expect(texte, `${code} : le jeton {tab} n'est pas interpolé au point d'appel`).not.toContain('{tab}');
        expect(texte, `${code} : l'aide ne nomme pas l'écran « ${nom} »`).toContain(nom);
      });
    }
  }
});

describe('#1246 — dans les onze langues, la phrase porte le jeton et non un nom en dur', () => {
  for (const code of LANGUES) {
    it(`${code} : les deux phrases interpolent {tab}`, async () => {
      const d = await dico(code);
      for (const { cle } of CARTES) {
        expect(d[cle], `${code} : ${cle} manquante`).toBeTruthy();
        expect(d[cle], `${code} : ${cle} ne porte pas {tab}`).toContain('{tab}');
        expect(d[cle], `${code} : ${cle} nomme encore « Processing »`).not.toContain('Processing');
      }
    });
  }

  it('garde élargie : aucune chaîne ne met plus « Processing » en emphase comme un nom d’écran', async () => {
    // Le garde de #999 ne regardait QUE `v2.nav.processing` ; c'est ce qui a
    // laissé passer ces deux phrases. On regarde désormais toutes les clés :
    // `*Processing*` (ou `**Processing**`) est la façon dont les aides
    // désignent un écran.
    const fautives: string[] = [];
    for (const code of LANGUES) {
      const d = await dico(code);
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'string' && /\*Processing\*/i.test(v)) fautives.push(`${code}:${k}`);
      }
    }
    expect(fautives, 'des aides désignent encore l’écran par son ancien nom').toEqual([]);
  });
});
