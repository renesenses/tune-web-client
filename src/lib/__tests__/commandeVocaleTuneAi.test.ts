// @vitest-environment jsdom
//
// Commande vocale de Tune AI (rc12, décidée le 11/11/2026).
//
// Michel Baert, qui a des tremblements, a activé « Commande vocale » dans les
// Réglages : rien ne s'est passé. L'interrupteur écrivait
// `tune_voice_ai_enabled` et AUCUN code ne lisait cette clé.
//
// Ce banc simule la reconnaissance vocale du navigateur (`SpeechRecognition`)
// et vérifie : le bouton micro dans « Demander à l'assistant », le texte
// reconnu en direct dans le champ, l'envoi à la fin de la parole, « Relire
// avant l'envoi », chaque cas d'échec dit en clair, et l'interrupteur des
// Réglages qui ne se dit plus « activé » quand la dictée ne peut pas marcher.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const posees: string[] = [];
vi.mock('../assistantIaDialogue', async (orig) => {
  const vrai = await orig<typeof import('../assistantIaDialogue')>();
  return { ...vrai, poserQuestionIa: vi.fn(async (q: string) => { posees.push(q); }) };
});

import DemanderAssistantIaV2 from '../../components/v2/DemanderAssistantIaV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { raisonIndisponible, langueDictee, echecDepuisCode } from '../commandeVocale';

/** Une fausse `SpeechRecognition` que le banc pilote. */
class FausseReco {
  static derniere: FausseReco | null = null;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  demarree = false;
  constructor() { FausseReco.derniere = this; }
  start() { this.demarree = true; }
  stop() { this.onend?.(); }
  abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
  // ── pilotage ──
  dire(...morceaux: string[]) {
    const results = morceaux.map((m) => Object.assign([{ transcript: m }], { isFinal: false }));
    this.onresult?.({ resultIndex: 0, results });
  }
  echouer(code: string) { this.onerror?.({ error: code }); this.onend?.(); }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirAssistant() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DemanderAssistantIaV2, { target: hote, props: { onClose: () => {} } });
  flushSync();
  await attendre();
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel as any) as T | null;

beforeEach(() => {
  posees.length = 0;
  FausseReco.derniere = null;
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('webkitSpeechRecognition', FausseReco);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Tune AI : bouton micro', () => {
  it('absent tant que la commande vocale n’est pas activée', async () => {
    await ouvrirAssistant();
    expect($('[data-ia-question]')).not.toBeNull();
    expect($('[data-ia-micro]')).toBeNull();
  });

  it('dicte en direct dans le champ, puis envoie à la fin de la parole', async () => {
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    await ouvrirAssistant();
    const micro = $<HTMLButtonElement>('[data-ia-micro]');
    expect(micro, 'aucun bouton micro alors que la commande vocale est activée').not.toBeNull();
    micro!.click();
    flushSync();
    const reco = FausseReco.derniere!;
    expect(reco.demarree).toBe(true);
    expect(reco.lang).toBe('fr-FR');
    expect(reco.interimResults).toBe(true);
    expect($('[data-ia-ecoute]')).not.toBeNull();

    reco.dire('quels albums de');
    flushSync();
    expect($<HTMLTextAreaElement>('[data-ia-question]')!.value).toBe('quels albums de');
    reco.dire('quels albums de', ' Brel ai-je');
    flushSync();
    expect($<HTMLTextAreaElement>('[data-ia-question]')!.value).toBe('quels albums de Brel ai-je');
    expect(posees).toEqual([]);

    reco.onend!();
    await attendre();
    expect(posees).toEqual(['quels albums de Brel ai-je']);
    expect($('[data-ia-ecoute]')).toBeNull();
  });

  it('« Relire avant l’envoi » : le texte reste dans le champ, rien n’est envoyé', async () => {
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    localStorage.setItem('tune_voice_ai_review', 'true');
    await ouvrirAssistant();
    $<HTMLButtonElement>('[data-ia-micro]')!.click();
    const reco = FausseReco.derniere!;
    reco.dire('joue du Ferré');
    reco.onend!();
    await attendre();
    expect(posees).toEqual([]);
    expect($<HTMLTextAreaElement>('[data-ia-question]')!.value).toBe('joue du Ferré');
  });

  it('micro refusé : le dit, sans rien envoyer', async () => {
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    await ouvrirAssistant();
    $<HTMLButtonElement>('[data-ia-micro]')!.click();
    FausseReco.derniere!.echouer('not-allowed');
    await attendre();
    expect($('[data-ia-echec-voix]')?.textContent).toBe(dictionnaire('fr')['settings.micDenied']);
    expect(posees).toEqual([]);
  });

  it('silence : le dit', async () => {
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    await ouvrirAssistant();
    $<HTMLButtonElement>('[data-ia-micro]')!.click();
    FausseReco.derniere!.echouer('no-speech');
    await attendre();
    expect($('[data-ia-echec-voix]')?.textContent).toBe(dictionnaire('fr')['voice.noSpeech']);
  });

  it('navigateur sans reconnaissance vocale (Firefox) : propose Chrome, Edge ou Safari', async () => {
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    await ouvrirAssistant();
    $<HTMLButtonElement>('[data-ia-micro]')!.click();
    await attendre();
    const msg = $('[data-ia-echec-voix]')?.textContent ?? '';
    expect(msg).toBe(dictionnaire('fr')['voice.unsupported']);
    expect(msg).toMatch(/Chrome.*Edge.*Safari/);
  });

  it('http sur le réseau local : dit ce qui marche, sans lancer la reconnaissance', async () => {
    vi.stubGlobal('isSecureContext', false);
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    await ouvrirAssistant();
    $<HTMLButtonElement>('[data-ia-micro]')!.click();
    await attendre();
    expect(FausseReco.derniere, 'la reconnaissance a démarré hors contexte sécurisé').toBeNull();
    const msg = $('[data-ia-echec-voix]')?.textContent ?? '';
    expect(msg).toBe(dictionnaire('fr')['voice.insecure']);
    expect(msg).toContain('localhost');
    expect(msg).toContain('bridge.mozaiklabs.fr');
  });
});

