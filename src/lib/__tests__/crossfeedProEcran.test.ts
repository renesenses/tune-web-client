// @vitest-environment jsdom
//
// Crossfeed Pro — l'ÉCRAN, monté pour de vrai contre une API simulée
// (tune-server-rust v0.9.167, `routes/greffons_natifs_tiers.rs`) :
//
//   GET|PUT  /api/v1/audio-plugins/crossfeed-pro/zones/{zone}
//   GET|POST /api/v1/audio-plugins/crossfeed-pro/profiles
//   DELETE   /api/v1/audio-plugins/crossfeed-pro/profiles/{id}
//
// Témoins : greffon absent (404 `plugin_inconnu`), inactif, compte sans
// Premium (licence lue ET 402 à l'écriture), zone non stéréo, mode PURE
// (voile commun web#1674), PUT complet et correct, préréglage, mode ITD
// expérimental éteint par défaut, profil enregistré puis chargé, puis supprimé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { audiophileEnabled } from '../stores/audiophile';
import { currentZoneId, zones } from '../stores/zones';
import { licenseState } from '../stores/license';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { dialogs } from '../stores/dialogs';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { DEFAUTS_CROSSFEED_PRO, PRESETS_CROSSFEED_PRO } from '../crossfeedPro';
import CrossfeedProV2 from '../../components/v2/CrossfeedProV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const ZONE = 5039;
const RACINE = '/audio-plugins/crossfeed-pro';

function reponse(status: number, corps: unknown): Response {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

type Appel = { url: string; method: string; corps: any };

interface Hote {
  /** Réponse du GET de zone : un statut d'échec, ou le corps. */
  lecture: { status: number; corps: unknown };
  /** Statut imposé à toute écriture (PUT/POST/DELETE), sinon succès. */
  refusEcriture?: { status: number; corps: unknown };
  profils: { id: string; name: string; settings: Record<string, unknown> }[];
}

let hote: Hote;
let appels: Appel[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function simulerHote() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const corps = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, corps });
    if (u.includes(RACINE)) {
      if (method !== 'GET' && hote.refusEcriture) return reponse(hote.refusEcriture.status, hote.refusEcriture.corps);
      if (u.includes(`${RACINE}/zones/`)) {
        if (method === 'GET') return reponse(hote.lecture.status, hote.lecture.corps);
        if (method === 'PUT') return reponse(200, { plugin: 'crossfeed-pro', zone_id: ZONE, settings: corps, applied_live: false });
      }
      if (u.endsWith(`${RACINE}/profiles`)) {
        if (method === 'GET') return reponse(200, { profiles: hote.profils });
        if (method === 'POST') {
          const p = { id: `p-${hote.profils.length + 1}`, name: corps.name, settings: corps.settings, created_at: 1 };
          hote.profils.push(p);
          return reponse(201, p);
        }
      }
      if (u.includes(`${RACINE}/profiles/`) && method === 'DELETE') {
        const id = decodeURIComponent(u.split('/profiles/')[1]);
        hote.profils = hote.profils.filter((p) => p.id !== id);
        return reponse(200, { deleted: id });
      }
    }
    return reponse(200, /\/(zones|devices|presets|plugins|profiles)(\?|$)/.test(u) ? [] : {});
  }));
}

