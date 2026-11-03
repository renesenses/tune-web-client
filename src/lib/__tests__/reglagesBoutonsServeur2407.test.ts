// @vitest-environment jsdom
//
// #2407 — Réglages › Santé : « Restart server », « Stop server », « Download
// logs » et « Download diagnostics » étaient tassés les uns contre les autres
// (testeur Alex, rc8). Ils vivaient dans deux blocs `.inline` collés, sans
// marge entre eux : les boutons de deux blocs différents se touchaient.
//
// jsdom ne calcule pas la mise en page ; le témoin mesure donc ce qui la
// décide : les quatre boutons ont UN SEUL parent, et ce parent est une
// grille/flexbox avec `gap` (lue dans la feuille de style du composant).
import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('en');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const corps: unknown = url.includes('/system/health')
      ? { status: 'ok', components: { db_albums: true, lms_cli: true } }
      : url.includes('/zones') || url.includes('/devices') ? [] : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(corps), json: async () => corps,
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

async function monterSante() {
  v2SettingsTarget.set({ tab: 'system' as V2SettingsTabId, section: 'health' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  return hote;
}

describe('#2407 — les gestes de service sont espacés', () => {
  it('🔴 les quatre boutons partagent UN conteneur, pas deux blocs collés', async () => {
    const h = await monterSante();
    const conteneur = h.querySelector('[data-actions-serveur]');
    expect(conteneur, 'le conteneur des gestes de service est absent').not.toBeNull();
    const textes = Array.from(conteneur!.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    for (const attendu of ['Restart server', 'Stop server', 'Download logs', 'Download diagnostics']) {
      expect(textes, `« ${attendu} » n’est pas dans le conteneur : [${textes.join(' | ')}]`).toContain(attendu);
    }
  });

  it('🔴 ce conteneur est un flex/grid avec un `gap`', () => {
    const source = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    const regle = source.match(/\.actions-serveur\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(regle, 'aucune règle .actions-serveur').not.toBe('');
    expect(regle).toMatch(/display:\s*(flex|grid)/);
    expect(regle).toMatch(/gap:\s*\d+px/);
  });
});
