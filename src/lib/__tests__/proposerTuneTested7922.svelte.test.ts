// @vitest-environment jsdom
//
// tune-server-rust#7922 — « Proposer cet appareil pour Tune tested ».
//
// Ce que ces témoins clouent :
//  1. avant une heure sans erreur, le bouton est GRISÉ et dit le temps restant ;
//  2. après, il ouvre l'aperçu EXACT de l'envoi (le corps rendu par le serveur,
//     tel quel) et RIEN ne part avant la confirmation ;
//  3. la confirmation envoie une seule fois et dit que c'est parti ;
//  4. un refus s'affiche par son code nommé, jamais par le texte brut.
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
  duree,
  etatDuBouton,
  libelleFormat,
  lignesApercu,
  messageDeRefus,
  type ApercuTuneTested,
  type EtatTuneTested,
} from '../tuneTestedProposition';
import en from '../locales/en';
import fr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const tEn = avecParametres((cle) => (en as Record<string, string>)[cle] ?? cle);
// L'interface des tests est en français : la fenêtre montée parle français.
const tFr = avecParametres((cle) => (fr as Record<string, string>)[cle] ?? cle);

const APERCU: ApercuTuneTested = {
  schema_version: 1,
  device_key: 'a'.repeat(64),
  manufacturer: 'Test Audio',
  model: 'DAC 7922',
  commercial_name: null,
  output_type: 'dlna',
  formats: [
    { codec: 'flac', sample_rate: 192000, bit_depth: 24, dsd_mode: null },
    { codec: 'dsd', sample_rate: 2822400, bit_depth: 1, dsd_mode: 'dop' },
  ],
  gapless_observed: true,
  error_free_seconds: 3700,
  tune_version: '1.0.0-rc11',
  platform: 'linux',
  instance_id: 'instance-essai',
};

function etat(partiel: Partial<EtatTuneTested>): EtatTuneTested {
  return {
    eligible: false,
    seconds_without_error: 2400,
    threshold_seconds: 3600,
    remaining_seconds: 1200,
    already_proposed: false,
    reason: 'below_threshold',
    preview: APERCU,
    ...partiel,
  };
}

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