beforeEach(() => {
  appels = [];
  hote = {
    lecture: { status: 200, corps: { plugin: 'crossfeed-pro', zone_id: ZONE, settings: null, active: true } },
    profils: [],
  };
  simulerHote();
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium' }));
  zones.set([{ id: ZONE, name: 'Casque', state: 'stopped', channel_layout: null } as any]);
  currentZoneId.set(ZONE);
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  audiophileEnabled.set(false);
  presenceCrossfeedPro.set('inconnue');
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Attendre une CONDITION, bornée — jamais un délai calibré. */
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
const ecritures = () => appels.filter((a) => a.url.includes(RACINE) && a.method !== 'GET');
const puts = () => appels.filter((a) => a.url.includes(`${RACINE}/zones/${ZONE}`) && a.method === 'PUT');

async function monter(condition: () => boolean = () => !!q('fieldset.reglages')) {
  monte = mount(CrossfeedProV2, { target: cible! });
  await jusqua(condition);
}

describe('Crossfeed Pro — ce qui empêche le réglage', () => {
  it('🔴 greffon ABSENT (404 plugin_inconnu) : le dit, aucun réglage, la barre l’apprend', async () => {
    hote.lecture = { status: 404, corps: { error: 'plugin_inconnu', plugin: 'crossfeed-pro' } };
    await monter(() => !!q('[data-cfp-motif="absent"]'));
    expect(q('[data-cfp-motif="absent"]')?.textContent).toContain(texte('v2.cfp.absent'));
    expect(q('fieldset.reglages'), 'des réglages pour un greffon absent').toBeNull();
    expect(get(presenceCrossfeedPro)).toBe('absent');
  });

  it('greffon présent mais INACTIF (`active: false`) : le dit et verrouille', async () => {
    hote.lecture = { status: 200, corps: { plugin: 'crossfeed-pro', zone_id: ZONE, settings: null, active: false } };
    await monter();
    expect(q('[data-cfp-motif="inactif"]')).toBeTruthy();
    expect(q<HTMLFieldSetElement>('fieldset.reglages')!.disabled).toBe(true);
  });

  it('🔴 compte SANS Premium : le dit, verrouille, et n’écrit rien', async () => {
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'free' }));
    await monter();
    expect(q('[data-cfp-motif="premium"]')?.textContent).toContain(texte('v2.cfp.premium'));
    const fs = q<HTMLFieldSetElement>('fieldset.reglages')!;
    expect(fs.disabled).toBe(true);
    expect(fs.contains(q('[data-cfp="enabled"]'))).toBe(true);
    expect(ecritures()).toHaveLength(0);
  });

  it('🔴 un 402 à l’écriture fait apparaître le motif Premium, même licence lue premium', async () => {
    hote.refusEcriture = { status: 402, corps: { code: 'premium_required', message: 'Premium' } };
    await monter();
    expect(q('[data-cfp-motif="premium"]')).toBeNull();
    q<HTMLInputElement>('[data-cfp="enabled"]')!.click();
    await jusqua(() => !!q('[data-cfp-motif="premium"]'));
    expect(q('[data-cfp-motif="premium"]')).toBeTruthy();
    expect(q<HTMLFieldSetElement>('fieldset.reglages')!.disabled).toBe(true);
  });

  it('🔴 zone NON stéréo : le dit, disposition nommée, et verrouille', async () => {
    zones.set([{ id: ZONE, name: 'Salon 5.1', state: 'stopped', channel_layout: 'surround51',
      channel_layout_status: { requested: 'surround51', effective: 'surround51', unavailable: false, reason: null, detail: null } } as any]);
    await monter();
    const motif = q('[data-cfp-motif="stereo"]');
    expect(motif).toBeTruthy();
    expect(motif!.textContent).toContain('surround51');
    expect(q<HTMLFieldSetElement>('fieldset.reglages')!.disabled).toBe(true);
  });

  it('🔴 mode PURE : le voile commun, réglages grisés, aucune écriture', async () => {
    audiophileEnabled.set(true);
    await monter();
    const voile = q('[data-voile-pur]');
    expect(voile, 'aucun voile en PURE').toBeTruthy();
    expect(voile!.textContent).toContain(texte('v2.pure.veilCfPro'));
    expect(voile!.textContent).toContain(texte('v2.pure.veilExit'));
    const fs = q<HTMLFieldSetElement>('fieldset.reglages')!;
    expect(fs.disabled).toBe(true);
    expect(fs.contains(q('[data-cfp="amount"]'))).toBe(true);
    expect(fs.contains(q('[data-preset]'))).toBe(true);
    expect(ecritures()).toHaveLength(0);
  });

  it('greffon actif, Premium, zone stéréo, hors PURE : rien de tout cela', async () => {
    zones.set([{ id: ZONE, name: 'Casque', state: 'stopped', channel_layout: 'stereo' } as any]);
    await monter();
    expect(q('[data-cfp-motif]')).toBeNull();
    expect(q('[data-voile-pur]')).toBeNull();
    expect(q<HTMLFieldSetElement>('fieldset.reglages')!.disabled).toBe(false);
    expect(get(presenceCrossfeedPro)).toBe('actif');
  });
});

