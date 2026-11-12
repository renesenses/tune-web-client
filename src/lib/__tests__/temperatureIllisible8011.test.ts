// @vitest-environment jsdom
//
// tune-server-rust#8011 (suite de #6450) — quand la température de la machine
// est illisible, le serveur ne bride plus les analyses de fond : elles
// tournent à la vitesse réglée, sans surveillance de la chaleur.
//
// - État du serveur : un avertissement simple, lu dans `temperature_illisible`
//   de `GET /system/diagnostics` ; plus d'« analyses bridées ».
// - Réglages : la case « lever le bridage » (#6713), devenue sans effet,
//   disparaît, même quand le serveur publie encore sa clé.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { avertissementTemperature } from '../temperatureProcesseur';
import { REGLAGES } from '../reglagesIndex';

/** La clé serveur du réglage retiré (#6713), toujours acceptée sans effet. */
const ANCIENNE_CLE = 'background_analysis_unthrottle_unreadable_temperature';
const L = { illisible: 'ILLISIBLE', figee: 'FIGEE' };

describe('#8011 — l’avertissement de l’État du serveur', () => {
  it('un motif rend sa phrase', () => {
    expect(avertissementTemperature('temperature_illisible', L)).toBe('ILLISIBLE');
    expect(avertissementTemperature('temperature_figee', L)).toBe('FIGEE');
    // Un motif inconnu d'un serveur plus récent : la température n'est pas lue.
    expect(avertissementTemperature('autre_motif', L)).toBe('ILLISIBLE');
  });

  it('température lue, ou serveur antérieur : rien', () => {
    expect(avertissementTemperature(null, L)).toBeNull();
    expect(avertissementTemperature(undefined, L)).toBeNull();
    expect(avertissementTemperature('', L)).toBeNull();
  });

  it('l’écran lit `temperature_illisible` et ne lit plus les anciens champs', () => {
    const src = readFileSync('src/components/v2/TuneHealthV2.svelte', 'utf8');
    expect(src).toContain('diag[0].value?.temperature_illisible');
    expect(src).toContain('data-temperature="illisible"');
    expect(src).not.toContain('analyses_bridees');
    expect(src).not.toContain('analyses_bridage_leve');
  });

  it('les deux phrases existent dans toutes les langues, sans parler de bridage', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(src, l).toMatch(/"v2\.health\.temperatureIllisible": "[^"]+"/);
      expect(src, l).toMatch(/"v2\.health\.temperatureFigee": "[^"]+"/);
    }
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    expect(fr).toContain('sans surveillance de la chaleur');
    expect(fr).not.toContain('analyses bridées');
  });
});

// ── Réglages : la case retirée ──────────────────────────────────────────
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const json = (corps: unknown) =>
  new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    // Un serveur rc11 publie encore la clé : la case ne doit pas revenir.
    if (/\/system\/config(\?|$)/.test(u)) {
      return json({ music_dirs: [], background_analysis_speed: 'normal', [ANCIENNE_CLE]: false });
    }
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
  vi.restoreAllMocks();
});

describe('#8011 — le réglage de bridage disparaît', () => {
  it('niveau Expert, clé publiée : aucune case', { timeout: 60_000 }, async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' as any }));
    v2SettingsTarget.set({ tab: 'audio', section: 'localAudio' } as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();
    // La vitesse des analyses, sa voisine, est bien là : l'écran est monté.
    expect(hote.querySelector('[data-reglage="vitesse-analyses"]')).not.toBeNull();
    expect(hote.querySelector(`[data-cle="${ANCIENNE_CLE}"]`)).toBeNull();
    expect(hote.querySelector('[data-reglage="lever-bridage"]')).toBeNull();
  });

  it('ni dans l’index des réglages, ni dans le code', () => {
    expect(REGLAGES.some((r) => r.id === 'lever-bridage')).toBe(false);
    expect(readFileSync('src/components/v2/SettingsV2.svelte', 'utf8')).not.toContain(ANCIENNE_CLE);
    expect(readFileSync('src/lib/temperatureProcesseur.ts', 'utf8')).not.toContain(ANCIENNE_CLE);
  });
});
