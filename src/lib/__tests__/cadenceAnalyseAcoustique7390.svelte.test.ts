// @vitest-environment jsdom
/**
 * tune-server-rust#7390 (alec_eiffel, fil 2522) — « Réglages › Analyse
 * acoustique : explications incompréhensibles », et « je ne vois pas où est
 * État du serveur, il serait bon de mettre un lien ».
 *
 * L'onglet disait « {n} titres analysés. L'avancement se suit dans État du
 * serveur » sans dire ce que fait chaque cadence ni montrer l'avancement. Il
 * explique désormais la cadence choisie, montre l'avancement que le serveur
 * publie déjà (`/library/search/acoustic/status`) et ouvre « État du serveur »
 * d'un clic.
 *
 * Écran Réglages réellement monté, couche API réelle, HTTP simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});
vi.mock('../websocket', () => ({ tuneWS: {
  connect() {}, setCurrentZoneId() {}, isPolling: false,
  onEvent() { return () => {}; },
} }));

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';
import fr from '../locales/fr';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let statut: Record<string, unknown>;
let reglages: Record<string, unknown>;
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
const texte = (sel: string) => hote.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const cadence = (libelle: string) => [...hote.querySelectorAll<HTMLButtonElement>('.seg4 button')]
  .find((b) => b.textContent?.includes(libelle))!;

beforeEach(async () => {
  vi.useFakeTimers();
  locale.set('fr'); preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  hote = document.createElement('div'); document.body.appendChild(hote);
  reglages = { audio_embedding_enabled: true, audio_embedding_throttle: 'eco' };
  statut = {
    available: true, enabled: true, model_ready: true, paused_reason: null,
    analysed_tracks: 200, processed_tracks: 250, failed_tracks: 50,
    eligible_tracks: 900, pending_tracks: 650, throttle: 'eco',
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    if (chemin === '/api/v1/library/search/acoustic/status') return json(statut);
    if (chemin === '/api/v1/system/config') {
      if (init?.method === 'PATCH' || init?.method === 'PUT' || init?.method === 'POST') {
        Object.assign(reglages, JSON.parse(String(init.body ?? '{}')));
      }
      return json(reglages);
    }
    const corps = /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups|directories)$|\/devices\/all$/.test(chemin) ? []
      : chemin.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : chemin.endsWith('tune-tested.json') ? { version: 1, count: 0, devices: [] } : {};
    return json(corps);
  }));
  v2SettingsTarget.set({ tab: 'clap', section: 'clap' });
  composant = mount(SettingsV2, { target: hote }); flushSync(); await stabiliser();
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); v2SettingsTarget.set(null); activeView.set('home');
  vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});

describe('#7390 — la cadence de l’analyse acoustique est expliquée', () => {
  it('la cadence choisie dit ce qu’elle fait, en cœurs et en pauses', async () => {
    expect(texte('[data-cadence-choisie]')).toBe(fr['acoustic.throttleEcoHelp']);
    expect(texte('[data-cadence-choisie]')).toContain('un seul cœur');
    cadence('Rapide').click(); flushSync(); await stabiliser();
    expect(texte('[data-cadence-choisie]')).toBe(fr['acoustic.throttleFastHelp']);
    cadence('Équilibré').click(); flushSync(); await stabiliser();
    expect(texte('[data-cadence-choisie]')).toBe(fr['acoustic.throttleBalancedHelp']);
  });

  it('l’ancienne phrase obscure n’est plus à l’écran', () => {
    const onglet = hote.textContent ?? '';
    expect(onglet).not.toContain('y fait tourner un réseau');
    expect(onglet).not.toContain("L'avancement se suit dans");
  });

  it('les trois explications existent et diffèrent dans les quinze langues', async () => {
    for (const code of ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh']) {
      const d = (await import(`../locales/${code}.ts`)).default as Record<string, string>;
      const aides = ['acoustic.throttleEcoHelp', 'acoustic.throttleBalancedHelp', 'acoustic.throttleFastHelp'].map((k) => d[k]);
      expect(aides.every((a) => typeof a === 'string' && a.length > 20), code).toBe(true);
      expect(new Set(aides).size, code).toBe(3);
      expect(d['acoustic.openServerStatus'], code).toContain('{tab}');
      expect(d['acoustic.serverStatusHint'], code).toContain('{tab}');
    }
  });
});

describe('#7390 — l’avancement est visible et État du serveur s’ouvre d’un clic', () => {
  it('l’onglet montre l’avancement publié par le serveur', () => {
    const avancement = texte('[data-avancement-acoustique]');
    expect(avancement).toContain('250 / 900');
    expect(avancement).toContain('650');
    expect(hote.querySelector('[data-avancement-acoustique] [role="progressbar"]')
      ?.getAttribute('aria-valuenow')).toBe('250');
  });

  it('le bouton ouvre l’écran État du serveur', () => {
    const bouton = hote.querySelector<HTMLButtonElement>('[data-ouvrir-etat-serveur]');
    expect(bouton, 'le lien direct vers État du serveur manque').not.toBeNull();
    expect(bouton!.textContent).toContain(fr['v2.nav.processing']);
    bouton!.click(); flushSync();
    expect(get(activeView)).toBe('diagnostics');
  });
});