describe('Crossfeed Pro — écritures', () => {
  it('🔴 activer = PUT sur la bonne route, avec le JSON de réglages COMPLET', async () => {
    await monter();
    q<HTMLInputElement>('[data-cfp="enabled"]')!.click();
    await jusqua(() => puts().length > 0);
    expect(puts()).toHaveLength(1);
    const { url, corps } = puts()[0];
    expect(url).toMatch(new RegExp(`/api/v1${RACINE}/zones/${ZONE}$`));
    expect(corps).toEqual({ ...DEFAUTS_CROSSFEED_PRO, enabled: true });
  });

  it('le mode ITD est marqué EXPÉRIMENTAL, éteint par défaut, et part éteint', async () => {
    await monter();
    const bloc = q('[data-cfp="experimental"]')!;
    expect(bloc.textContent).toContain(texte('v2.cfp.experimental'));
    expect(q<HTMLInputElement>('[data-cfp="experimental_itd"]')!.checked).toBe(false);
    expect(q('[data-cfp="itd_tau_max_us"]'), 'Tau_Max montré mode éteint').toBeNull();
    q<HTMLInputElement>('[data-cfp="enabled"]')!.click();
    await jusqua(() => puts().length > 0);
    expect(puts()[0].corps.experimental_itd).toBe(false);
  });

  it('un préréglage part au PUT avec ses valeurs, et s’allume', async () => {
    await monter();
    const p = PRESETS_CROSSFEED_PRO[1];
    q<HTMLButtonElement>(`[data-preset="${p.key}"]`)!.click();
    await jusqua(() => puts().length > 0);
    expect(puts()[0].corps).toMatchObject({
      enabled: true, mode: 'classique', amount: p.amount, delay_ms: 0, head_shadow: true,
      head_shadow_hz: p.head_shadow_hz, head_shadow_slope_db_oct: p.head_shadow_slope_db_oct,
      phase_guard: false, experimental_itd: false,
    });
    await jusqua(() => !!q(`[data-preset="${p.key}"].on`));
    expect(q(`[data-preset="${p.key}"]`)!.classList.contains('on')).toBe(true);
    expect(q('[data-mode="classique"]')!.classList.contains('on')).toBe(true);
  });

  it('le choix du mode : Tune par défaut ; Classique part au PUT et ne montre que dosage et coupure', async () => {
    await monter();
    expect(q('[data-mode="tune"]')!.classList.contains('on')).toBe(true);
    expect(q('[data-cfp="delay_ms"]')).toBeTruthy();
    q<HTMLButtonElement>('[data-mode="classique"]')!.click();
    await jusqua(() => puts().length > 0);
    expect(puts()[0].corps.mode).toBe('classique');
    await jusqua(() => !q('[data-cfp="delay_ms"]'));
    expect(q('[data-cfp="amount"]')).toBeTruthy();
    expect(q('[data-cfp="head_shadow_hz"]')).toBeTruthy();
    for (const c of ['delay_ms', 'head_shadow', 'low_cut', 'phase_guard', 'experimental']) {
      expect(q(`[data-cfp="${c}"]`), `${c} montré en mode classique`).toBeNull();
    }
  });

  it('un réglage enregistré sans `mode` s’affiche en mode Tune', async () => {
    const { mode: _sans, ...ancien } = DEFAUTS_CROSSFEED_PRO;
    hote.lecture = { status: 200, corps: { plugin: 'crossfeed-pro', zone_id: ZONE, active: true,
      settings: { ...ancien, enabled: true, amount: 0.37 } } };
    await monter();
    expect(q('[data-mode="tune"]')!.classList.contains('on')).toBe(true);
    expect(q('[data-cfp="delay_ms"]')).toBeTruthy();
  });

  it('les réglages enregistrés de la zone sont relus et affichés', async () => {
    hote.lecture = { status: 200, corps: { plugin: 'crossfeed-pro', zone_id: ZONE, active: true,
      settings: { ...DEFAUTS_CROSSFEED_PRO, enabled: true, amount: 0.45, experimental_itd: true } } };
    await monter();
    expect(q<HTMLInputElement>('[data-cfp="enabled"]')!.checked).toBe(true);
    expect(q<HTMLInputElement>('[data-cfp="amount"]')!.value).toBe('0.45');
    expect(q('[data-cfp="itd_tau_max_us"]'), 'Tau_Max caché mode allumé').toBeTruthy();
  });
});

