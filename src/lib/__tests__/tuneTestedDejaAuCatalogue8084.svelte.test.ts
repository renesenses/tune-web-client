// @vitest-environment jsdom
//
// tune-server-rust#8084 — proposer pour Tune tested un appareil DÉJÀ au
// catalogue (Eversolo DMP-A8, par exemple) : la proposition ajoute un foyer.
//
// Ce que ces témoins clouent :
//  1. un appareil déjà Tune tested garde le bouton ACTIF, et la fenêtre dit
//     en une phrase que la proposition ajoute le foyer ;
//  2. la confirmation envoie l'aperçu, comme pour un appareil nouveau ;
//  3. contre-épreuve : hors catalogue, la phrase ne s'affiche pas ;
//  4. le repli : un serveur plus ancien (sans `already_tune_tested`) laisse le
//     badge du catalogue lu par le navigateur dire la même chose ;
//  5. l'aperçu se lit au nouveau schéma (`brand`, `gapless`) comme à l'ancien ;
//  6. la phrase existe dans les quinze langues.
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
  dejaTuneTested,
  etatDuBouton,
  lignesApercu,
  type ApercuTuneTested,
  type EtatTuneTested,
} from '../tuneTestedProposition';
import fr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const tFr = avecParametres((cle) => (fr as Record<string, string>)[cle] ?? cle);
const PHRASE = (fr as Record<string, string>)['v2.tuneTestedPropose.alreadyTested'];

/** L'aperçu au schéma du site, tel que le serveur #8084 le rend. */
const APERCU: ApercuTuneTested = {
  schema_version: 1,
  device_key: 'b'.repeat(64),
  brand: 'Eversolo',
  model: 'DMP-A8',
  commercial_name: null,
  output_type: 'dlna',
  formats: [{ codec: 'flac', sample_rate: 192000, bit_depth: 24, dsd_mode: null }],
  bit_depth: 24,
  dsd: null,
  gapless: true,
  error_free_seconds: 3700,
  tune_version: '1.0.0-rc11',
  platform: 'linux',
  instance_id: 'instance-essai',
};

function etat(partiel: Partial<EtatTuneTested>): EtatTuneTested {
  return {
    eligible: true,
    seconds_without_error: 3700,
    threshold_seconds: 3600,
    remaining_seconds: 0,
    already_proposed: false,
    reason: null,
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

async function monter(dejaTeste = false) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ProposerTuneTested, {
    target: hote,
    props: { zoneId: 7, nom: 'Salon', dejaTeste, onClose: () => {} },
  });
  await souffler();
  flushSync();
}

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('appareil déjà Tune tested (tune-server-rust#8084)', () => {
  it('le bouton reste actif, la phrase s’affiche, et la proposition part', async () => {
    getTuneTestedProposition.mockResolvedValue(etat({ already_tune_tested: true }));
    proposerTuneTested.mockResolvedValue({ status: 'ok', already_proposed: true });
    await monter();

    expect(q('tt-deja-teste')?.textContent).toBe(PHRASE);
    const bouton = q('tt-proposer') as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);

    bouton.click();
    flushSync();
    (q('tt-confirmer') as HTMLButtonElement).click();
    await souffler();
    flushSync();

    expect(proposerTuneTested).toHaveBeenCalledTimes(1);
    expect(proposerTuneTested).toHaveBeenCalledWith(7, APERCU);
    expect(q('tt-envoye')).not.toBeNull();
  });

  it('contre-épreuve : hors catalogue, la phrase ne s’affiche pas', async () => {
    getTuneTestedProposition.mockResolvedValue(etat({ already_tune_tested: false }));
    await monter();
    expect(q('tt-deja-teste')).toBeNull();
    expect((q('tt-proposer') as HTMLButtonElement).disabled).toBe(false);
  });

  it('repli : un serveur sans `already_tune_tested` suit le badge du catalogue', async () => {
    const ancien = etat({});
    delete (ancien as Partial<EtatTuneTested>).already_tune_tested;
    getTuneTestedProposition.mockResolvedValue(ancien);
    await monter(true);
    expect(q('tt-deja-teste')?.textContent).toBe(PHRASE);
  });

  it('déjà Tune tested ne grise jamais le bouton', () => {
    const e = etat({ already_tune_tested: true });
    expect(dejaTuneTested(e)).toBe(true);
    expect(dejaTuneTested(etat({}), true)).toBe(true);
    expect(dejaTuneTested(etat({}))).toBe(false);
    expect(dejaTuneTested(null)).toBe(false);
    expect(etatDuBouton(e, tFr).actif).toBe(true);
  });

  it('l’aperçu se lit au schéma du site comme à l’ancien', () => {
    const nouveau = lignesApercu(APERCU, tFr);
    const valeur = (lignes: { cle: string; valeur: string }[], cle: string) =>
      lignes.find((l) => l.cle === `v2.tuneTestedPropose.f.${cle}`)?.valeur;
    expect(valeur(nouveau, 'manufacturer')).toBe('Eversolo');
    expect(valeur(nouveau, 'gapless')).toBe(tFr('v2.tuneTestedPropose.yes'));

    const { brand: _b, gapless: _g, ...reste } = APERCU;
    const ancien = lignesApercu({ ...reste, manufacturer: 'Eversolo', gapless_observed: false }, tFr);
    expect(valeur(ancien, 'manufacturer')).toBe('Eversolo');
    expect(valeur(ancien, 'gapless')).toBe(tFr('v2.tuneTestedPropose.no'));
  });

  it('la phrase existe dans les quinze langues', () => {
    expect(ONZE_LANGUES).toHaveLength(15);
    for (const langue of ONZE_LANGUES) {
      const texte = dictionnaire(langue)['v2.tuneTestedPropose.alreadyTested'];
      expect(typeof texte === 'string' && texte.includes('Tune tested'), `[${langue}]`).toBe(true);
    }
  });
});
