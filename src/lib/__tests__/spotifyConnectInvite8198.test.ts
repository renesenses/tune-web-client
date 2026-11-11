// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198, volet 4 — « Spotify Connect d'abord ».
// Dans la carte Spotify, AVANT la connexion du compte, un encart propose
// Spotify Connect (aucun compte développeur, Premium requis), puis mène au
// parcours du compte pour parcourir la bibliothèque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones, currentZoneId } from '../stores/zones';
import type { V2SettingsTabId } from '../v2Settings';
import { etatInvite, zoneAExposer } from '../spotifyConnectInvite';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const CLES = [
  'v2.spotify.connect.titre', 'v2.spotify.connect.texte', 'v2.spotify.connect.activer', 'v2.spotify.connect.choisirZone',
  'v2.spotify.connect.actif', 'v2.spotify.connect.erreur', 'v2.spotify.connect.compte', 'v2.spotify.connect.compteBouton',
];

describe('#8198 — ce que l’encart montre', () => {
  it('masqué sans récepteur ou statut illisible ; « actif » ou « à activer » sinon', () => {
    expect(etatInvite(null)).toBe('masque');
    expect(etatInvite({ available: false } as any)).toBe('masque');
    expect(etatInvite({ enabled: false, binary_available: false } as any)).toBe('masque');
    expect(etatInvite({ enabled: true, binary_available: true } as any)).toBe('actif');
    expect(etatInvite({ enabled: false, binary_available: true } as any)).toBe('a_activer');
  });

  it('la zone : celle du serveur, sinon la courante, sinon la seule ; sinon il faut choisir', () => {
    const zs = [{ id: 1 }, { id: 2 }];
    expect(zoneAExposer({ zone_id: 2 }, 1, zs)).toBe(2);
    expect(zoneAExposer({ zone_id: 9 }, 1, zs)).toBe(1);
    expect(zoneAExposer({ zone_id: null }, null, [{ id: 5 }])).toBe(5);
    expect(zoneAExposer({ zone_id: null }, null, zs)).toBeNull();
    expect(zoneAExposer(null, null, [])).toBeNull();
  });

  it('les textes existent dans les quinze langues, disent Premium, et ne nomment jamais le moteur', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const c of CLES) {
        expect(d[c], `${l} ${c}`).toBeTruthy();
        expect(d[c].toLowerCase(), `${l} ${c}`).not.toContain('librespot');
      }
      expect(d['v2.spotify.connect.texte'], l).toContain('Premium');
    }
  });
});

// ── La carte montée ─────────────────────────────────────────────────────────

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let actives: unknown[] = [];
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

function serveur(opts: { connect: 'absent' | 'off' | 'on'; listeZones: { id: number; name: string }[] }) {
  let enabled = opts.connect === 'on';
  let zoneId: number | null = null;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    let charge: unknown = {};
    let status = 200;
    if (url.includes('/spotify-connect/')) {
      if (opts.connect === 'absent') { status = 404; charge = { error: 'not found' }; }
      else {
        if (url.includes('/enable') && methode === 'POST') {
          const corps = JSON.parse(String(init?.body));
          actives.push(corps);
          enabled = true;
          zoneId = corps.zone_id;
        }
        charge = { enabled, device_name: null, zone_id: zoneId, binary_available: true, active: enabled };
      }
    } else if (url.endsWith('/services/tokens')) charge = [];
    else if (url.includes('/system/env')) charge = { spotify_redirect_uri: 'http://127.0.0.1:8888/cb', spotify_client_id_configure: true };
    else if (url.includes('/streaming/services')) charge = { spotify: { enabled: true, authenticated: false } };
    else if (url.includes('/streaming/spotify/status')) charge = { service: 'spotify', enabled: true, authenticated: false };
    else if (url.includes('/zones') || url.includes('/devices')) charge = url.includes('/zones') ? opts.listeZones : [];
    return {
      ok: status === 200, status, statusText: status === 200 ? 'OK' : 'Not Found',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
}

async function monter(listeZones: { id: number; name: string }[]) {
  zones.set(listeZones as any);
  currentZoneId.set(null);
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

beforeEach(() => {
  actives = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('#8198 — l’encart dans la carte Spotify', () => {
  it('🔴 avant la connexion du compte : l’encart, puis un clic active Spotify Connect sur la seule zone', async () => {
    const z = [{ id: 7, name: 'Salon' }];
    serveur({ connect: 'off', listeZones: z });
    const h = await monter(z);
    const encart = h.querySelector('[data-spotify-connect-invite]');
    expect(encart?.getAttribute('data-spotify-connect-invite')).toBe('a_activer');
    const fr = dictionnaire('fr');
    expect(encart?.textContent).toContain(fr['v2.spotify.connect.titre']);
    expect(encart?.textContent).toContain(fr['v2.spotify.connect.texte']);
    expect(encart?.textContent).toContain(fr['v2.spotify.connect.compte']);
    h.querySelector<HTMLButtonElement>('[data-activer-spotify-connect]')!.click();
    await souffler();
    expect(actives).toEqual([{ zone_id: 7, device_name: null }]);
    expect(h.querySelector('[data-spotify-connect-actif]')?.textContent).toBe(fr['v2.spotify.connect.actif']);
  });

  it('plusieurs zones, aucune évidente : rien n’est activé, on mène à la carte Spotify Connect', async () => {
    const z = [{ id: 1, name: 'Salon' }, { id: 2, name: 'Bureau' }];
    serveur({ connect: 'off', listeZones: z });
    const h = await monter(z);
    const vues: unknown[] = [];
    const desabo = v2SettingsTarget.subscribe((c) => { if (c) vues.push(c); });
    h.querySelector<HTMLButtonElement>('[data-activer-spotify-connect]')!.click();
    await souffler(2);
    desabo();
    expect(actives).toEqual([]);
    expect(vues).toContainEqual({ tab: 'access', section: 'spotify' });
    expect(h.querySelector('[data-spotify-connect-choisir]')).toBeTruthy();
    expect(get(v2SettingsTarget), 'la cible est consommée par l’écran').toBeNull();
  });

  it('« Connecter mon compte » replie l’encart ; le parcours du compte reste en dessous', async () => {
    serveur({ connect: 'off', listeZones: [] });
    const h = await monter([]);
    h.querySelector<HTMLButtonElement>('[data-spotify-vers-compte]')!.click();
    flushSync();
    expect(h.querySelector('[data-spotify-connect-invite]')).toBeNull();
    const boutons = [...h.querySelectorAll<HTMLButtonElement>('.svc button')].map((b) => b.textContent?.trim());
    expect(boutons).toContain('Se connecter');
  });

  it('serveur sans récepteur (404) : pas d’encart, pas d’erreur', async () => {
    serveur({ connect: 'absent', listeZones: [] });
    const h = await monter([]);
    expect(h.querySelector('[data-spotify-connect-invite]')).toBeNull();
    expect(h.querySelector('.serr')).toBeNull();
  });
});