describe('Crossfeed Pro — profils nommés', () => {
  it('🔴 enregistrer puis charger un profil : POST {name, settings}, puis PUT de ses réglages', async () => {
    hote.lecture = { status: 200, corps: { plugin: 'crossfeed-pro', zone_id: ZONE, active: true,
      settings: { ...DEFAUTS_CROSSFEED_PRO, enabled: true, amount: 0.52, low_cut: true } } };
    vi.spyOn(dialogs, 'prompt').mockResolvedValue('  Soirée  ');
    await monter();
    q<HTMLButtonElement>('[data-cfp="save-profile"]')!.click();
    await jusqua(() => !!q('[data-profil="p-1"]'));
    const post = appels.find((a) => a.method === 'POST' && a.url.endsWith(`${RACINE}/profiles`));
    expect(post, 'aucun POST de profil').toBeTruthy();
    expect(post!.corps.name).toBe('Soirée');
    expect(post!.corps.settings).toMatchObject({ amount: 0.52, low_cut: true });
    expect(q('[data-profil="p-1"]')!.textContent).toBe('Soirée');
    expect(q('[data-profil="p-1"]')!.classList.contains('on'), 'le profil qu’on vient d’enregistrer est actif').toBe(true);

    // Charger un AUTRE profil, déjà sur l'hôte : ses réglages partent au PUT.
    monte && unmount(monte);
    monte = null;
    cible!.innerHTML = '';
    hote.profils.push({ id: 'p-9', name: 'Doux', settings: { ...DEFAUTS_CROSSFEED_PRO, enabled: false, amount: 0.22, phase_guard: false } });
    await monter(() => !!q('[data-profil="p-9"]'));
    q<HTMLButtonElement>('[data-profil="p-9"]')!.click();
    await jusqua(() => puts().length > 0);
    expect(puts()[0].corps).toMatchObject({ enabled: true, amount: 0.22, phase_guard: false });
    await jusqua(() => !!q('[data-profil="p-9"].on'));
    expect(q('[data-profil="p-9"]')!.classList.contains('on')).toBe(true);
  });

  it('supprimer un profil : DELETE sur son id', async () => {
    hote.profils = [{ id: 'abc', name: 'Ancien', settings: { ...DEFAUTS_CROSSFEED_PRO } }];
    await monter(() => !!q('[data-profil="abc"]'));
    (q('[data-profil="abc"]')!.nextElementSibling as HTMLButtonElement).click();
    await jusqua(() => appels.some((a) => a.method === 'DELETE'));
    const del = appels.find((a) => a.method === 'DELETE')!;
    expect(del.url).toMatch(new RegExp(`${RACINE}/profiles/abc$`));
    await jusqua(() => !q('[data-profil="abc"]'));
    expect(q('[data-profil="abc"]')).toBeNull();
  });
});

describe('Crossfeed Pro — libellés dans les onze langues', () => {
  it('toutes les clés v2.cfp.*, l’entrée de barre et le voile PURE', () => {
    const fr = dictionnaire('fr');
    const cles = [...Object.keys(fr).filter((c) => c.startsWith('v2.cfp.')), 'v2.nav.crossfeedPro', 'v2.pure.veilCfPro'];
    expect(cles.length).toBeGreaterThan(30);
    for (const l of ONZE_LANGUES) {
      const dict = dictionnaire(l);
      for (const cle of cles) expect(dict[cle], `${cle} manque en ${l}`).toBeTruthy();
      expect(dict['v2.pure.veilCfPro'], `le voile ne nomme pas PURE en ${l}`).toContain('PURE');
    }
  });
});