describe('Réglages › Tune Voice AI', () => {
  async function ecranVoix(): Promise<HTMLElement> {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(String(url)) ? '[]' : '{}',
        { status: 200, headers: { 'Content-Type': 'application/json' } })));
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    v2SettingsTarget.set({ tab: 'general', section: 'voice' } as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();
    return hote;
  }

  it('http local : l’interrupteur reste éteint et la raison s’affiche dessous', { timeout: 60_000 }, async () => {
    vi.stubGlobal('isSecureContext', false);
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    const el = await ecranVoix();
    const sw = el.querySelector<HTMLInputElement>('[data-voice-switch]');
    expect(sw, 'interrupteur introuvable').not.toBeNull();
    expect(sw!.checked, 'interrupteur « activé » alors que le micro est refusé en http').toBe(false);
    expect(sw!.disabled).toBe(true);
    expect(el.querySelector('[data-voice-raison]')?.textContent).toBe(dictionnaire('fr')['voice.insecure']);
  });

  it('Firefox : la raison dit d’ouvrir Chrome, Edge ou Safari', { timeout: 60_000 }, async () => {
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    const el = await ecranVoix();
    expect(el.querySelector('[data-voice-raison]')?.textContent).toBe(dictionnaire('fr')['voice.unsupported']);
  });

  it('contexte sécurisé : activé, l’option « Relire avant l’envoi » apparaît', { timeout: 60_000 }, async () => {
    localStorage.setItem('tune_voice_ai_enabled', 'true');
    const el = await ecranVoix();
    expect(el.querySelector('[data-voice-raison]')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('[data-voice-switch]')!.checked).toBe(true);
    const relire = el.querySelector<HTMLInputElement>('[data-voice-relire]');
    expect(relire).not.toBeNull();
    relire!.click();
    await attendre();
    expect(localStorage.getItem('tune_voice_ai_review')).toBe('true');
  });
});

describe('commandeVocale : diagnostic et langues', () => {
  it('ordre des raisons', () => {
    expect(raisonIndisponible({ isSecureContext: true })).toBe('nonPrisEnCharge');
    expect(raisonIndisponible({ isSecureContext: false })).toBe('nonPrisEnCharge');
    expect(raisonIndisponible({ isSecureContext: false, webkitSpeechRecognition: FausseReco })).toBe('nonSecurise');
    expect(raisonIndisponible({ isSecureContext: true, SpeechRecognition: FausseReco })).toBeNull();
  });
  it('codes d’erreur du navigateur', () => {
    expect(echecDepuisCode('not-allowed')).toBe('refuse');
    expect(echecDepuisCode('service-not-allowed')).toBe('refuse');
    expect(echecDepuisCode('audio-capture')).toBe('pasDeMicro');
    expect(echecDepuisCode('network')).toBe('reseau');
    expect(echecDepuisCode('bizarre')).toBe('autre');
  });
  it('la langue de dictée suit l’interface, dans les quinze langues', () => {
    for (const l of ONZE_LANGUES) expect(langueDictee(l)).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    expect(langueDictee('de')).toBe('de-DE');
  });
  it('les chaînes existent dans les quinze langues', () => {
    const cles = ['voice.unsupported', 'voice.insecure', 'voice.noSpeech', 'voice.noMic', 'voice.network',
      'voice.failed', 'voice.start', 'voice.stop', 'voice.listening', 'voice.listeningReview',
      'voice.review', 'voice.reviewHint', 'settings.micAuthorized', 'settings.micDenied'];
    for (const l of ONZE_LANGUES) for (const k of cles) {
      expect(dictionnaire(l)[k], `${l} : ${k}`).toBeTruthy();
    }
    for (const l of ONZE_LANGUES) expect(dictionnaire(l)['voice.insecure'], l).toContain('localhost');
  });
});
