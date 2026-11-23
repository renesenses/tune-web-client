// @vitest-environment jsdom
//
// Lot TESS W5 — le chemin du signal depuis la barre de lecture (maquette A4).
//
// Ce que ces témoins prouvent, sur le composant réellement monté et des blocs
// `tess` de la forme que publie le serveur (T16, `tune-core/src/tess/chemin.rs` :
// `CheminTess { badge, headroom_db, volume, level, steps, discrepancies }`,
// chaque étape `EtapeNommee` = `name` + `EtapeResolue` aplatie) :
//   1. étapes TESS et paramètres (« −3 dB · on automatically », « room_96k.wav »,
//      « 31 bands · Jazz », « Software · −18 dB », « TPDF ») ;
//   2. ORDRE AFFICHÉ = ORDRE RENVOYÉ, même s'il diffère de Q9 ; exception DSD ;
//   3. Pure : pas d'encadré TESS, badge « Bit-perfect » (celui du serveur) ;
//      Pure avec un volume logiciel : pas d'encadré, le volume reste écrit et
//      le badge du serveur n'est PAS remplacé par « Bit-perfect » ;
//   4. serveur sans TESS (capacité `non`, route en 404) ou sans bloc `tess` :
//      rien de nouveau dans le panneau ;
//   5. « Open TESS » ouvre l'écran et ferme le panneau ;
//   6. les nouvelles clés existent dans les vingt langues, traduites.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { activeView } from '../stores/navigation';
import { capaciteTess } from '../stores/tess';
import { locale } from '../i18n';
import CheminTessBarre from '../../components/v2/tess/CheminTessBarre.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const etape = (code: string, x: Record<string, unknown> = {}) => ({
  name: code, code, plugin_id: null, fixed: true, requested: true, effective: true,
  reason: null, detail: null, params: null, latency_frames: null, ...x,
});
const greffon = (id: string, params: Record<string, unknown>, x: Record<string, unknown> = {}) =>
  etape('plugin', { plugin_id: id, fixed: false, params, ...x });

