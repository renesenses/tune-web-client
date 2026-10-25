// @vitest-environment jsdom
//
// renesenses/tune-server-rust#6510 — « Mes écoutes, tous serveurs ».
//
// Le serveur n'envoie les écoutes au compte que si l'utilisateur coche
// « Envoyer mes écoutes à mon compte » (`cloud_listens_upload_enabled`,
// désactivé par défaut). Ce banc MONTE les Réglages, ouvre Système et regarde
// la carte Cloud : la case n'existe que pour un serveur relié à un compte et
// qui publie la clé, son état est celui du serveur, le PATCH part, un refus
// remet la case, et le lien mène à la page du site.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { CLE_ECOUTES_AU_COMPTE, URL_MES_ECOUTES } from '../ecoutesAuCompte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let config: Record<string, unknown>;
let connecte: boolean;
let patchEchoue = false;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  // Témoin : la carte Cloud est rendue, sinon « absent » ne prouverait rien.
  expect(hote.textContent).toContain(fr['settings.telemetry']);
  return hote;
}

const laCase = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_ECOUTES_AU_COMPTE}"]`);

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  connecte = true;
  patchEchoue = false;
  patchs.length = 0;
  config = { music_dirs: [], [CLE_ECOUTES_AU_COMPTE]: false };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      if (patchEchoue) return json({ error: 'boom' }, 500);
      Object.assign(config, corps);
      return json({ ok: true });
    }
    if (/\/system\/config(\?|$)/.test(u)) return json(config);
    if (/\/cloud\/sso\/status/.test(u)) {
      return json(connecte
        ? { configured: true, connected: true, user: { display_name: 'Alice', email: 'alice@example.test' } }
        : { configured: true, connected: false });
    }
    if (/\/cloud\/telemetry\/status/.test(u)) return json({ enabled: true, env_override: false });
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

describe('#6510 — libellés', () => {
  it('la clé est celle du serveur, le lien celui de la page du site', () => {
    expect(CLE_ECOUTES_AU_COMPTE).toBe('cloud_listens_upload_enabled');
    expect(URL_MES_ECOUTES).toBe('https://mozaiklabs.fr/my-listens');
  });

  it('les trois libellés existent dans les douze langues', () => {
    expect(ONZE_LANGUES.length).toBe(13);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of ['settings.cloudListens', 'settings.cloudListensHint', 'settings.cloudListensLink']) {
        expect(d[k], `${code} : ${k}`).toBeTruthy();
      }
    }
  });
});

describe('#6510 — la bascule est dans Réglages › Système › Cloud', () => {
  it('compte relié : la case est là, décochée par défaut, avec son texte et le lien', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    const c = laCase(h);
    expect(c, 'aucune bascule « Envoyer mes écoutes »').not.toBeNull();
    expect(c!.checked).toBe(false);
    expect(h.textContent).toContain(fr['settings.cloudListens']);
    expect(h.textContent).toContain(fr['settings.cloudListensHint']);
    const lien = [...h.querySelectorAll('a')].find((a) => a.getAttribute('href') === URL_MES_ECOUTES);
    expect(lien, 'aucun lien vers la page du site').toBeDefined();
    expect(lien!.textContent).toContain(fr['settings.cloudListensLink']);
  });

  it('la valeur posée côté serveur est lue (chaîne "true")', { timeout: 60_000 }, async () => {
    config[CLE_ECOUTES_AU_COMPTE] = 'true';
    const h = await ouvrirSysteme();
    expect(laCase(h)!.checked).toBe(true);
  });

  it('cocher envoie PATCH { cloud_listens_upload_enabled: true }, décocher { … false }', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    laCase(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_ECOUTES_AU_COMPTE]: true });
    expect(laCase(h)!.checked).toBe(true);
    laCase(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_ECOUTES_AU_COMPTE]: false });
    expect(laCase(h)!.checked).toBe(false);
  });

  it('🔴 un PATCH refusé remet la case dans son état et le dit', { timeout: 60_000 }, async () => {
    patchEchoue = true;
    const h = await ouvrirSysteme();
    laCase(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_ECOUTES_AU_COMPTE]: true });
    expect(laCase(h)!.checked).toBe(false);
    expect(h.textContent).toContain(fr['settings.errSaveFailed']);
  });

  it('sans compte relié : pas de case', { timeout: 60_000 }, async () => {
    connecte = false;
    const h = await ouvrirSysteme();
    expect(laCase(h)).toBeNull();
    expect(h.textContent).not.toContain(fr['settings.cloudListens']);
  });

  it('un serveur qui ne publie pas la clé : pas de case', { timeout: 60_000 }, async () => {
    delete config[CLE_ECOUTES_AU_COMPTE];
    const h = await ouvrirSysteme();
    expect(laCase(h)).toBeNull();
  });
});
