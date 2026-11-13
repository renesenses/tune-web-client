// @vitest-environment jsdom
//
// tune-server-rust#7205 (discussion #7458, reprise en rc12, go de Bertrand du
// 12/11/2026) — le volume Devialet se lit et se règle en dB. web#2558 avait
// livré le curseur et les limites en dB (rc10) ; il restait :
//   1. l'écran des butées basse et haute de la course (−80 à −10 dB, plafond
//      de −10 dB infranchissable) : seule l'API existait ;
//   2. les curseurs encore en pour-cent : liste des zones, barre mobile.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones, currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { libelleVolumeZone, saisieCourse, ECART_MINIMAL_COURSE_DB } from '../volumeCourseDb';

vi.setConfig({ testTimeout: 60_000 });
const fr = lFr as unknown as Record<string, string>;

const COURSE = { min_db: -80, max_db: -10, step_db: 0.5, floor_db: -80, ceiling_db: -10 };
const DEVIALET = { id: 5, name: 'Salon D400', state: 'stopped', volume: 0.5, output_type: 'devialet_air',
  device_volume_range: COURSE, device_volume_db: -45 };

describe('#7205 — fonctions', () => {
  it('le niveau d’une zone Devialet en dB ; rien pour une autre sortie', () => {
    expect(libelleVolumeZone(DEVIALET as any, 0.5)).toBe('-45.0 dB');
    expect(libelleVolumeZone(DEVIALET as any, 1)).toBe('-10.0 dB');
    expect(libelleVolumeZone({ output_type: 'dlna' } as any, 0.5)).toBeNull();
  });

  it('la course saisie : bornes, plafond infranchissable, écart minimal', () => {
    expect(saisieCourse('-70', '-20', -80, -10)).toEqual({ min: -70, max: -20 });
    expect(saisieCourse('−70 dB', '-20,5', -80, -10)).toEqual({ min: -70, max: -20.5 });
    expect(saisieCourse('-90', '-20', -80, -10)).toEqual({ refus: 'hors-course' });
    expect(saisieCourse('-70', '-9.5', -80, -10), 'le plafond de −10 dB ne se franchit pas').toEqual({ refus: 'hors-course' });
    expect(saisieCourse('-70', '0', -80, -10)).toEqual({ refus: 'hors-course' });
    expect(saisieCourse('-30', '-27', -80, -10)).toEqual({ refus: 'ecart' });
    expect(saisieCourse('', '-20', -80, -10)).toEqual({ refus: 'illisible' });
    expect(ECART_MINIMAL_COURSE_DB).toBe(5);
  });

  it('les textes existent dans les quinze langues, avec leurs marques', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(resolve(__dirname, '../locales', `${l}.ts`), 'utf8');
      for (const k of ['Range', 'RangeHint', 'RangeMin', 'RangeMax', 'RangeInvalid', 'RangeBelowLimit']) {
        expect(src, `v2.set.devialetAir${k} manquant en ${l}`).toContain(`"v2.set.devialetAir${k}":`);
      }
      const hint = src.match(/"v2\.set\.devialetAirRangeHint": "([^"]*)"/)![1];
      for (const m of ['{floor}', '{ceiling}', '{gap}']) expect(hint, `${l} : ${m}`).toContain(m);
    }
  });
});

