// @vitest-environment jsdom
//
// web#2580 — crossfeed (casque) et Crosstalk (enceintes) ne se cumulent
// JAMAIS sur une zone ; Crosstalk l'emporte (tune-server-rust#7616).
//
// Tant que la route ne publie pas « la voie en service »
// (tune-server-rust#7627), le client DÉDUIT l'état du réglage de zone de
// `crosstalk` : greffon actif ET case cochée ⇒ les pavés du crossfeed intégré
// et de Crossfeed Pro de cette zone se présentent comme ÉCARTÉS (grisés, une
// phrase d'explication). Dans l'autre sens, l'écran Crosstalk dit que
// l'activer éteint le crossfeed de la zone.
//
// Contre-épreuve : case Crosstalk décochée ⇒ ni phrase ni verrou.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { currentZoneId, zones } from '../stores/zones';
import { audiophileEnabled } from '../stores/audiophile';
import { licenseState } from '../stores/license';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { presenceCrosstalk, entreesAvecCrosstalk } from '../stores/crosstalk';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { crosstalkTraite } from '../crosstalk';
import { etatBoutonCrossfeed } from '../boutonCrossfeed';
import CrossfeedV2 from '../../components/v2/CrossfeedV2.svelte';
import CrossfeedProV2 from '../../components/v2/CrossfeedProV2.svelte';
import CrosstalkV2 from '../../components/v2/CrosstalkV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const ZONE = 7616;

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

const COLLECTIONS = /\/(zones|devices|presets|plugins|profiles)(\?|$)/;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function servir(crosstalkCoche: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/audio-plugins/crosstalk/zones/')) {
      return reponse({ plugin: 'crosstalk', zone_id: ZONE, active: true, settings: { enabled: crosstalkCoche } });
    }
    if (u.includes('/audio-plugins/crossfeed-pro/zones/')) {
      return reponse({ plugin: 'crossfeed-pro', zone_id: ZONE, active: true, settings: { enabled: true } });
    }
    if (new RegExp(`/zones/${ZONE}/dsp`).test(u)) {
      return reponse({ crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.3 } });
    }
    if (u.includes('/profiles')) return reponse({ profiles: [] });
    return reponse(COLLECTIONS.test(u) ? [] : {});
  }));
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  audiophileEnabled.set(false);
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium' }));
  zones.set([{ id: ZONE, name: 'Salon', state: 'stopped', channel_layout: null } as any]);
  currentZoneId.set(ZONE);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  presenceCrossfeedPro.set('inconnue');
  presenceCrosstalk.set('inconnue');
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([]);
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
async function laisserRepondre() {
  for (let i = 0; i < 20; i++) { flushSync(); await new Promise((r) => setTimeout(r, 0)); }
}
const q = (sel: string) => hote!.querySelector(sel) as HTMLElement | null;
const texte = (cle: string) => get(t)(cle as any);

describe('crosstalkTraite — déduit du réglage de zone', () => {
  it('vrai seulement greffon actif ET case cochée sur la zone', () => {
    expect(crosstalkTraite({ active: true, settings: { enabled: true } })).toBe(true);
    expect(crosstalkTraite({ active: true, settings: { enabled: false } })).toBe(false);
    expect(crosstalkTraite({ active: false, settings: { enabled: true } })).toBe(false);
    expect(crosstalkTraite({ active: true, settings: null })).toBe(false);
    expect(crosstalkTraite(null)).toBe(false);
  });

  it('l’entrée STUDIO « crosstalk » n’apparaît que si le greffon est actif', () => {
    const items = [{ view: 'crossfeed' }, { view: 'crosstalk' }];
    expect(entreesAvecCrosstalk(items, 'actif')).toEqual(items);
    expect(entreesAvecCrosstalk(items, 'absent')).toEqual([{ view: 'crossfeed' }]);
    expect(entreesAvecCrosstalk(items, 'inconnue')).toEqual([{ view: 'crossfeed' }]);
  });
});

