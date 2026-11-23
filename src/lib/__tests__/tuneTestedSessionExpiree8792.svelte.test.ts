// @vitest-environment jsdom
//
// tune-server-rust#8792 — quand le site refuse la proposition Tune tested
// en 401 (toutes les identités du serveur refusées : jeton de compte révoqué,
// sans licence acceptée), l'écran dit de SE RECONNECTER, pas « réessayez plus
// tard » : réessayer n'y changerait rien.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const getTuneTestedProposition = vi.fn();
const proposerTuneTested = vi.fn();
vi.mock('../api', () => ({
  getTuneTestedProposition: (...a: unknown[]) => getTuneTestedProposition(...a),
  proposerTuneTested: (...a: unknown[]) => proposerTuneTested(...a),
}));

import ProposerTuneTested from '../../components/v2/ProposerTuneTested.svelte';
import {
  avecParametres,
  messageDeRefus,
  type EtatTuneTested,
} from '../tuneTestedProposition';
import { ONZE_LANGUES, dictionnaire, fr, en } from './onzeDictionnaires';

const CLE = 'v2.tuneTestedPropose.err.siteSessionExpired';
const tEn = avecParametres((cle) => (en as unknown as Record<string, string>)[cle] ?? cle);
const tFr = avecParametres((cle) => (fr as unknown as Record<string, string>)[cle] ?? cle);

const ETAT: EtatTuneTested = {
  eligible: true,
  seconds_without_error: 3700,
  threshold_seconds: 3600,
  remaining_seconds: 0,
  already_proposed: false,
  reason: null,
  preview: {
    schema_version: 1,
    device_key: 'b'.repeat(64),
    brand: 'Test Audio',
    model: 'DAC 8792',
    commercial_name: null,
    output_type: 'dlna',
    formats: [{ codec: 'flac', sample_rate: 96000, bit_depth: 24, dsd_mode: null }],
    gapless: true,
    error_free_seconds: 3700,
    tune_version: '1.0.0-rc12',
    platform: 'linux',
    instance_id: 'instance-essai-8792',
  },
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  getTuneTestedProposition.mockReset();
  proposerTuneTested.mockReset();
});

const souffler = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('Tune tested : 401 du site (tune-server-rust#8792)', () => {
  it('un 401 du site dit de se reconnecter, pas de réessayer plus tard', () => {
    expect(messageDeRefus('tune_tested_site_refused', tEn, 401)).toBe(tEn(CLE));
    expect(messageDeRefus('tune_tested_site_refused', tEn, 401))
      .not.toBe(tEn('v2.tuneTestedPropose.err.failed'));
    // Contre-épreuve : les autres statuts gardent leur message.
    expect(messageDeRefus('tune_tested_site_refused', tEn, 429))
      .toBe(tEn('v2.tuneTestedPropose.err.tooMany'));
    expect(messageDeRefus('tune_tested_site_refused', tEn, 422))
      .toBe(tEn('v2.tuneTestedPropose.err.failed'));
    expect(messageDeRefus('tune_tested_site_refused', tEn))
      .toBe(tEn('v2.tuneTestedPropose.err.failed'));
  });

  it('la fenêtre montre ce message après un refus 401 rendu en 502', async () => {
    getTuneTestedProposition.mockResolvedValue(ETAT);
    proposerTuneTested.mockRejectedValue(
      Object.assign(new Error('Bad Gateway'), {
        code: 'tune_tested_site_refused',
        corps: { error: 'tune_tested_site_refused', code: 'tune_tested_site_refused', status: 401 },
      }),
    );
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ProposerTuneTested, { target: hote, props: { zoneId: 7, nom: 'Salon', onClose: () => {} } });
    await souffler();
    flushSync();
    (q('tt-proposer') as HTMLButtonElement).click();
    flushSync();
    (q('tt-confirmer') as HTMLButtonElement).click();
    await souffler();
    flushSync();
    const alerte = document.querySelector('[role="alert"]');
    expect(alerte?.textContent).toBe(tFr(CLE));
    expect(alerte?.textContent).toContain('mozaiklabs.fr');
  });

  it('le message existe, traduit, dans les 20 langues', () => {
    expect(ONZE_LANGUES.length).toBe(20);
    for (const code of ONZE_LANGUES) {
      const texte = dictionnaire(code)[CLE];
      expect(texte, code).toBeTruthy();
      expect(texte, code).toContain('mozaiklabs.fr');
      expect(texte, code).toContain('Cloud');
      if (code !== 'en') expect(texte, `${code} non traduit`).not.toBe(dictionnaire('en')[CLE]);
    }
  });
});
