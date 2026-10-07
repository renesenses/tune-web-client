// @vitest-environment jsdom
//
// « Analyser la bibliothèque au démarrage » (Réglages › Bibliothèque ›
// Analyse automatique). Le serveur publie dans `GET /system/config` la valeur
// du prochain démarrage sous `library_scan_on_startup`. Ce banc tient :
//
// 1. l'interrupteur montre la valeur publiée, avec sa ligne d'aide ;
// 2. le basculer envoie `PATCH { library_scan_on_startup: <bool> }` ;
// 3. un serveur qui ne publie pas la clé n'affiche PAS l'interrupteur ;
// 4. les libellés existent dans les onze langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { CLE_SCAN_AU_DEMARRAGE, scanAuDemarrageDepuisConfig } from '../scanAuDemarrage';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let valeurServeur: unknown = undefined;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
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
  expect(hote.textContent).toContain(fr['settings.scanSchedule']);
  return hote;
}

const interrupteur = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_SCAN_AU_DEMARRAGE}"]`);

beforeEach(() => {
  valeurServeur = undefined;
  patchs.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const corps = /\/system\/config(\?|$)/.test(u)
      ? { music_dirs: [], quality_split: true, ...(valeurServeur === undefined ? {} : { [CLE_SCAN_AU_DEMARRAGE]: valeurServeur }) }
      : /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('« Analyser la bibliothèque au démarrage »', () => {
  it('la clé est celle que lit le serveur', () => {
    expect(CLE_SCAN_AU_DEMARRAGE).toBe('library_scan_on_startup');
  });

  it('clé absente : null (serveur ancien) ; sinon la valeur publiée', () => {
    expect(scanAuDemarrageDepuisConfig({})).toBeNull();
    expect(scanAuDemarrageDepuisConfig(null)).toBeNull();
    expect(scanAuDemarrageDepuisConfig({ library_scan_on_startup: true })).toBe(true);
    expect(scanAuDemarrageDepuisConfig({ library_scan_on_startup: 'true' })).toBe(true);
    expect(scanAuDemarrageDepuisConfig({ library_scan_on_startup: false })).toBe(false);
    expect(scanAuDemarrageDepuisConfig({ library_scan_on_startup: 'false' })).toBe(false);
  });

  it('les libellés existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of ['settings.scanOnStartup', 'settings.scanOnStartupHint']) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      }
    }
    expect(fr['settings.scanOnStartup']).toBe('Analyser la bibliothèque au démarrage');
    expect(fr['settings.scanOnStartupHint']).toBe(
      'Prend effet au prochain démarrage du serveur. Une analyse ne relit que les fichiers modifiés.',
    );
  });

  it('🔴 serveur sans le réglage : pas d’interrupteur', async () => {
    const h = await poser();
    expect(interrupteur(h)).toBeNull();
    expect(h.textContent).not.toContain(fr['settings.scanOnStartup']);
  });

  it('montre la valeur effective et l’aide, et un clic écrit le réglage', async () => {
    valeurServeur = true;
    const h = await poser();
    const c = interrupteur(h);
    expect(c, 'interrupteur absent alors que le serveur publie la clé').not.toBeNull();
    expect(c!.checked).toBe(true);
    expect(h.textContent).toContain(fr['settings.scanOnStartup']);
    expect(h.textContent).toContain(fr['settings.scanOnStartupHint']);

    c!.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_SCAN_AU_DEMARRAGE]: false });
    expect(interrupteur(h)!.checked).toBe(false);
  });

  it('valeur publiée fausse : décoché', async () => {
    valeurServeur = false;
    const h = await poser();
    expect(interrupteur(h)!.checked).toBe(false);
  });
});
