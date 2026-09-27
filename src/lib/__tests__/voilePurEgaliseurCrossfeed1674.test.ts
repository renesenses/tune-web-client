// @vitest-environment jsdom
//
// renesenses/tune-web-client#1674 — EN MODE PURE, LES ÉCRANS ÉGALISEUR ET
// CROSSFEED SONT VOILÉS.
//
// Levente Toth, fil 1974 (réponse 6991, 27/09/2026) : « if I have PURE turned
// on, I can still activate the EQ, but it doesn't do anything ». En PURE le
// serveur ne construit aucun traitement ; l'écran Égaliseur laissait pourtant
// tout régler, sans un mot, et le seul avis (`eq.effectNextTrack`) promettait
// « à la piste suivante » — faux en PURE. Go de Bertrand le 27/09 : voiler les
// deux écrans, réglages grisés et non modifiables, avec un message qui dit
// qu'ils n'agissent pas en PURE et comment en sortir.
//
// 🔴 L'état PURE est `audiophileEnabled` (`stores/audiophile.ts`), celui que le
// bouton PURE de la barre de lecture tient à jour pour la zone courante. Ces
// témoins le posent, MONTENT les vrais écrans et lisent le DOM : le message,
// le fieldset désactivé, et le fait que les réglages sont bien DEDANS.
//
// Contre-épreuve : les deux écrans remis à leur base (sans `VoilePur` ni
// fieldset) font rougir les témoins « en PURE » ; les témoins « hors PURE »
// restent verts, et ils le doivent — ils gardent l'autre sens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { audiophileEnabled } from '../stores/audiophile';
import { currentZoneId } from '../stores/zones';
import { t } from '../i18n';
import { get } from 'svelte/store';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
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

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponse(COLLECTIONS.test(String(url)) ? [] : {})));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  currentZoneId.set(16740);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  audiophileEnabled.set(false);
  vi.unstubAllGlobals();
});

/** Attendre une CONDITION, bornée — jamais un délai calibré. */
async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function monter(ecran: typeof EqualizerV2 | typeof CrossfeedV2, pur: boolean) {
  audiophileEnabled.set(pur);
  monte = mount(ecran, { target: hote! });
  // Chargé quand le premier réglage (la case d'activation) est rendu.
  await jusqua(() => !!hote!.querySelector('.presets'));
  expect(hote!.querySelector('.presets'), 'écran jamais chargé').toBeTruthy();
}

const texte = (cle: string) => get(t)(cle as any);

describe('web#1674 — voile PURE sur l’Égaliseur', () => {
  it('en PURE : message, réglages dans un fieldset désactivé, bascule et remise à zéro grisées', async () => {
    await monter(EqualizerV2, true);
    const voile = hote!.querySelector('[data-voile-pur]');
    expect(voile, 'aucun voile en PURE').toBeTruthy();
    expect(voile!.textContent).toContain(texte('v2.pure.veilEq'));
    expect(voile!.textContent).toContain(texte('v2.pure.veilExit'));
    const fs = hote!.querySelector('fieldset.reglages') as HTMLFieldSetElement | null;
    expect(fs, 'aucun fieldset autour des réglages').toBeTruthy();
    expect(fs!.disabled).toBe(true);
    // Les préréglages et les curseurs sont DANS le fieldset désactivé.
    expect(fs!.contains(hote!.querySelector('.presets button'))).toBe(true);
    expect(fs!.contains(hote!.querySelector('input[type="range"]'))).toBe(true);
    const bascule = hote!.querySelector('header input[type="checkbox"]') as HTMLInputElement;
    expect(bascule.disabled).toBe(true);
  });

  it('hors PURE : ni voile, ni réglage grisé par lui', async () => {
    await monter(EqualizerV2, false);
    expect(hote!.querySelector('[data-voile-pur]')).toBeNull();
    const fs = hote!.querySelector('fieldset.reglages') as HTMLFieldSetElement | null;
    if (fs) expect(fs.disabled).toBe(false);
    const bascule = hote!.querySelector('header input[type="checkbox"]') as HTMLInputElement;
    expect(bascule.disabled).toBe(false);
  });
});

describe('web#1674 — voile PURE sur le Crossfeed', () => {
  it('en PURE : message, réglages dans un fieldset désactivé', async () => {
    await monter(CrossfeedV2, true);
    const voile = hote!.querySelector('[data-voile-pur]');
    expect(voile, 'aucun voile en PURE').toBeTruthy();
    expect(voile!.textContent).toContain(texte('v2.pure.veilCf'));
    expect(voile!.textContent).toContain(texte('v2.pure.veilExit'));
    const fs = hote!.querySelector('fieldset.reglages') as HTMLFieldSetElement | null;
    expect(fs, 'aucun fieldset autour des réglages').toBeTruthy();
    expect(fs!.disabled).toBe(true);
    expect(fs!.contains(hote!.querySelector('.card input[type="checkbox"]'))).toBe(true);
    expect(fs!.contains(hote!.querySelector('.card input[type="range"]'))).toBe(true);
  });

  it('hors PURE : ni voile, et la case d’activation reste utilisable', async () => {
    await monter(CrossfeedV2, false);
    expect(hote!.querySelector('[data-voile-pur]')).toBeNull();
    const fs = hote!.querySelector('fieldset.reglages') as HTMLFieldSetElement | null;
    if (fs) expect(fs.disabled).toBe(false);
    const caseActif = hote!.querySelector('.card input[type="checkbox"]') as HTMLInputElement;
    expect(caseActif.disabled).toBe(false);
  });
});

describe('web#1674 — les trois libellés existent dans les onze langues', () => {
  it('v2.pure.veilEq / veilCf / veilExit', async () => {
    for (const l of ONZE_LANGUES) {
      const dict = dictionnaire(l);
      for (const cle of ['v2.pure.veilEq', 'v2.pure.veilCf', 'v2.pure.veilExit']) {
        expect(dict[cle], `${cle} manque en ${l}`).toBeTruthy();
        expect(dict[cle], `${cle} ne nomme pas PURE en ${l}`).toContain('PURE');
      }
    }
  });
});
