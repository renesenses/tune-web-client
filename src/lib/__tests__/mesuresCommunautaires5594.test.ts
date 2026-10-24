// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5594 — les résultats d'analyse de la
// communauté : deux cases dans Réglages › Système › Cloud, RECEVOIR et
// CONTRIBUER, séparées, décochées par défaut, écrites par PATCH, et absentes
// quand le serveur ne publie pas la clé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { CLE_PARTAGE_COMMUNAUTAIRE } from '../notesCommunautaires';
import { CLE_RECEPTION_MESURES, CLE_CONTRIBUTION_MESURES } from '../mesuresCommunautaires';
import { CLE_ECOUTES_AU_COMPTE } from '../ecoutesAuCompte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const tFr = (k: string) => fr[k] ?? k;
const espaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]+/g, ' ');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let config: Record<string, unknown>;
let communaute: unknown;
let communauteEchoue = false;
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
  communauteEchoue = false;
  config = {
    music_dirs: [],
    [CLE_ECOUTES_AU_COMPTE]: false,
    [CLE_PARTAGE_COMMUNAUTAIRE]: false,
    [CLE_RECEPTION_MESURES]: false,
    [CLE_CONTRIBUTION_MESURES]: false,
  };
  communaute = {
    available: true,
    rating: { average: 4.2, count: 37 },
    listens: { count: 1240, listeners: 12 },
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
    if (/\/library\/albums\/\d+\/community/.test(u)) {
      return communauteEchoue ? json({}, 500) : json(communaute);
    }
    if (/\/library\/albums\/\d+\/rating/.test(u)) return json({ rating: 4, note: '' });
    if (/\/system\/config(\?|$)/.test(u)) return json(config);
    if (/\/cloud\/sso\/status/.test(u)) {
      return json({ configured: true, connected: true, user: { display_name: 'Alice', email: 'alice@example.test' } });
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
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  expect(hote.textContent).toContain(fr['settings.telemetry']);
  return hote;
}

/** Les PATCH qui portent une clé des mesures (les préférences d'interface
 *  partent aussi à l'ouverture, elles ne nous regardent pas). */
const patchsMesures = () =>
  patchs.filter((p) => CLE_RECEPTION_MESURES in p || CLE_CONTRIBUTION_MESURES in p);

const caseDe = (h: HTMLElement, cle: string) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${cle}"]`);

describe('#5594 — les mesures communautaires, dans Réglages › Système › Cloud', () => {
  it('deux cases séparées, décochées par défaut, avec leur texte', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    const recevoir = caseDe(h, CLE_RECEPTION_MESURES);
    const contribuer = caseDe(h, CLE_CONTRIBUTION_MESURES);
    expect(recevoir, 'aucune case « recevoir »').not.toBeNull();
    expect(contribuer, 'aucune case « contribuer »').not.toBeNull();
    expect(recevoir).not.toBe(contribuer);
    expect(recevoir!.checked).toBe(false);
    expect(contribuer!.checked).toBe(false);
    for (const cle of [
      'settings.communityMeasuresReceive',
      'settings.communityMeasuresReceiveHint',
      'settings.communityMeasuresContribute',
      'settings.communityMeasuresContributeHint',
    ]) {
      expect(h.textContent).toContain(fr[cle]);
    }
  });

  it('cocher « recevoir » envoie PATCH de SA clé, et seulement elle', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    caseDe(h, CLE_RECEPTION_MESURES)!.click();
    await attendre();
    expect(patchsMesures()).toEqual([{ [CLE_RECEPTION_MESURES]: true }]);
    expect(caseDe(h, CLE_RECEPTION_MESURES)!.checked).toBe(true);
    expect(caseDe(h, CLE_CONTRIBUTION_MESURES)!.checked).toBe(false);
  });

  it('cocher « contribuer » envoie PATCH de SA clé, et seulement elle', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    caseDe(h, CLE_CONTRIBUTION_MESURES)!.click();
    await attendre();
    expect(patchsMesures()).toEqual([{ [CLE_CONTRIBUTION_MESURES]: true }]);
    expect(caseDe(h, CLE_RECEPTION_MESURES)!.checked).toBe(false);
  });

  it('rien ne part sans geste : ouvrir l\'écran n\'écrit rien', { timeout: 60_000 }, async () => {
    await ouvrirSysteme();
    expect(patchsMesures()).toEqual([]);
  });

  it('un serveur qui ne publie pas les clés : pas de case', { timeout: 60_000 }, async () => {
    delete config[CLE_RECEPTION_MESURES];
    delete config[CLE_CONTRIBUTION_MESURES];
    const h = await ouvrirSysteme();
    expect(caseDe(h, CLE_RECEPTION_MESURES)).toBeNull();
    expect(caseDe(h, CLE_CONTRIBUTION_MESURES)).toBeNull();
  });

  it('les libellés existent dans les douze langues', () => {
    expect(ONZE_LANGUES.length).toBe(13);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of [
        'settings.communityMeasuresReceive',
        'settings.communityMeasuresReceiveHint',
        'settings.communityMeasuresContribute',
        'settings.communityMeasuresContributeHint',
      ]) {
        expect(d[cle], `${code} ${cle}`).toBeTruthy();
      }
    }
  });
});
