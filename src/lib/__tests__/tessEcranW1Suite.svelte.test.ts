// @vitest-environment jsdom
//
// Lot TESS W1 (suite) — l'écran face aux formes que les lots serveur
// ajoutent après T01 :
//   1. ZONE INCONNUE ≠ PAS DE TESS (point ouvert n° 4 de la relecture de
//      #3199) : un 404 `{"error":"zone_not_found"}` (forme de T08) dit que la
//      route existe ; la capacité ne bascule PAS à `non`, l'écran le dit.
//      Contre-épreuve : un 404 nu (serveur sans TESS) cache toujours l'écran.
//   2. MOTIF `not_in_service` (T16, #9160) : libellé traduit, pas le code brut.
//   3. MARQUES DE LA MIGRATION (contrat § 8, T02) : un greffon décoché par le
//      serveur dit pourquoi (`inert_on_network`, D2 ; `replaced_in_group`,
//      décision B). Sans marque, il dit seulement « Off ».
//   4. Les trois clés existent dans les 16 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess, sonderTess } from '../stores/tess';
import { locale } from '../i18n';
import { marqueServeur, type ChaineTess } from '../tess';
import { estZoneInconnueTess } from '../api';
import { ServeurTessSimule, chaineA1 } from '../tessSimulation';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
const ZONE = 7;

function reponseJson(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let serveur: ServeurTessSimule;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
async function monter(composant: any) {
  monte = mount(composant, { target: hote! });
  await laisserTourner();
}
const un = (sel: string) => hote!.querySelector<HTMLElement>(sel);
const sousDe = (id: string) => un(`[data-tess-greffon="${id}"] .sous`)?.textContent?.trim() ?? '';

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.zones.set(ZONE, { transport: 'oaat', chain: chaineA1(), volume_db: -18 });
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    return reponseJson([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('tess');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'atelier', output_type: 'oaat' } as any]);
  currentZoneId.set(ZONE);
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  locale.set('en');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('W1 suite — 1. zone inconnue ≠ pas de TESS', () => {
  it('🔴 404 `zone_not_found` sur un serveur AVEC TESS : la capacité ne passe pas à `non`', async () => {
    const r = await sonderTess(99);
    expect(r).toBeNull();
    expect(get(capaciteTess)).toBe('inconnue');
    // La vraie zone, ensuite, annonce bien TESS.
    expect(await sonderTess(ZONE)).toBe('oui');
  });

  it('🔴 l’écran ouvert sur une zone disparue le dit, sans se déclarer « indisponible »', async () => {
    capaciteTess.set('oui');
    currentZoneId.set(99);
    await monter(TessV2);
    expect(get(capaciteTess)).toBe('oui');
    expect(un('[data-tess-indisponible]')).toBeNull();
    expect(un('[data-tess-chemin]')).toBeNull();
    expect(un('[data-tess-etat]')?.textContent?.trim()).toBe(en['tess.zoneNotFound']);
  });

  it('contre-épreuve : un 404 nu (serveur sans TESS) cache toujours l’écran', async () => {
    serveur.avecTess = false;
    expect(await sonderTess(ZONE)).toBe('non');
    expect(get(capaciteTess)).toBe('non');
  });

  it('forme du corps : seul `error: "zone_not_found"` est une zone inconnue', () => {
    expect(estZoneInconnueTess({ error: 'zone_not_found', zone_id: 3 })).toBe(true);
    expect(estZoneInconnueTess({ error: 'not_found' })).toBe(false);
    expect(estZoneInconnueTess(undefined)).toBe(false);
    expect(estZoneInconnueTess('zone_not_found')).toBe(false);
  });
});

describe('W1 suite — 2. motif `not_in_service` (T16)', () => {
  it('🔴 une étape demandée mais pas en service affiche le libellé traduit, pas le code', async () => {
    const reponse = serveur.reponse.bind(serveur);
    serveur.reponse = (id: number) => {
      const r = reponse(id);
      for (const e of r.signal_path) {
        if (e.code === 'plugin' && e.plugin_id === 'convolution') {
          Object.assign(e, { effective: false, reason: 'not_in_service', detail: 'Requested but not running' });
        }
      }
      return r;
    };
    await monter(TessV2);
    expect(sousDe('convolution')).toBe(en['tess.reason.not_in_service']);
    locale.set('fr');
    flushSync();
    expect(sousDe('convolution')).toBe(dictionnaire('fr')['tess.reason.not_in_service']);
    expect(sousDe('convolution')).not.toContain('not_in_service');
  });
});

describe('W1 suite — 3. greffons décochés par la migration', () => {
  function avecMarques(): ChaineTess {
    const c = chaineA1();
    c.plugins = [
      ...(c.plugins ?? []).filter((p) => p.id !== 'crossfeed'),
      { id: 'crosstalk', enabled: true, settings: null },
      { id: 'crossfeed', enabled: false, settings: { replaced_in_group: 'crosstalk' } },
      { id: 'mono-downmix', enabled: false, settings: { inert_on_network: true } },
    ];
    return c;
  }

  it('🔴 « Off » suivi de la raison : remplacé dans le groupe, sans effet sur le réseau', async () => {
    serveur.zones.get(ZONE)!.chain = avecMarques();
    await monter(TessV2);
    const off = en['tess.off'];
    expect(sousDe('crossfeed')).toBe(`${off} · ${en['tess.reason.replaced_in_group'].replace('{x}', en['tess.plugin.crosstalk'] ?? 'Crosstalk')}`);
    expect(sousDe('mono-downmix')).toBe(`${off} · ${en['tess.mark.inertOnNetwork']}`);
  });

  it('contre-épreuve : un greffon décoché par l’utilisateur (sans marque) dit seulement « Off »', async () => {
    await monter(TessV2);
    expect(sousDe('crossfeed')).toBe(en['tess.off']);
  });

  it('fonction pure : coché ou sans marque ⇒ null ; la marque de groupe passe avant le mono', () => {
    expect(marqueServeur({ id: 'x', enabled: true, settings: { inert_on_network: true } })).toBeNull();
    expect(marqueServeur({ id: 'x', enabled: false, settings: null })).toBeNull();
    expect(marqueServeur({ id: 'x', enabled: false, settings: { inert_on_network: 'true' } })).toBeNull();
    expect(marqueServeur({ id: 'x', enabled: false, settings: { inert_on_network: true } })).toEqual({ genre: 'inert_on_network' });
    expect(marqueServeur({ id: 'x', enabled: false, settings: { replaced_in_group: 'crosstalk', inert_on_network: true } }))
      .toEqual({ genre: 'replaced_in_group', par: 'crosstalk' });
  });
});

describe('W1 suite — 4. traductions', () => {
  it('les trois clés existent, non vides, dans les 16 langues', () => {
    expect(ONZE_LANGUES).toHaveLength(16);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of ['tess.reason.not_in_service', 'tess.mark.inertOnNetwork', 'tess.zoneNotFound']) {
        expect(d[k], `${l} ${k}`).toBeTruthy();
      }
    }
  });
});
