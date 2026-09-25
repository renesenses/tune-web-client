// @vitest-environment jsdom
//
// renesenses/tune-web-client#1578 — « J'avais programmé une mise à jour
// journalière de la base à 22h mais je n'ai jamais pu constater si cela
// marchait ou pas par manque d'indicateur » (Didier, fil 1904).
//
// Le serveur rend `last_run` sur `GET /system/scan/schedule` depuis le
// correctif tune-server-rust#2469 : la date (locale, ISO `AAAA-MM-JJ`) de la
// dernière occurrence HONORÉE. Le client ne la lisait pas. On monte le vrai
// écran des réglages et on regarde ce qui est affiché dans la carte.
//
// Trois cas : date présente ⇒ affichée ; `null` ⇒ « pas encore » ; champ
// ABSENT (serveur antérieur à #2469) ⇒ rien, et aucune erreur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const planif = vi.hoisted(() => ({ reponse: {} as Record<string, unknown> }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => planif.reponse),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Monte l'écran, ouvre l'onglet Bibliothèque, rend le texte de la carte. */
async function carte(reponse: Record<string, unknown>): Promise<string> {
  planif.reponse = reponse;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  const texte = hote.textContent ?? '';
  // Témoin : la carte est bien rendue, sinon « absent » ne prouverait rien.
  expect(texte, 'carte « Scan programmé » absente — témoin sans objet').toContain(fr['v2.lbl.autoAnalysis']);
  return texte;
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1578 — la carte « Scan programmé » dit quand elle est passée pour la dernière fois', () => {
  it('le serveur rend une date : elle est AFFICHÉE, au jour près', { timeout: 60_000 }, async () => {
    const texte = await carte({ enabled: true, time: '22:00', last_run: '2026-09-24' });
    expect(texte, 'la date du dernier passage n’est pas affichée (#1578)').toContain(fr['v2.lbl.lastScheduledRun']);
    // Lue comme un jour LOCAL : `new Date('2026-09-24')` serait minuit UTC, et
    // tomberait la veille à l'ouest de Greenwich.
    expect(texte).toContain('24 sept. 2026');
  });

  it('`null` (jamais observé) : l’écran le dit au lieu de se taire', { timeout: 60_000 }, async () => {
    const texte = await carte({ enabled: true, time: '22:00', last_run: null });
    expect(texte).toContain(fr['v2.lbl.noScheduledRunYet']);
  });

  it('champ ABSENT (serveur antérieur à #2469) : rien d’affiché, aucune erreur', { timeout: 60_000 }, async () => {
    const texte = await carte({ enabled: true, time: '22:00' });
    expect(texte).toContain(fr['v2.lbl.nextAnalysisAt']);
    expect(texte).not.toContain(fr['v2.lbl.lastScheduledRun'] ?? '§absent§');
    expect(texte).not.toContain(fr['v2.lbl.noScheduledRunYet'] ?? '§absent§');
    expect(texte).not.toContain(fr['settings.errScheduleNotSaved']);
  });
});
