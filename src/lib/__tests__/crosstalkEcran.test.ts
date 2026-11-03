// @vitest-environment jsdom
//
// web#2580 — l'écran Crosstalk, monté pour de vrai contre une API simulée
// (routes génériques des greffons natifs tiers) :
//
//   GET|PUT  /api/v1/audio-plugins/crosstalk/zones/{zone}
//   GET|POST /api/v1/audio-plugins/crosstalk/profiles
//   DELETE   /api/v1/audio-plugins/crosstalk/profiles/{id}
//
// Une règle par témoin : avertissement « enceintes, jamais au casque » et note
// mono en tête ; les six réglages et leurs bornes ; bornage avant l'envoi ;
// profils lus, appliqués, enregistrés, supprimés ; garde Premium (licence lue
// ET 402) ; greffon absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { audiophileEnabled } from '../stores/audiophile';
import { currentZoneId, zones } from '../stores/zones';
import { licenseState } from '../stores/license';
import { presenceCrosstalk } from '../stores/crosstalk';
import { dialogs } from '../stores/dialogs';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import {
  BORNES_CROSSTALK, CURSEURS_CROSSTALK, DEFAUTS_CROSSTALK, LIBELLES_CROSSTALK, PROFILS_LIVRES_CROSSTALK,
  reglagesCrosstalk,
} from '../crosstalk';
import CrosstalkV2 from '../../components/v2/CrosstalkV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const ZONE = 2580;
const RACINE = '/audio-plugins/crosstalk';

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
  lecture: { status: number; corps: unknown };
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
        if (method === 'PUT') return reponse(200, { plugin: 'crosstalk', zone_id: ZONE, settings: corps, applied_live: true });
      }
      if (u.endsWith(`${RACINE}/profiles`)) {
        if (method === 'GET') return reponse(200, { profiles: hote.profils });
        if (method === 'POST') {
          const p = { id: `p-${hote.profils.length + 1}`, name: corps.name, settings: corps.settings };
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
    lecture: { status: 200, corps: { plugin: 'crosstalk', zone_id: ZONE, settings: null, active: true } },
    profils: [
      { id: 'doux', name: 'Doux', settings: { ...DEFAUTS_CROSSTALK } },
      { id: 'prudent', name: 'Prudent', settings: { ...DEFAUTS_CROSSTALK, gain_ceiling_db: 3 } },
    ],
  };
  simulerHote();
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium' }));
  zones.set([{ id: ZONE, name: 'Salon', state: 'stopped', channel_layout: null } as any]);
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
  presenceCrosstalk.set('inconnue');
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([]);
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

const q = (sel: string) => cible!.querySelector(sel) as HTMLElement | null;
const texte = (cle: string) => get(t)(cle as any);
const monter = async () => {
  monte = mount(CrosstalkV2, { target: cible! });
  await jusqua(() => !!q('fieldset.reglages'));
};
const puts = () => appels.filter((a) => a.method === 'PUT' && a.url.includes(`${RACINE}/zones/${ZONE}`));

describe('Crosstalk — réglages purs', () => {
  it('bornes du schéma du greffon, défauts compris', () => {
    expect(BORNES_CROSSTALK.separation_db).toMatchObject({ min: 3, max: 12 });
    expect(BORNES_CROSSTALK.angle_deg).toMatchObject({ min: 25, max: 70 });
    expect(BORNES_CROSSTALK.distance_m).toMatchObject({ min: 1, max: 4 });
    expect(BORNES_CROSSTALK.band_low_hz).toMatchObject({ min: 150, max: 1000 });
    expect(BORNES_CROSSTALK.band_high_hz).toMatchObject({ min: 2000, max: 10000 });
    expect(BORNES_CROSSTALK.gain_ceiling_db).toMatchObject({ min: 3, max: 12 });
    expect(DEFAUTS_CROSSTALK).toEqual({ enabled: false, separation_db: 6, angle_deg: 30, distance_m: 2.5,
      band_low_hz: 250, band_high_hz: 5000, gain_ceiling_db: 6 });
  });

  it('un réglage hors bornes est ramené dans les bornes ; un champ inconnu est gardé', () => {
    const r = reglagesCrosstalk({ separation_db: 40, angle_deg: 5, distance_m: 'x', band_high_hz: 99999, futur: 1 });
    expect(r.separation_db).toBe(12);
    expect(r.angle_deg).toBe(25);
    expect(r.distance_m).toBe(2.5);
    expect(r.band_high_hz).toBe(10000);
    expect(r.futur).toBe(1);
    expect(reglagesCrosstalk(null)).toEqual(DEFAUTS_CROSSTALK);
  });
});

describe('Crosstalk — écran', () => {
  it('🔴 en tête : « Traitement pour enceintes ; jamais au casque » et la note mono', async () => {
    await monter();
    const avis = q('[data-xtc="enceintes"]')!;
    expect(avis.textContent).toContain(texte('v2.xtc.speakersOnly'));
    expect(avis.textContent).toContain(texte('v2.xtc.speakersOnlyNote'));
    expect(avis.querySelector('[data-xtc="mono"]')!.textContent).toBe(texte('v2.xtc.monoNote'));
  });

  it('🔴 les six réglages, chacun avec ses bornes, sa valeur par défaut et sa note', async () => {
    await monter();
    for (const cle of CURSEURS_CROSSTALK) {
      const input = q(`input[data-xtc="${cle}"]`) as HTMLInputElement | null;
      expect(input, `réglage ${cle} absent`).toBeTruthy();
      expect(Number(input!.min)).toBe(BORNES_CROSSTALK[cle].min);
      expect(Number(input!.max)).toBe(BORNES_CROSSTALK[cle].max);
      expect(Number(input!.value)).toBe(DEFAUTS_CROSSTALK[cle]);
      const ligne = input!.closest('.row')!;
      expect(ligne.textContent).toContain(texte(LIBELLES_CROSSTALK[cle].cle));
      expect(ligne.textContent).toContain(texte(LIBELLES_CROSSTALK[cle].note));
    }
    expect(cible!.querySelectorAll('input[type="range"]')).toHaveLength(6);
  });

  it('bornes respectées à l’envoi : une valeur hors bornes part bornée', async () => {
    await monter();
    (q('input[data-xtc="enabled"]') as HTMLInputElement).click();
    await jusqua(() => puts().length > 0);
    const input = q('input[data-xtc="gain_ceiling_db"]') as HTMLInputElement;
    input.value = '50';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await jusqua(() => puts().length > 1, 2000);
    const dernier = puts().at(-1)!.corps;
    expect(dernier.gain_ceiling_db).toBe(12);
    expect(dernier.enabled).toBe(true);
    // Chaque réglage envoyé est dans ses bornes.
    for (const cle of CURSEURS_CROSSTALK) {
      expect(dernier[cle]).toBeGreaterThanOrEqual(BORNES_CROSSTALK[cle].min);
      expect(dernier[cle]).toBeLessThanOrEqual(BORNES_CROSSTALK[cle].max);
    }
  });

  it('🔴 profils : les livrés portent leur libellé traduit, s’appliquent (PUT allumé) et ne se suppriment pas', async () => {
    await monter();
    await jusqua(() => !!q('[data-profil="prudent"]'));
    expect(q('[data-profil="doux"]')!.textContent!.trim()).toBe(texte(PROFILS_LIVRES_CROSSTALK.doux));
    expect(q('[data-profil="prudent"]')!.textContent!.trim()).toBe(texte(PROFILS_LIVRES_CROSSTALK.prudent));
    expect(q('[data-supprimer="prudent"]')).toBeNull();
    (q('[data-profil="prudent"]') as HTMLButtonElement).click();
    await jusqua(() => puts().length > 0);
    expect(puts()[0].corps).toMatchObject({ enabled: true, gain_ceiling_db: 3 });
  });

  it('profils : enregistrer (POST) puis supprimer (DELETE) un profil de l’utilisateur', async () => {
    vi.spyOn(dialogs, 'prompt').mockResolvedValue('Bureau');
    await monter();
    await jusqua(() => !!q('[data-xtc="save-profile"]') && !!q('[data-profil="doux"]'));
    (q('[data-xtc="save-profile"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-profil="p-3"]'));
    const post = appels.find((a) => a.method === 'POST' && a.url.endsWith(`${RACINE}/profiles`))!;
    expect(post.corps.name).toBe('Bureau');
    expect(Object.keys(post.corps.settings)).toEqual(expect.arrayContaining([...CURSEURS_CROSSTALK]));
    expect(q('[data-profil="p-3"]')!.textContent!.trim()).toBe('Bureau');
    (q('[data-supprimer="p-3"]') as HTMLButtonElement).click();
    await jusqua(() => !q('[data-profil="p-3"]'));
    expect(appels.some((a) => a.method === 'DELETE' && a.url.endsWith(`${RACINE}/profiles/p-3`))).toBe(true);
  });

  it('🔴 garde Premium : sans Premium, l’appel au Premium et des réglages verrouillés, aucun envoi', async () => {
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'free' }));
    await monter();
    expect(q('[data-xtc-motif="premium"]')!.textContent).toBe(texte('v2.xtc.premium'));
    expect((q('fieldset.reglages') as HTMLFieldSetElement).disabled).toBe(true);
    expect(puts()).toHaveLength(0);
  });

  it('garde Premium : un 402 à l’écriture verrouille aussi', async () => {
    hote.refusEcriture = { status: 402, corps: { error: 'premium_required' } };
    await monter();
    (q('input[data-xtc="enabled"]') as HTMLInputElement).click();
    await jusqua(() => !!q('[data-xtc-motif="premium"]'));
    expect((q('fieldset.reglages') as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('greffon absent (404 plugin_inconnu) : l’écran le dit, sans réglages', async () => {
    hote.lecture = { status: 404, corps: { error: 'plugin_inconnu' } };
    monte = mount(CrosstalkV2, { target: cible! });
    await jusqua(() => !!q('[data-xtc-motif="absent"]'));
    expect(q('[data-xtc-motif="absent"]')!.textContent).toBe(texte('v2.xtc.absent'));
    expect(q('fieldset.reglages')).toBeNull();
  });
});

describe('Crosstalk — libellés', () => {
  it('les libellés existent dans les quinze langues, unités non traduites', () => {
    const unites: Record<string, string> = {
      'v2.xtc.separation': '(dB)', 'v2.xtc.distance': '(m)', 'v2.xtc.bandLow': '(Hz)', 'v2.xtc.bandHigh': '(Hz)',
      'v2.xtc.gainCeiling': '(dB)',
    };
    const cles = ['v2.nav.crosstalk', 'v2.plug.crosstalkDesc', 'v2.xtc.speakersOnly', 'v2.xtc.speakersOnlyNote',
      'v2.xtc.monoNote', 'v2.xtc.premium', 'v2.xtc.excludesCrossfeed', 'v2.xtc.angle', 'v2.xtc.geometryNote',
      'v2.xtc.bandNote', 'v2.xtc.gainCeilingNote', 'v2.xtc.separationNote', ...Object.values(PROFILS_LIVRES_CROSSTALK),
      ...Object.keys(unites)];
    for (const l of ONZE_LANGUES) {
      for (const c of cles) {
        const v = dictionnaire(l)[c];
        expect(v, `${c} manque en ${l}`).toBeTruthy();
        expect(v, `double encodage de ${c} en ${l}`).not.toMatch(/Ã|â€/);
      }
      for (const [c, u] of Object.entries(unites)) expect(dictionnaire(l)[c], `${c} en ${l}`).toContain(u);
    }
  });
});