/** A4 corrigée (Q9) : Source · Headroom · Convolution · Graphic EQ · Upsampling (off) · Volume · Dither · Output. */
function cheminA4() {
  return {
    bit_perfect: false,
    steps: [{ name: 'Source', description: 'FLAC 24-bit / 96 kHz' }],
    summary: '',
    tess: {
      badge: 'processed_by_tess',
      headroom_db: -3,
      volume: { control: 'software', placement: 'at_render', db: -18 },
      level: null,
      discrepancies: [],
      steps: [
        etape('source', { params: { kind: 'pcm', sample_rate_hz: 96000, bits: 24, channels: 2 } }),
        etape('headroom', { params: { mode: 'auto', db: -3 } }),
        greffon('convolution', { filter: 'room_96k.wav' }),
        greffon('equalizer-graphic', { bands: 31, preset: 'Jazz' }),
        etape('upsampling', { requested: false, effective: false }),
        etape('volume', { params: { control: 'software', db: -18 } }),
        etape('quantization', { params: { dither: 'tpdf' } }),
        etape('output'),
      ],
    },
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let fermetures = 0;

function monter(signalPath: unknown) {
  monte = mount(CheminTessBarre, { target: hote!, props: { signalPath, onouvrir: () => { fermetures++; } } });
  flushSync();
}
const un = (sel: string) => hote!.querySelector<HTMLElement>(sel);
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));
const etapesAffichees = () => tous('[data-tess-encadre] [data-tess-etape]').map((e) => e.dataset.tessEtape);
const texteDe = (id: string) => un(`[data-tess-encadre] [data-tess-etape="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  locale.set('en');
  capaciteTess.set('oui');
  activeView.set('home');
  fermetures = 0;
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  capaciteTess.set('inconnue');
});

describe('W5 — 1. étapes TESS et paramètres', () => {
  it('badge « Processed by TESS · 64-bit » et chaque étape avec ses paramètres', () => {
    monter(cheminA4());
    expect(un('[data-tess-badge]')!.textContent).toBe('Processed by TESS · 64-bit');
    expect(texteDe('headroom')).toBe('Headroom −3 dB · on automatically');
    expect(texteDe('convolution')).toBe('Convolution room_96k.wav');
    expect(texteDe('equalizer-graphic')).toBe('Graphic EQ 31 bands · Jazz');
    expect(texteDe('volume')).toBe('Volume control Software · −18 dB');
    expect(texteDe('quantization')).toBe('Dither TPDF');
  });

  it('source et sortie restent aux étapes historiques ; un étage non demandé (upsampling off) est tu', () => {
    monter(cheminA4());
    expect(etapesAffichees()).not.toContain('source');
    expect(etapesAffichees()).not.toContain('output');
    expect(etapesAffichees()).not.toContain('upsampling');
  });

  it('un greffon demandé mais éteint reste écrit, avec son motif', () => {
    const sp = cheminA4();
    sp.tess.steps[3] = greffon('equalizer-parametric', { bands: 5 }, { effective: false, reason: 'premium_required' });
    monter(sp);
    expect(texteDe('equalizer-parametric')).toBe('Parametric EQ Requires Premium');
    expect(un('[data-tess-etape="equalizer-parametric"]')!.classList.contains('eteinte')).toBe(true);
  });
});

describe('W5 — 2. ordre affiché = ordre renvoyé', () => {
  it('🔴 Q9 : Headroom → greffons → Upsampling → Volume → Dither, à la lettre', () => {
    const sp = cheminA4();
    sp.tess.steps[4] = etape('upsampling', { params: { target: 'pcm', filter: 'linear', max_ratio: 2, max_rate_hz: 192000 } });
    monter(sp);
    expect(etapesAffichees()).toEqual(['headroom', 'convolution', 'equalizer-graphic', 'upsampling', 'volume', 'quantization']);
    expect(texteDe('upsampling')).toBe('Upsampling PCM · ×2 · 192 kHz · linear');
  });

  it('🔴 le client ne trie pas : un ordre de greffons inverse est rendu inverse', () => {
    const sp = cheminA4();
    [sp.tess.steps[2], sp.tess.steps[3]] = [sp.tess.steps[3], sp.tess.steps[2]];
    monter(sp);
    expect(etapesAffichees().slice(1, 3)).toEqual(['equalizer-graphic', 'convolution']);
  });

  it('exception DSD : Upsampling → Volume → DSD modulator, sans Dither', () => {
    const sp = cheminA4();
    sp.tess.volume.placement = 'before_dsd_modulator';
    sp.tess.steps.splice(4, 3,
      etape('upsampling', { params: { target: 'dsd', rate: 'dsd128' } }),
      etape('volume', { params: { control: 'software', db: -18 } }),
      etape('dsd_modulator', { params: { target: 'dsd', rate: 'dsd128' } }));
    monter(sp);
    expect(etapesAffichees()).toEqual(['headroom', 'convolution', 'equalizer-graphic', 'upsampling', 'volume', 'dsd_modulator']);
    expect(texteDe('dsd_modulator')).toBe('DSD modulator DSD128');
  });
});

describe('W5 — 3. mode Pure', () => {
  function pure(volumeDb: number) {
    const sp: any = cheminA4();
    sp.pure = true;
    const logiciel = volumeDb !== 0;
    sp.tess.badge = logiciel ? 'processed_by_tess' : 'bit_perfect';
    sp.tess.headroom_db = 0;
    sp.tess.volume.db = volumeDb;
    sp.tess.steps = [
      etape('source', { params: { kind: 'pcm', sample_rate_hz: 96000, bits: 24, channels: 2 } }),
      etape('headroom', { effective: false, reason: 'pure_mode', params: { mode: 'auto', db: -3 } }),
      greffon('convolution', { filter: 'room_96k.wav' }, { effective: false, reason: 'pure_mode' }),
      etape('volume', { requested: logiciel, effective: logiciel, params: { control: 'software', db: volumeDb } }),
      etape('quantization', logiciel
        ? { params: { dither: 'tpdf' } }
        : { effective: false, reason: 'nothing_to_quantize', detail: 'Bit-perfect', params: { dither: 'tpdf' } }),
      etape('output'),
    ];
    return sp;
  }

  it('🔴 Pure à 0 dB : l’étape TESS disparaît et le badge lit « Bit-perfect »', () => {
    monter(pure(0));
    expect(un('[data-tess-encadre]')).toBeNull();
    expect(un('[data-tess-hors-encadre]')).toBeNull();
    const b = un('[data-tess-badge]')!;
    expect(b.textContent).toBe('Bit-perfect');
    expect(b.dataset.tessBadge).toBe('bit_perfect');
  });

  it('🔴 Pure avec volume logiciel : pas d’encadré, le volume reste dit, et pas de faux « Bit-perfect »', () => {
    monter(pure(-18));
    expect(un('[data-tess-encadre]')).toBeNull();
    const hors = tous('[data-tess-hors-encadre] [data-tess-etape]').map((e) => e.dataset.tessEtape);
    expect(hors).toEqual(['volume', 'quantization']);
    expect(un('[data-tess-badge]')!.textContent).not.toBe('Bit-perfect');
  });
});

describe('W5 — 4. caché sans la capacité serveur', () => {
  it('🔴 serveur sans TESS (404 ⇒ `non`) : rien, même si un bloc traînait', () => {
    capaciteTess.set('non');
    monter(cheminA4());
    expect(un('[data-tess-barre]')).toBeNull();
  });
  it('capacité pas encore sue : rien', () => {
    capaciteTess.set('inconnue');
    monter(cheminA4());
    expect(un('[data-tess-barre]')).toBeNull();
  });
  it('chemin du signal sans bloc `tess` (serveur d’avant T16, ou chaîne illisible) : rien', () => {
    const sp: any = cheminA4();
    delete sp.tess;
    monter(sp);
    expect(un('[data-tess-barre]')).toBeNull();
    unmount(monte!); monte = null;
    monter(null);
    expect(un('[data-tess-barre]')).toBeNull();
  });
  it('badge d’une version future : pas de badge inventé, les étapes restent', () => {
    const sp = cheminA4();
    sp.tess.badge = 'processed_by_tess_and_room';
    monter(sp);
    expect(un('[data-tess-badge]')).toBeNull();
    expect(etapesAffichees().length).toBe(5);
  });
  it('zone hors TESS (HQPlayer, Diretta) : badge « Outside TESS », aucun encadré', () => {
    const sp = cheminA4();
    sp.tess.badge = 'outside_tess';
    monter(sp);
    expect(un('[data-tess-badge]')!.textContent).toBe('Outside TESS');
    expect(un('[data-tess-encadre]')).toBeNull();
  });
});

describe('W5 — 5. Open TESS', () => {
  it('ouvre l’écran TESS et ferme le panneau', () => {
    monter(cheminA4());
    un('[data-tess-ouvrir]')!.click();
    expect(get(activeView)).toBe('tess');
    expect(fermetures).toBe(1);
  });
});

describe('W5 — 6. vingt langues', () => {
  const CLES = ['tess.badge.bit_perfect', 'tess.badge.processed_by_tess', 'tess.badge.outside_tess',
    'tess.badge.altered_outside_tess', 'tess.bands'];
  it('chaque clé existe dans chaque langue ; les badges TESS sont traduits hors de l’anglais', () => {
    const en = dictionnaire('en');
    expect(ONZE_LANGUES.length).toBe(20);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of CLES) expect(d[k], `${code} ${k}`).toBeTruthy();
      if (code !== 'en') expect(d['tess.badge.processed_by_tess'], code).not.toBe(en['tess.badge.processed_by_tess']);
      expect(d['tess.bands'], code).toMatch(/\{n, plural,/);
    }
  });
  it('en français : badge et bandes traduits', () => {
    locale.set('fr');
    monter(cheminA4());
    expect(un('[data-tess-badge]')!.textContent).toBe('Traité par TESS · 64 bits');
    expect(texteDe('equalizer-graphic')).toContain('31 bandes');
  });
});