describe('#7205 — Réglages › Appareils › Devialet AIR : la course', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  let reglages: Record<string, unknown>;
  let posts: unknown[] = [];
  let refus: { status: number; code: string } | null = null;
  const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'Content-Type': 'application/json' } });
  const attendre = async (n = 8) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

  beforeEach(() => {
    locale.set('fr');
    posts = [];
    refus = null;
    reglages = { enabled: true, experimental: true, source_index: 9, source_index_default: 9, source_index_max: 14,
      volume_ceiling_db: -10, volume_floor_db: -80, max_sample_rate: 96000, volume_min_db: -80, volume_max_db: -10 };
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/devialet-air/reglages')) {
        if (init?.method === 'POST') {
          const corps = JSON.parse(String(init.body));
          posts.push(corps);
          if (refus) return json({ error: refus.code, message: 'refus' }, refus.status);
          reglages = { ...reglages, ...corps };
        }
        return json(reglages);
      }
      return json(/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {});
    }));
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null; hote?.remove(); hote = null;
    vi.unstubAllGlobals();
  });
  async function ecran() {
    v2SettingsTarget.set({ tab: 'devices', section: 'devialetAir' } as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();
    return hote;
  }
  const saisir = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); };

  it('🔴 la course se lit, se modifie et part au serveur en dB', async () => {
    const h = await ecran();
    const bas = h.querySelector<HTMLInputElement>('[data-course-bas]');
    const haut = h.querySelector<HTMLInputElement>('[data-course-haut]');
    expect(bas, 'aucun réglage de la course').not.toBeNull();
    expect(bas!.value).toBe('-80.0');
    expect(haut!.value).toBe('-10.0');
    const ok = h.querySelector<HTMLButtonElement>('[data-course-enregistrer]')!;
    expect(ok.disabled, 'rien n’a changé : pas d’envoi').toBe(true);
    saisir(bas!, '-70');
    saisir(haut!, '-20');
    expect(ok.disabled).toBe(false);
    ok.click();
    await attendre();
    expect(posts).toEqual([{ volume_min_db: -70, volume_max_db: -20 }]);
  });

  it('🔴 un haut au-dessus de −10 dB est refusé avant tout envoi', async () => {
    const h = await ecran();
    saisir(h.querySelector<HTMLInputElement>('[data-course-haut]')!, '-5');
    expect(h.querySelector('[data-course-refus]')?.textContent).toContain('-10');
    expect(h.querySelector<HTMLButtonElement>('[data-course-enregistrer]')!.disabled).toBe(true);
    expect(posts).toEqual([]);
  });

  it('le refus 409 du serveur se dit dans la langue de l’écran', async () => {
    refus = { status: 409, code: 'volume_range_below_limit' };
    const h = await ecran();
    saisir(h.querySelector<HTMLInputElement>('[data-course-haut]')!, '-30');
    h.querySelector<HTMLButtonElement>('[data-course-enregistrer]')!.click();
    await attendre();
    expect(h.querySelector('[data-air-erreur]')?.textContent).toBe(fr['v2.set.devialetAirRangeBelowLimit']);
  });

  it('CONTRE-ÉPREUVE : serveur sans course publiée → pas de champs', async () => {
    delete reglages.volume_min_db;
    delete reglages.volume_max_db;
    const h = await ecran();
    expect(h.querySelector('[data-course-bas]')).toBeNull();
    expect(h.querySelector('[data-reglage="devialet-air-source"]'), 'la section est bien là').not.toBeNull();
  });
});

describe('#7205 — la liste des zones parle en dB pour une Devialet', () => {
  let host: HTMLDivElement;
  let component: ReturnType<typeof mount> | undefined;
  const response = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
  beforeEach(() => {
    localStorage.clear();
    locale.set('fr');
    const serveur = [DEVIALET, { id: 6, name: 'Cuisine', state: 'stopped', volume: 0.3, output_type: 'dlna' }];
    zones.set(serveur as never);
    currentZoneId.set(5);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/zones(?:\?lang=[a-z]{2})?$/.test(url)) return response(serveur);
      if (url.endsWith('/zones/stereo-pairs')) return response([]);
      if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
      if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
      return response({});
    }));
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(async () => {
    if (component) await unmount(component);
    component = undefined;
    host.remove();
    zones.set([]);
    currentZoneId.set(null);
    vi.unstubAllGlobals();
  });

  it('🔴 « -45.0 dB » sur la Devialet, le pour-cent ailleurs', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    const valeurs = [...host.querySelectorAll('.vn')].map((e) => e.textContent?.trim());
    expect(valeurs, 'la zone Devialet reste en pour-cent').toContain('-45.0 dB');
    expect(valeurs).toContain('30');
  });
});
