// @vitest-environment jsdom
//
// rc14 — tune-server-rust#9555 : la marge de l'utilisateur (étape `headroom`,
// `params.db`, ex. −12) et la marge PROPRE du modulateur DSD (étape
// `dsd_modulator`, `params.modulator_margin_db`, −3) sont deux lignes séparées.
// Le client n'additionne jamais les deux. Serveur ancien : rien ne s'affiche.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import CheminTessBarre from '../../components/v2/tess/CheminTessBarre.svelte';
import { locale } from '../i18n';
import { capaciteTess } from '../stores/tess';
import { catalogueSimule } from '../tessSimulation';
import { margeModulateurDsd, ligneMargeModulateurDsd } from '../tessBarre';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const modulateur = (extra: Record<string, unknown> = {}) => ({
  code: 'dsd_modulator', plugin_id: null, fixed: true, requested: true, effective: true, reason: null, detail: null,
  latency_frames: null, name: 'DSD modulator',
  params: { order: 7, rate_hz: 2822400, transport: 'dop', zero_dbfs_modulation: 0.5, reference_level: '0 dB SACD', ...extra },
});
const headroom = {
  code: 'headroom', plugin_id: null, fixed: true, requested: true, effective: true, reason: null, detail: null,
  latency_frames: null, name: 'Headroom', params: { mode: 'manual', db: -12 },
};
const etapes = (extra?: Record<string, unknown>) => [headroom, modulateur(extra)];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const texte = () => hote!.textContent!.replace(/\s+/g, ' ');
const lignes = () => Array.from(hote!.querySelectorAll('[data-tess-marge-modulateur-dsd]'));

function monterTess(steps: unknown[]) {
  const rien = () => {};
  monte = mount(CheminTess, {
    target: hote!,
    props: {
      reponse: {
        transport: 'local', headroom_db: -12,
        volume: { control: 'software', placement: null, db: 0 },
        chain: { version: 1, bypass: false, plugins: [], fixed: { upsampling: { mode: 'dsd', rate: 'dsd64' } } },
        signal_path: steps, catalog: catalogueSimule(),
      } as any,
      verrouDe: () => null,
      onSelect: rien, onToggle: rien, onRemove: rien, onMove: rien, onBypass: rien, onAdd: rien,
    },
  });
  flushSync();
}
function monterBarre(steps: unknown[]) {
  monte = mount(CheminTessBarre, {
    target: hote!,
    props: { signalPath: { bit_perfect: false, steps: [], summary: '', tess: { badge: 'processed_by_tess', headroom_db: -12, volume: null, level: null, discrepancies: [], steps } } },
  });
  flushSync();
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  locale.set('en');
  capaciteTess.set('oui');
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  capaciteTess.set('inconnue');
});

describe('rc14 — marge du modulateur DSD', () => {
  it('lecture pure : présent → −3, absent ou illisible → null', () => {
    expect(margeModulateurDsd(modulateur({ modulator_margin_db: -3 }))).toBe(-3);
    expect(margeModulateurDsd(modulateur())).toBeNull();
    expect(margeModulateurDsd(modulateur({ modulator_margin_db: '-3' }))).toBeNull();
    expect(margeModulateurDsd(headroom)).toBeNull();
    expect(ligneMargeModulateurDsd(modulateur({ modulator_margin_db: -3 }), (k) => dictionnaire('en')[k])).toBe('DSD modulator margin: −3 dB');
  });

  it('écran TESS : champ présent → « DSD modulator margin: −3 dB », la marge utilisateur reste −12', () => {
    monterTess(etapes({ modulator_margin_db: -3 }));
    expect(lignes().length).toBe(1);
    expect(lignes()[0].textContent).toBe('DSD modulator margin: −3 dB');
    expect(texte()).toContain('−12 dB');
    expect(texte()).not.toContain('−15');
  });

  it('écran TESS : champ absent (serveur ancien) → aucune ligne', () => {
    monterTess(etapes());
    expect(lignes().length).toBe(0);
    expect(texte()).not.toContain('margin');
  });

  it('panneau du chemin du signal : champ présent → la ligne, sans somme', () => {
    monterBarre(etapes({ modulator_margin_db: -3 }));
    expect(lignes().length).toBe(1);
    expect(lignes()[0].textContent).toBe('DSD modulator margin: −3 dB');
    expect(texte()).not.toContain('−15');
  });

  it('panneau du chemin du signal : champ absent → aucune ligne', () => {
    monterBarre(etapes());
    expect(lignes().length).toBe(0);
  });

  it('la clé existe, avec {db}, dans les vingt langues', () => {
    for (const l of ONZE_LANGUES) {
      const v = dictionnaire(l)['tess.dsdModulatorMargin'];
      expect(v, l).toContain('{db}');
      if (l !== 'en') expect(v, l).not.toBe(dictionnaire('en')['tess.dsdModulatorMargin']);
    }
  });
});
