// @vitest-environment jsdom
//
// Crossfeed Pro et crossfeed intégré ne s'additionnent JAMAIS (Refs
// tune-server-rust#2742).
//
// Quand le greffon traite la zone (actif, case cochée), l'hôte éteint le
// crossfeed intégré. Les écrans du crossfeed intégré le disent et le
// verrouillent, et Lecture en cours nomme l'entrée « Crossfeed Pro ».
//
// Contre-épreuve : sans `proTraite` dans `CrossfeedV2` (ni avertissement, ni
// fieldset verrouillé), le témoin « greffon actif » rougit ; le témoin
// « case décochée » reste vert, il garde l'autre sens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { currentZoneId } from '../stores/zones';
import { audiophileEnabled } from '../stores/audiophile';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { crossfeedProTraite } from '../crossfeedPro';
import CrossfeedV2 from '../../components/v2/CrossfeedV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

const COLLECTIONS = /\/(zones|devices|presets|plugins|profiles)(\?|$)/;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function servir(proCoche: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/audio-plugins/crossfeed-pro/zones/')) {
      return reponse({ plugin: 'crossfeed-pro', zone_id: 27420, active: true, settings: { enabled: proCoche } });
    }
    if (/\/zones\/27420\/dsp/.test(u)) {
      return reponse({ crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.3 } });
    }
    return reponse(COLLECTIONS.test(u) ? [] : {});
  }));
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  audiophileEnabled.set(false);
  currentZoneId.set(27420);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
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

describe('crossfeedProTraite', () => {
  it('vrai seulement greffon actif ET case cochée sur la zone', () => {
    expect(crossfeedProTraite({ active: true, settings: { enabled: true } })).toBe(true);
    expect(crossfeedProTraite({ active: true, settings: { enabled: false } })).toBe(false);
    expect(crossfeedProTraite({ active: false, settings: { enabled: true } })).toBe(false);
    expect(crossfeedProTraite({ active: true, settings: null })).toBe(false);
    expect(crossfeedProTraite({ active: true })).toBe(false);
    expect(crossfeedProTraite(null)).toBe(false);
    expect(crossfeedProTraite(undefined)).toBe(false);
  });
});

describe('écran Crossfeed (intégré) quand Crossfeed Pro traite la zone', () => {
  it('greffon actif, case cochée : avertissement et réglages verrouillés', async () => {
    servir(true);
    monte = mount(CrossfeedV2, { target: hote! });
    await jusqua(() => !!hote!.querySelector('[data-crossfeed-remplace]'));
    const avis = hote!.querySelector('[data-crossfeed-remplace]');
    expect(avis, 'aucun avertissement : le crossfeed intégré semble encore réglable').toBeTruthy();
    expect(avis!.textContent).toContain(get(t)('dsp.crossfeedReplacedByPro' as any));
    const fs = hote!.querySelector('fieldset.reglages') as HTMLFieldSetElement | null;
    expect(fs, 'aucun fieldset autour des réglages').toBeTruthy();
    expect(fs!.disabled).toBe(true);
    expect(fs!.contains(hote!.querySelector('.card input[type="checkbox"]'))).toBe(true);
  });

  it('case du greffon décochée : ni avertissement, ni verrou', async () => {
    servir(false);
    monte = mount(CrossfeedV2, { target: hote! });
    await jusqua(() => !!hote!.querySelector('.presets'));
    // Laisser la sonde du greffon répondre.
    for (let i = 0; i < 20; i++) { flushSync(); await new Promise((r) => setTimeout(r, 0)); }
    expect(hote!.querySelector('[data-crossfeed-remplace]')).toBeNull();
    const fs = hote!.querySelector('fieldset.reglages') as HTMLFieldSetElement | null;
    if (fs) expect(fs.disabled).toBe(false);
  });
});

describe('Lecture en cours', () => {
  const source = readFileSync(resolve(__dirname, '../../components/partages/NowPlaying.svelte'), 'utf8');
  it('nomme l’entrée « Crossfeed Pro » et verrouille le crossfeed intégré quand le greffon traite', () => {
    expect(source).toContain("cfProTraite ? $t('v2.nav.crossfeedPro' as any) : $t('dsp.crossfeedTitle')");
    expect(source).toContain("checked={cfEnabled && !cfProTraite}");
    // Le crossfeed intégré entier est DANS le fieldset verrouillé.
    const debut = source.indexOf('<fieldset class="cf-verrou" disabled={cfProTraite}');
    const fin = source.indexOf('</fieldset>', debut);
    expect(debut, 'aucun verrou autour du crossfeed intégré').toBeGreaterThan(-1);
    const verrou = source.slice(debut, fin);
    expect(verrou).toContain('onchange={(e) => { cfEnabled =');
    expect(verrou).toContain('{#each CF_PRESETS as p (p.key)}');
    expect(verrou).toContain('oninput={planifierCrossfeed}');
    expect(source).toContain("{#if cfProTraite}\n                <p class=\"cf-note cf-note-alerte\" data-crossfeed-remplace>");
  });
});

describe('le libellé existe dans les onze langues', () => {
  it('dsp.crossfeedReplacedByPro nomme Crossfeed Pro', () => {
    for (const l of ONZE_LANGUES) {
      const v = dictionnaire(l)['dsp.crossfeedReplacedByPro'];
      expect(v, `manque en ${l}`).toBeTruthy();
      expect(v, `ne nomme pas Crossfeed Pro en ${l}`).toContain('Crossfeed Pro');
      expect(v, `double encodage en ${l}`).not.toMatch(/Ã|â€/);
    }
  });
});
