// @vitest-environment jsdom
//
// Réglages › Audio › Expérimental › Sortie AES67 (Dante/Ravenna)
// (tune-server-rust#7336, rc10 : EXPÉRIMENTAL, DÉSACTIVÉ par défaut).
//
// Témoins, contre une API simulée qui suit le serveur :
//   GET    /api/v1/plugins/aes67          → { installed, enabled, status, compatible }
//   POST   /api/v1/plugins/aes67/install  → { restart_required: true }
//   DELETE /api/v1/plugins/aes67          → { restart_required: true }
// - base neuve : case DÉCOCHÉE, avertissement affiché ;
// - cocher appelle `install`, décocher appelle `DELETE`, et le redémarrage est dit ;
// - serveur sans le greffon (macOS, Windows) : case grisée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { lireCaseAes67 } from '../sortieAes67';
import SortieAes67ExperimentaleV2 from '../../components/v2/SortieAes67ExperimentaleV2.svelte';

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let fiche: Record<string, unknown>;
let appels: { url: string; methode: string }[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  fiche = { name: 'aes67', installed: false, enabled: false, status: 'not_installed', compatible: true };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: String(url), methode });
    if (methode === 'GET') return reponse(200, fiche);
    return reponse(200, { name: 'aes67', restart_required: true });
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
async function monter() {
  monte = mount(SortieAes67ExperimentaleV2, { target: cible! });
  await jusqua(() => !!q('[data-aes67-case]'));
}

describe('Expérimental › Sortie AES67 — la case', () => {
  it('base neuve : décochée par défaut, avertissement « pas encore essayée » affiché', async () => {
    await monter();
    const c = q<HTMLInputElement>('[data-aes67-case]')!;
    expect(c.checked, 'la sortie AES67 doit être DÉSACTIVÉE par défaut').toBe(false);
    expect(c.disabled).toBe(false);
    expect(appels[0]).toEqual({ url: expect.stringContaining('/api/v1/plugins/aes67'), methode: 'GET' });
    expect(q('[data-aes67-avertissement]')?.textContent).toBe(texte('aes67.experimental.warning'));
    expect(texte('aes67.experimental.warning')).toMatch(/Dante\/Ravenna/);
  });

  it('cocher installe le greffon, décocher le retire, et le redémarrage est annoncé', async () => {
    await monter();
    const c = q<HTMLInputElement>('[data-aes67-case]')!;
    c.click();
    await jusqua(() => !!q('[data-aes67-redemarrage]'));
    const install = appels.find((a) => a.methode === 'POST');
    expect(install?.url).toMatch(/\/api\/v1\/plugins\/aes67\/install$/);
    expect(q('[data-aes67-redemarrage]')?.textContent).toBe(texte('aes67.experimental.restart'));
    expect(c.checked).toBe(true);
    c.click();
    await jusqua(() => appels.some((a) => a.methode === 'DELETE'));
    const retrait = appels.find((a) => a.methode === 'DELETE');
    expect(retrait?.url).toMatch(/\/api\/v1\/plugins\/aes67$/);
    await jusqua(() => !c.disabled);
    expect(c.checked).toBe(false);
  });

  it('déjà cochée et chargée : la case le montre', async () => {
    fiche = { name: 'aes67', installed: true, enabled: true, status: 'loaded', compatible: true };
    await monter();
    expect(q<HTMLInputElement>('[data-aes67-case]')!.checked).toBe(true);
  });

  it('serveur sans le greffon : case grisée et dite indisponible', async () => {
    fiche = { name: 'aes67', installed: false, enabled: false, status: 'not_installed', compatible: false };
    await monter();
    expect(q<HTMLInputElement>('[data-aes67-case]')!.disabled).toBe(true);
    expect(q('[data-aes67-indisponible]')).not.toBeNull();
  });
});

describe('lireCaseAes67', () => {
  it('ne coche que ce qui est installé ET non désactivé', () => {
    expect(lireCaseAes67({ installed: false, status: 'not_installed' })).toEqual({ cochee: false, disponible: true });
    expect(lireCaseAes67({ installed: true, enabled: true, status: 'installed' }).cochee).toBe(true);
    expect(lireCaseAes67({ installed: true, enabled: false, status: 'loaded' }).cochee).toBe(false);
    expect(lireCaseAes67({ status: 'unavailable', compatible: false })).toEqual({ cochee: false, disponible: false });
    expect(lireCaseAes67(null)).toEqual({ cochee: false, disponible: true });
  });
});
