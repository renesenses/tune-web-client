// @vitest-environment jsdom
//
// tune-server-rust#5593 (Tades, fil 2173 : « circonscrire l'analyse à un
// répertoire ») — limiter les analyses de fond à des dossiers, dans
// Réglages › Bibliothèque. Un dossier par ligne ; le serveur reçoit la liste
// COMPLÈTE ; un serveur qui ne publie pas la clé : pas de champ.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import {
  CLE_DOSSIERS_INCLUS,
  afficherDossiers,
  dossiersDepuisConfig,
  lireSaisieDeDossiers,
} from '../dossiersAnalyses';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let config: Record<string, unknown>;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  patchs.length = 0;
  config = {
    music_dirs: ['/music', '/nas'],
    background_analysis_excluded_roots: [],
    [CLE_DOSSIERS_INCLUS]: [],
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      Object.assign(config, corps);
      return json({ ok: true });
    }
    if (/\/system\/config(\?|$)/.test(u)) return json(config);
    if (/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u)) return json([]);
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function ecranBibliotheque(): Promise<HTMLElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  v2SettingsTarget.set({ tab: 'library' } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

const leChamp = (h: HTMLElement) =>
  h.querySelector<HTMLTextAreaElement>('[data-reglage="dossiers-analyses"] textarea');

describe('#5593 — circonscrire les analyses à des dossiers (fil 2173)', () => {
  it('lit la saisie un dossier par ligne, sans vide ni doublon', () => {
    expect(lireSaisieDeDossiers(' /music/Jazz \n\n/music/Jazz\r\nZ:\\NAS\\Rock, Pop\n')).toEqual([
      '/music/Jazz',
      'Z:\\NAS\\Rock, Pop',
    ]);
    expect(afficherDossiers(['/a', '/b'])).toBe('/a\n/b');
    expect(dossiersDepuisConfig(undefined)).toBeNull();
    expect(dossiersDepuisConfig(['/a', 3])).toEqual(['/a']);
  });

  it('le champ est là, vide par défaut, et écrit la liste COMPLÈTE', { timeout: 60_000 }, async () => {
    const h = await ecranBibliotheque();
    const champ = leChamp(h);
    expect(champ, 'aucun champ').not.toBeNull();
    expect(champ!.value).toBe('');
    expect(patchs.filter((p) => CLE_DOSSIERS_INCLUS in p)).toEqual([]);
    champ!.value = '/music/Jazz\n/nas/Classique';
    champ!.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    expect(patchs.filter((p) => CLE_DOSSIERS_INCLUS in p)).toEqual([
      { [CLE_DOSSIERS_INCLUS]: ['/music/Jazz', '/nas/Classique'] },
    ]);
  });

  it('un serveur qui ne publie pas la clé : pas de champ', { timeout: 60_000 }, async () => {
    delete config[CLE_DOSSIERS_INCLUS];
    const h = await ecranBibliotheque();
    expect(leChamp(h)).toBeNull();
  });

  it('les douze langues nomment le champ et l’explication', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const cle of ['analysisDirsTitle', 'analysisDirsIncluded', 'analysisDirsPlaceholder', 'analysisDirsHint']) {
        expect(src, `${l} settings.${cle}`).toContain(`"settings.${cle}":`);
      }
    }
  });
});