describe('crossfeed intégré écarté par Crosstalk', () => {
  it('🔴 Crosstalk actif : le pavé crossfeed intégré se présente écarté (phrase, verrou)', async () => {
    servir(true);
    monte = mount(CrossfeedV2, { target: hote! });
    await jusqua(() => !!q('[data-crossfeed-ecarte]'));
    expect(q('[data-crossfeed-ecarte]'), 'aucune phrase : le crossfeed semble encore actif').toBeTruthy();
    expect(q('[data-crossfeed-ecarte]')!.textContent).toContain(texte('dsp.crossfeedSetAsideByCrosstalk'));
    // Une seule phrase : celle de Crosstalk, pas « Crossfeed Pro traite cette zone ».
    expect(q('[data-crossfeed-remplace]')).toBeNull();
    const fs = q('fieldset.reglages') as HTMLFieldSetElement;
    expect(fs.disabled).toBe(true);
    expect(fs.classList.contains('voile')).toBe(true);
  });

  it('contre-épreuve — Crosstalk décoché : ni phrase Crosstalk', async () => {
    servir(false);
    monte = mount(CrossfeedV2, { target: hote! });
    await jusqua(() => !!q('.presets'));
    await laisserRepondre();
    expect(q('[data-crossfeed-ecarte]')).toBeNull();
  });
});

describe('Crossfeed Pro écarté par Crosstalk', () => {
  it('🔴 Crosstalk actif : le pavé Crossfeed Pro se présente écarté (phrase, verrou)', async () => {
    servir(true);
    monte = mount(CrossfeedProV2, { target: hote! });
    await jusqua(() => !!q('[data-cfp-motif="crosstalk"]'));
    expect(q('[data-cfp-motif="crosstalk"]')!.textContent).toContain(texte('v2.cfp.setAsideByCrosstalk'));
    expect((q('fieldset.reglages') as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('contre-épreuve — Crosstalk décoché : Crossfeed Pro reste réglable', async () => {
    servir(false);
    monte = mount(CrossfeedProV2, { target: hote! });
    await jusqua(() => !!q('fieldset.reglages'));
    await laisserRepondre();
    expect(q('[data-cfp-motif="crosstalk"]')).toBeNull();
    expect((q('fieldset.reglages') as HTMLFieldSetElement).disabled).toBe(false);
  });
});

describe('dans l’autre sens : l’écran Crosstalk prévient', () => {
  it('🔴 l’interrupteur dit que l’activer éteint le crossfeed de la zone', async () => {
    servir(false);
    monte = mount(CrosstalkV2, { target: hote! });
    await jusqua(() => !!q('[data-xtc="exclusion"]'));
    expect(q('[data-xtc="exclusion"]')!.textContent).toBe(texte('v2.xtc.excludesCrossfeed'));
  });
});

describe('Lecture en cours', () => {
  it('Crosstalk actif : le bouton crossfeed ne s’allume pas, ni intégré ni Crossfeed Pro', () => {
    expect(etatBoutonCrossfeed({ cfEnabled: true, cfProTraite: true, pur: false, crosstalk: true }))
      .toEqual({ actif: false, pro: false, voile: null });
    expect(etatBoutonCrossfeed({ cfEnabled: true, cfProTraite: false, pur: false, crosstalk: false }))
      .toEqual({ actif: true, pro: false, voile: null });
  });

  const source = readFileSync(resolve(__dirname, '../../components/partages/NowPlaying.svelte'), 'utf8');
  it('Crosstalk actif : la phrase et le verrou du crossfeed intégré', () => {
    expect(source).toContain('crosstalkTraiteLaZone(zid)');
    expect(source).toContain("{#if cfCrosstalk}\n                <p class=\"cf-note cf-note-alerte\" data-crossfeed-ecarte>{$t('dsp.crossfeedSetAsideByCrosstalk' as any)}</p>");
    expect(source).toContain('<fieldset class="cf-verrou" disabled={cfProTraite || cfCrosstalk}');
    expect(source).toContain('checked={cfEnabled && !cfProTraite && !cfCrosstalk}');
  });
});

describe('les phrases d’exclusion existent dans les quinze langues', () => {
  it('nomment Crosstalk, et Crossfeed Pro pour son pavé', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const c of ['dsp.crossfeedSetAsideByCrosstalk', 'v2.cfp.setAsideByCrosstalk', 'v2.xtc.excludesCrossfeed']) {
        expect(d[c], `${c} manque en ${l}`).toBeTruthy();
      }
      expect(d['dsp.crossfeedSetAsideByCrosstalk']).toContain('Crosstalk');
      expect(d['v2.cfp.setAsideByCrosstalk']).toContain('Crossfeed Pro');
      expect(d['v2.xtc.excludesCrossfeed']).toContain('Crossfeed Pro');
    }
  });
});
