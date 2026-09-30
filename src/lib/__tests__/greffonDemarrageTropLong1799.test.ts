// @vitest-environment jsdom
//
// web#1799 (suite de tune-server-rust#5403) — un greffon dont le `setup()` a
// dépassé la borne du démarrage ne disparaît plus du gestionnaire : le serveur
// le rend en erreur (`status: 'error'`, `error_reason: 'setup_timeout'`, avec
// la durée), et `POST /plugins/{name}/retry` relance son `setup()`.
//
// L'écran Extensions doit dire le motif, traduit, et offrir Réessayer. Sur un
// serveur plus ancien, qui n'envoie pas `error_reason`, rien ne change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

/** La fiche que rend le serveur pour un greffon coupé à 30 s (#5403). */
const EN_ERREUR = {
  name: 'attend', display_name: 'attend', description: 'greffon qui attend un appareil', version: '5.4.3',
  type: 'sdk', installed: true, enabled: true, loaded: false, status: 'error',
  error_reason: 'setup_timeout', error_message: null, setup_duration_ms: 30_012, setup_timeout_ms: 30_000,
  retry_url: '/api/v1/plugins/attend/retry', url: '/api/v1/ext/attend', compatible: true, premium: false,
};
/** La même, une fois le nouvel essai réussi. */
const CHARGE = {
  name: 'attend', display_name: 'attend', description: 'greffon qui attend un appareil', version: '5.4.3',
  type: 'sdk', installed: true, enabled: true, url: '/api/v1/ext/attend', compatible: true, premium: false,
};
const VOISIN = {
  name: 'circle', display_name: 'circle', description: 'Tune Circle', version: '0.9.168',
  type: 'sdk', installed: true, enabled: true, url: '/api/v1/ext/circle', compatible: true, premium: false,
};

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let liste: unknown[];
let appels: { url: string; method: string }[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  liste = [EN_ERREUR, VOISIN];
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method });
    if (/\/plugins\/attend\/retry$/.test(u) && method === 'POST') {
      liste = [CHARGE, VOISIN];
      return reponse(200, { name: 'attend', status: 'loaded', loaded: true, setup_duration_ms: 12, restart_required: false });
    }
    if (/\/plugins$/.test(u)) return reponse(200, liste);
    if (/\/audio-plugins$/.test(u)) return reponse(200, { plugins: [] });
    if (u.includes('/marketplace/')) return reponse(404, { error: 'not found' });
    return reponse(200, {});
  }));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
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

const texte = (cle: string) => get(t)(cle as any);
/** La carte du greffon `nom` (par son titre). */
function carte(nom: string): HTMLElement | null {
  return ([...cible!.querySelectorAll('.pl')] as HTMLElement[])
    .find((c) => c.querySelector('h2')?.textContent === nom) ?? null;
}

describe('Extensions — greffon au démarrage trop long (web#1799, serveur#5403)', () => {
  it('🔴 le greffon coupé apparaît en erreur, avec son motif traduit et la durée', async () => {
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!carte('attend'));
    const c = carte('attend');
    expect(c, 'le greffon en erreur doit être listé').toBeTruthy();
    expect(c!.classList.contains('err')).toBe(true);
    const motif = c!.querySelector('[data-motif]');
    expect(motif, 'le motif « démarrage trop long » doit être affiché').toBeTruthy();
    expect(motif!.getAttribute('data-motif')).toBe('setup_timeout');
    expect(motif!.textContent).toBe(texte('v2.plug.errSetupTimeout').replace('{s}', '30'));
    expect(motif!.textContent).not.toContain('v2.plug');
  });

  it('🔴 Réessayer appelle POST /plugins/{name}/retry, puis relit la liste', async () => {
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!carte('attend')?.querySelector('.reessayer'));
    const bouton = carte('attend')!.querySelector('.reessayer') as HTMLButtonElement | null;
    expect(bouton, 'bouton Réessayer absent').toBeTruthy();
    expect(bouton!.textContent!.trim()).toBe(texte('v2.plug.retry'));
    bouton!.click();
    await jusqua(() => !carte('attend')?.querySelector('[data-motif]'));
    expect(appels).toContainEqual({ url: expect.stringMatching(/\/api\/v1\/plugins\/attend\/retry$/), method: 'POST' });
    expect(carte('attend'), 'toujours listé, désormais chargé').toBeTruthy();
    expect(carte('attend')!.querySelector('[data-motif]')).toBeNull();
    expect(carte('attend')!.querySelector('.reessayer')).toBeNull();
  });

  it('serveur plus ancien (pas de `error_reason`) : ni motif ni bouton Réessayer', async () => {
    // Fiche en erreur d'avant #5403 — le message brut s'affiche comme avant.
    liste = [{ ...VOISIN, name: 'ancien', display_name: 'ancien', status: 'error', error_message: 'boom' }, VOISIN];
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!carte('ancien'));
    const c = carte('ancien')!;
    expect(c.querySelector('[data-motif]')).toBeNull();
    expect(c.querySelector('.reessayer')).toBeNull();
    expect(c.textContent).toContain('boom');
    expect(cible!.querySelector('.reessayer')).toBeNull();
    expect(appels.some((a) => a.url.includes('/retry'))).toBe(false);
  });

  it('les libellés existent dans les onze langues, et l’espace réservé {s} y figure', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const c of ['v2.plug.errSetupTimeout', 'v2.plug.errSetupFailed', 'v2.plug.retry']) {
        expect(d[c], `${c} manque en ${l}`).toBeTruthy();
      }
      expect(d['v2.plug.errSetupTimeout'], `{s} manque en ${l}`).toContain('{s}');
    }
  });
});