async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ProposerTuneTested, { target: hote, props: { zoneId: 7, nom: 'Salon', onClose: () => {} } });
  await souffler();
  flushSync();
}

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('bouton Tune tested (tune-server-rust#7922)', () => {
  it('grisé avant une heure, avec le temps restant, et rien ne part', async () => {
    getTuneTestedProposition.mockResolvedValue(etat({}));
    await monter();
    const bouton = q('tt-proposer') as HTMLButtonElement;
    expect(bouton).not.toBeNull();
    expect(bouton.disabled).toBe(true);
    expect(q('tt-raison')?.textContent).toContain('20 min');
    bouton.click();
    flushSync();
    expect(q('tt-apercu')).toBeNull();
    expect(proposerTuneTested).not.toHaveBeenCalled();
  });

  it('après une heure : aperçu exact, puis envoi seulement à la confirmation', async () => {
    getTuneTestedProposition.mockResolvedValue(etat({
      eligible: true, reason: null, seconds_without_error: 3700, remaining_seconds: 0,
    }));
    proposerTuneTested.mockResolvedValue({ status: 'ok', already_proposed: true });
    await monter();
    const bouton = q('tt-proposer') as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
    bouton.click();
    flushSync();
    const apercu = q('tt-apercu');
    expect(apercu?.textContent).toContain('Test Audio');
    expect(apercu?.textContent).toContain('DAC 7922');
    expect(apercu?.textContent).toContain('FLAC 192 kHz / 24 bit');
    expect(apercu?.textContent).toContain('DSD 2.8224 MHz (DoP)');
    expect(JSON.parse(q('tt-brut')!.textContent!)).toEqual(APERCU);
    expect(proposerTuneTested, 'rien ne part avant la confirmation').not.toHaveBeenCalled();
    (q('tt-confirmer') as HTMLButtonElement).click();
    await souffler();
    flushSync();
    expect(proposerTuneTested).toHaveBeenCalledTimes(1);
    expect(proposerTuneTested).toHaveBeenCalledWith(7, APERCU);
    expect(q('tt-envoye')).not.toBeNull();
  });

  it('un aperçu périmé n’est pas envoyé : le nouveau s’affiche, à confirmer de nouveau', async () => {
    getTuneTestedProposition.mockResolvedValue(etat({ eligible: true, reason: null, remaining_seconds: 0 }));
    const nouveau = { ...APERCU, error_free_seconds: 3940 };
    proposerTuneTested.mockRejectedValueOnce(Object.assign(new Error('conflict'), {
      code: 'tune_tested_preview_changed',
      corps: { error: 'tune_tested_preview_changed', preview: nouveau },
    }));
    proposerTuneTested.mockResolvedValueOnce({ status: 'ok', already_proposed: true });
    await monter();
    (q('tt-proposer') as HTMLButtonElement).click();
    flushSync();
    (q('tt-confirmer') as HTMLButtonElement).click();
    await souffler();
    flushSync();
    expect(q('tt-envoye'), 'rien n’est dit envoyé').toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe(tFr('v2.tuneTestedPropose.err.previewChanged'));
    expect(JSON.parse(q('tt-brut')!.textContent!), 'le nouvel aperçu est montré')
      .toEqual(nouveau);
    (q('tt-confirmer') as HTMLButtonElement).click();
    await souffler();
    flushSync();
    expect(proposerTuneTested).toHaveBeenLastCalledWith(7, nouveau);
    expect(q('tt-envoye')).not.toBeNull();
  });

  it('un 429 du site se dit « trop de demandes »', () => {
    expect(messageDeRefus('tune_tested_site_refused', tEn, 429))
      .toBe(tEn('v2.tuneTestedPropose.err.tooMany'));
    expect(messageDeRefus('tune_tested_site_refused', tEn, 422))
      .toBe(tEn('v2.tuneTestedPropose.err.failed'));
  });

  it('un refus du serveur se dit par son code nommé', async () => {
    getTuneTestedProposition.mockResolvedValue(etat({ eligible: true, reason: null, remaining_seconds: 0 }));
    proposerTuneTested.mockRejectedValue(Object.assign(new Error('raw server text'), { code: 'tune_tested_not_connected' }));
    await monter();
    (q('tt-proposer') as HTMLButtonElement).click();
    flushSync();
    (q('tt-confirmer') as HTMLButtonElement).click();
    await souffler();
    flushSync();
    const alerte = document.querySelector('[role="alert"]');
    expect(alerte?.textContent).not.toContain('raw server text');
    expect(alerte?.textContent).toBe(tFr('v2.tuneTestedPropose.err.notConnected'));
  });
});

describe('présentation de la proposition', () => {
  it('le bouton suit la raison du serveur', () => {
    expect(etatDuBouton(etat({}), tEn)).toEqual({
      actif: false,
      raison: 'Available after one hour without error: 20 min left.',
    });
    expect(etatDuBouton(etat({ reason: 'device_unidentified', preview: null }), tEn).actif).toBe(false);
    expect(etatDuBouton(etat({ eligible: true, reason: null }), tEn).actif).toBe(true);
    expect(etatDuBouton(null, tEn).actif).toBe(false);
  });

  it('durées et formats lisibles', () => {
    expect(duree(3700, tEn)).toBe('1 h 02 min');
    expect(duree(59, tEn)).toBe('1 min');
    expect(libelleFormat({ codec: 'dsd', sample_rate: 5644800, bit_depth: 1, dsd_mode: 'native' }, tEn))
      .toBe('DSD 5.6448 MHz (native)');
  });

  it('chaque ligne de l’aperçu a sa traduction dans toutes les langues', () => {
    const cles = lignesApercu({ ...APERCU, commercial_name: 'Test Audio DAC' }, tEn).map((l) => l.cle);
    for (const langue of ONZE_LANGUES) {
      const dict = dictionnaire(langue);
      for (const cle of [...cles, 'v2.zone.tuneTestedPropose', 'v2.tuneTestedPropose.button', 'v2.tuneTestedPropose.remaining']) {
        expect(dict[cle], `${langue} : ${cle}`).toBeTruthy();
      }
    }
  });

  it('un code inconnu ne montre jamais le texte brut', () => {
    expect(messageDeRefus('tune_tested_below_threshold', tEn)).toBe(tEn('v2.tuneTestedPropose.err.belowThreshold'));
    expect(messageDeRefus('xyz', tEn)).toBe(tEn('v2.tuneTestedPropose.err.failed'));
  });
});
