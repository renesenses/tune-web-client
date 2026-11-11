// @vitest-environment jsdom
//
// web#2784 — Réglages › Audio › Serveur multimédia UPnP/DLNA (Alex, 10/11/2026 :
// « Is there a way to disable Tune Server UPnP Server from advertising on the
// network? »). Le serveur portait déjà `upnp_enabled` / `upnp_friendly_name`
// sans aucun écran : il fallait un `curl` avec la clé API.
//
// Témoins, contre une API simulée qui suit le serveur (rc11) :
//   GET  /api/v1/upnp/config → { enabled, friendly_name }
//   POST /api/v1/upnp/config → { enabled?, friendly_name? }
// - l'écran reflète `enabled: false` et le nom annoncé ;
// - basculer l'interrupteur envoie UN POST `{ enabled: false }`, rien d'autre ;
// - la note « prend effet au redémarrage » n'apparaît QU'APRÈS un changement ;
// - renommer envoie `{ friendly_name }` au blur, pas à chaque touche ;
// - la section est inscrite dans l'onglet Audio, avec ses mots-clés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { V2_SETTINGS } from '../v2Settings';
import AnnonceUpnpServeurV2 from '../../components/v2/AnnonceUpnpServeurV2.svelte';

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let config: { enabled: boolean; friendly_name: string };
let appels: { url: string; methode: string; corps: unknown }[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  config = { enabled: false, friendly_name: 'Tune du salon' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    appels.push({ url: String(url), methode, corps });
    if (methode === 'POST') config = { ...config, ...corps };
    return reponse(200, config);
  }));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}
const q = <T extends Element = HTMLElement>(sel: string) => cible!.querySelector(sel) as T | null;
const texte = (cle: string) => get(t)(cle as any);
const posts = () => appels.filter((a) => a.methode === 'POST');
async function monter() {
  monte = mount(AnnonceUpnpServeurV2, { target: cible! });
  await jusqua(() => !!q('[data-upnp-serveur-case]'));
}

describe('#2784 — annonce du serveur multimédia UPnP/DLNA', () => {
  it('reflète enabled:false et le nom annoncé, lus par GET /upnp/config, sans note de redémarrage', async () => {
    await monter();
    expect(appels[0]).toMatchObject({ url: expect.stringMatching(/\/api\/v1\/upnp\/config$/), methode: 'GET' });
    const c = q<HTMLInputElement>('[data-upnp-serveur-case]')!;
    expect(c.checked, 'serveur à enabled:false → case décochée').toBe(false);
    expect(q<HTMLInputElement>('[data-upnp-serveur-nom]')!.value).toBe('Tune du salon');
    expect(q('[data-upnp-serveur-redemarrage]'), 'aucun changement : pas de note').toBeNull();
    expect(posts(), 'le montage ne doit rien écrire').toHaveLength(0);
    // Le libellé dit ce que la case FAIT et nomme le protocole ; l'aide le détaille.
    expect(cible!.textContent).toContain(texte('upnpServeur.label'));
    expect(texte('upnpServeur.label')).toMatch(/UPnP\/DLNA/);
  });

  it('serveur à enabled:true : case cochée', async () => {
    config = { enabled: true, friendly_name: 'Tune Server' };
    await monter();
    expect(q<HTMLInputElement>('[data-upnp-serveur-case]')!.checked).toBe(true);
  });

  it('décocher envoie UN POST {enabled:false} et la note de redémarrage apparaît', async () => {
    config = { enabled: true, friendly_name: 'Tune Server' };
    await monter();
    const c = q<HTMLInputElement>('[data-upnp-serveur-case]')!;
    c.click();
    await jusqua(() => !!q('[data-upnp-serveur-redemarrage]'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({ url: expect.stringMatching(/\/api\/v1\/upnp\/config$/), corps: { enabled: false } });
    expect(q('[data-upnp-serveur-redemarrage]')?.textContent).toBe(texte('upnpServeur.restart'));
    expect(q('[data-upnp-serveur-redemarrage]')?.getAttribute('role')).toBe('status');
    await jusqua(() => !c.disabled);
    expect(c.checked).toBe(false);
  });

  it('renommer envoie {friendly_name} une seule fois, au blur ; un nom inchangé n’envoie rien', async () => {
    await monter();
    const champ = q<HTMLInputElement>('[data-upnp-serveur-nom]')!;
    champ.focus();
    champ.dispatchEvent(new Event('blur'));
    await jusqua(() => false, 30);
    expect(posts(), 'nom inchangé : aucun POST').toHaveLength(0);
    champ.value = ' Tune du bureau ';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('blur'));
    await jusqua(() => !!q('[data-upnp-serveur-redemarrage]'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0].corps).toEqual({ friendly_name: 'Tune du bureau' });
    expect(q('[data-upnp-serveur-redemarrage]')).not.toBeNull();
  });

  it('POST en panne : la case revient à son état et l’erreur est dite', async () => {
    config = { enabled: true, friendly_name: 'Tune Server' };
    await monter();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      appels.push({ url: String(_url), methode: (init?.method ?? 'GET').toUpperCase(), corps: null });
      return reponse(500, { error: 'panne' });
    }));
    const c = q<HTMLInputElement>('[data-upnp-serveur-case]')!;
    c.click();
    await jusqua(() => !!q('[role="alert"]'));
    expect(c.checked, 'l’écran ne doit pas prétendre que le réglage est passé').toBe(true);
    expect(q('[data-upnp-serveur-redemarrage]')).toBeNull();
  });

  it('serveur sans la route : aucun contrôle, et l’écran le dit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(404, { error: 'not found' })));
    monte = mount(AnnonceUpnpServeurV2, { target: cible! });
    await jusqua(() => !!q('[data-upnp-serveur-indisponible]'));
    expect(q('[data-upnp-serveur-case]')).toBeNull();
    expect(q('[data-upnp-serveur-indisponible]')).not.toBeNull();
  });

  it('la section vit dans l’onglet Audio, à la suite d’« Appareils réseau » et « Appareils ignorés », et se cherche par « dlna »', () => {
    const audio = V2_SETTINGS.find((o) => o.id === 'audio')!;
    const ids = audio.sections.map((s) => s.id);
    expect(ids.indexOf('serveurUpnp')).toBe(ids.indexOf('ignoredDevices') + 1);
    expect(ids.indexOf('ignoredDevices')).toBe(ids.indexOf('netDevices') + 1);
    const s = audio.sections.find((x) => x.id === 'serveurUpnp')!;
    expect(s.keywords).toEqual(expect.arrayContaining(['dlna', 'upnp']));
  });
});
