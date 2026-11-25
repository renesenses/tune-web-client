// @vitest-environment jsdom
//
// rc13.91 — Xavier (Windows, mode partagé, 25/11) : suréchantillonnage
// activé sur la page du greffon, aucun changement au DAC, et ni TESS ni la
// page ne disaient pourquoi. Le serveur publie désormais la raison observée
// par la sortie, déjà traduite :
//   - étape `upsampling` du chemin TESS : `params.refusal_text` ;
//   - `GET /upsampler/zones/{id}` : `observed_refusal.description`.
// L'écran l'affiche à la place du « Requested but not running » générique.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import { locale } from '../i18n';
import { catalogueSimule } from '../tessSimulation';
import { texteDuRefusSurechantillonnage, texteDuRefusObserve } from '../tessRefusSurechantillonnage';

const PHRASE =
  'Upsampling inactive: in shared mode the DAC runs at the system mixer rate, which is not an integer multiple of the source. Set the device\'s default format in the Windows sound settings';

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function etapeUpsampling(params: Record<string, unknown>) {
  return {
    code: 'upsampling', plugin_id: null, fixed: true, requested: true, effective: false,
    reason: 'not_in_service', detail: 'shared_mixer_rate_not_a_multiple', params, latency_frames: null,
    name: 'Upsampling',
  };
}

function monter(params: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  const rien = () => {};
  monte = mount(CheminTess, {
    target: hote,
    props: {
      reponse: {
        transport: 'local',
        headroom_db: 0,
        volume: { control: 'software', placement: null, db: 0 },
        chain: {
          version: 1,
          bypass: false,
          plugins: [],
          fixed: { upsampling: { mode: 'pcm', filter: 'precision', max_ratio: null, max_rate_hz: null } },
        },
        signal_path: [
          { code: 'source', fixed: true, requested: true, effective: true, params: null, name: 'Source' },
          etapeUpsampling(params),
          { code: 'output', fixed: true, requested: true, effective: true, params: null, name: 'Output' },
        ],
        catalog: catalogueSimule(),
      } as any,
      verrouDe: () => null,
      onSelect: rien, onToggle: rien, onRemove: rien, onMove: rien, onBypass: rien, onAdd: rien,
    },
  });
  flushSync();
}

const texteUpsampling = () =>
  hote!.querySelector<HTMLElement>('[data-tess-etape="upsampling"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

beforeEach(() => { locale.set('en'); });
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
});

describe('chemin TESS : la raison du refus de la sortie', () => {
  it('affiche la phrase du serveur sur l’étape Suréchantillonnage', () => {
    monter({ target: 'pcm', filter: 'precision', refusal: 'shared_mixer_rate_not_a_multiple', refusal_text: PHRASE });
    expect(texteUpsampling()).toContain('Windows sound settings');
    expect(texteUpsampling()).not.toMatch(/Requested but not running/);
  });

  it('témoin : un serveur ancien (sans refusal_text) garde le motif d’avant', () => {
    monter({ target: 'pcm', filter: 'precision' });
    expect(texteUpsampling()).not.toContain('Windows');
    expect(texteUpsampling().length).toBeGreaterThan(0);
  });

  it('fonction pure : seulement sur l’étape upsampling, et jamais une chaîne vide', () => {
    expect(texteDuRefusSurechantillonnage({ code: 'upsampling', params: { refusal_text: PHRASE } })).toBe(PHRASE);
    expect(texteDuRefusSurechantillonnage({ code: 'volume', params: { refusal_text: PHRASE } })).toBeNull();
    expect(texteDuRefusSurechantillonnage({ code: 'upsampling', params: { refusal_text: '  ' } })).toBeNull();
    expect(texteDuRefusSurechantillonnage({ code: 'upsampling', params: null })).toBeNull();
    expect(texteDuRefusSurechantillonnage(null)).toBeNull();
  });
});

describe('page du greffon : le refus observé', () => {
  const refus = { reason: 'rates_not_measured', description: 'Upsampling inactive: device rates not measured (…)' };

  it('activé, sans contrainte de réglage : la phrase du serveur', () => {
    expect(texteDuRefusObserve({ settings: { enabled: true }, constraint: null, observed_refusal: refus }))
      .toBe(refus.description);
  });

  it('désactivé, contrainte de réglage, ou serveur ancien : rien', () => {
    expect(texteDuRefusObserve({ settings: { enabled: false }, constraint: 'disabled', observed_refusal: refus })).toBeNull();
    expect(texteDuRefusObserve({ settings: { enabled: true }, constraint: 'pure', observed_refusal: refus })).toBeNull();
    expect(texteDuRefusObserve({ settings: { enabled: true }, constraint: null })).toBeNull();
    expect(texteDuRefusObserve(null)).toBeNull();
  });

  it('l’écran affiche le refus observé', () => {
    const src = readFileSync(join(__dirname, '../../components/v2/SurechantillonnageV2.svelte'), 'utf8');
    expect(src).toMatch(/texteDuRefusObserve\(etat\)/);
    expect(src).toMatch(/data-refus-observe/);
  });
});
