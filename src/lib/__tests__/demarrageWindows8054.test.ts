// @vitest-environment jsdom
//
// tune-server-rust#8054 — Réglages › Système › À propos › « Démarrer Tune avec
// Windows ». Fil forum 2850 : au premier redémarrage de Windows, Tune ne
// repartait pas (« serveur hors ligne »).
//
// Témoins, contre une API simulée qui suit le serveur (rc13) :
//   GET /api/v1/system/autostart → { supported, enabled, registered, disabled_by_windows, command }
//   PUT /api/v1/system/autostart → { enabled }
// - sous Windows, la case reflète `enabled` ;
// - décocher envoie UN PUT `{ enabled: false }` ;
// - désactivé dans le Gestionnaire des tâches : l'écran le dit ;
// - hors Windows, ou serveur sans la route : RIEN n'est rendu ;
// - PUT en panne : la case revient et l'erreur est dite ;
// - la section « À propos » se trouve par « démarrage ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { V2_SETTINGS } from '../v2Settings';
import DemarrageWindowsV2 from '../../components/v2/DemarrageWindowsV2.svelte';

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

type Etat = { supported: boolean; enabled: boolean; registered: boolean; disabled_by_windows: boolean; command: string | null };
let etat: Etat;
let appels: { url: string; methode: string; corps: unknown }[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  etat = { supported: true, enabled: true, registered: true, disabled_by_windows: false, command: '"C:\\Tune\\tune-server.exe" --sans-console' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    appels.push({ url: String(url), methode, corps });
    if (methode === 'PUT') etat = { ...etat, enabled: corps.enabled, registered: corps.enabled, disabled_by_windows: false };
    return reponse(200, etat);
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
const puts = () => appels.filter((a) => a.methode === 'PUT');
async function monter() {
  monte = mount(DemarrageWindowsV2, { target: cible! });
  await jusqua(() => !!q('[data-demarrage-windows-case]'));
}

describe('#8054 — démarrer Tune avec Windows', () => {
  it('sous Windows, la case reflète enabled, lu par GET /system/autostart, sans rien écrire', async () => {
    await monter();
    expect(appels[0]).toMatchObject({ url: expect.stringMatching(/\/api\/v1\/system\/autostart$/), methode: 'GET' });
    expect(q<HTMLInputElement>('[data-demarrage-windows-case]')!.checked).toBe(true);
    expect(puts()).toHaveLength(0);
    expect(cible!.textContent).toContain(texte('demarrageWindows.label'));
    expect(texte('demarrageWindows.label')).toMatch(/Windows/);
    expect(q('[data-demarrage-windows-coupe]')).toBeNull();
  });

  it('décocher envoie UN PUT {enabled:false}', async () => {
    await monter();
    const c = q<HTMLInputElement>('[data-demarrage-windows-case]')!;
    c.click();
    await jusqua(() => puts().length > 0 && !c.disabled);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({ url: expect.stringMatching(/\/api\/v1\/system\/autostart$/), corps: { enabled: false } });
    expect(c.checked).toBe(false);
  });

  it('désactivé dans le Gestionnaire des tâches : case décochée, et l’écran le dit', async () => {
    etat = { ...etat, enabled: false, disabled_by_windows: true };
    await monter();
    expect(q<HTMLInputElement>('[data-demarrage-windows-case]')!.checked).toBe(false);
    expect(q('[data-demarrage-windows-coupe]')?.textContent).toBe(texte('demarrageWindows.disabledByWindows'));
  });

  it('hors Windows : rien n’est rendu', async () => {
    etat = { supported: false, enabled: false, registered: false, disabled_by_windows: false, command: null };
    monte = mount(DemarrageWindowsV2, { target: cible! });
    await jusqua(() => appels.length > 0);
    await jusqua(() => false, 30);
    expect(q('[data-demarrage-windows]')).toBeNull();
  });

  it('serveur sans la route : rien n’est rendu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(404, { error: 'not found' })));
    monte = mount(DemarrageWindowsV2, { target: cible! });
    await jusqua(() => false, 30);
    expect(q('[data-demarrage-windows]')).toBeNull();
  });

  it('PUT en panne : la case revient à son état et l’erreur est dite', async () => {
    await monter();
    vi.stubGlobal('fetch', vi.fn(async () => reponse(500, { error: 'autostart_write_failed' })));
    const c = q<HTMLInputElement>('[data-demarrage-windows-case]')!;
    c.click();
    await jusqua(() => !!q('[role="alert"]'));
    expect(c.checked).toBe(true);
  });

  it('« À propos » (onglet Système) se trouve par « démarrage » et « windows »', () => {
    const systeme = V2_SETTINGS.find((o) => o.id === 'system')!;
    const s = systeme.sections.find((x) => x.id === 'about')!;
    expect(s.keywords).toEqual(expect.arrayContaining(['démarrage', 'windows']));
  });
});
