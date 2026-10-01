// @vitest-environment jsdom
//
// web#1861 — minuteur de sommeil (Levente Toth, fil forum 2068, 0.9.169).
//
//  1. « the user could have the option to switch it On-Off in the settings »
//     → réglage `afficherMinuteurSommeil`, COCHÉ par défaut ;
//  2. « maybe adding a custom field? […] less then 15 minutes, or 1,5 hour »
//     → une durée libre, en minutes entières : le serveur prend tout entier
//     (`SleepRequest { minutes: u64 }`, tune-server/src/routes/playback.rs).
//
// On MONTE la vraie barre et on lit le DOM et les requêtes réellement
// parties — pas une garde de texte sur le gabarit.
//
// ## Contre-épreuve, mesurée
//
//  1. `boutonMinuteurVisible` qui ignore le réglage (toujours `true`) ⇒
//     « décoché, le bouton disparaît » tombe ;
//  2. `boutonMinuteurVisible` qui ignore `actif` ⇒ « revient tant qu'une
//     minuterie tourne » tombe ;
//  3. `lancerSleepLibre` qui n'envoie rien ⇒ « 90 min partent au serveur » tombe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { preferences } from '../stores/preferences';
import { zones, currentZoneId } from '../stores/zones';
import { minutesLibres, boutonMinuteurVisible, MINUTES_LIBRES_MAX } from '../minuteurSommeil';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const SALON = {
  id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
  output_type: 'dlna', current_track: { id: 42, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'local' },
};

/** Ce que le faux serveur répond à `GET /zones/1/sleep`. */
let minuterieServeur: { active: boolean; remaining_seconds?: number };
let appels: { url: string; methode: string; corps?: unknown }[] = [];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function poserLaBarre(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  return hote;
}

const boutonLune = () => (hote ?? document).querySelector<HTMLButtonElement>('.control-btn.sleep-btn');
const respirer = () => new Promise((r) => setTimeout(r, 0));
const envoisSleep = () => appels.filter((a) => /\/zones\/1\/sleep$/.test(a.url) && a.methode === 'POST');

beforeEach(() => {
  appels = [];
  minuterieServeur = { active: false };
  try { localStorage.clear(); } catch { /* ignore */ }
  zones.set([SALON] as never);
  currentZoneId.set(1);
  preferences.update((p) => ({ ...p, afficherMinuteurSommeil: true }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url, methode, corps: init?.body ? JSON.parse(String(init.body)) : undefined });
    const corps = /\/sleep$/.test(url)
      ? (methode === 'GET' ? minuterieServeur : { sleep_timer: { minutes: 1, zone_id: 1 } })
      : SALON;
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('web#1861 — la règle, appelée', () => {
  it('durée libre : minutes ENTIÈRES de 1 à 1440, rien d’autre', () => {
    expect(minutesLibres('5')).toBe(5);
    expect(minutesLibres(' 90 ')).toBe(90);
    expect(minutesLibres(90)).toBe(90);
    expect(minutesLibres(String(MINUTES_LIBRES_MAX))).toBe(1440);
    for (const refus of ['', '0', '-3', '1.5', '1,5', 'abc', '1441', null, undefined, Number.NaN]) {
      expect(minutesLibres(refus as never), String(refus)).toBeNull();
    }
  });

  it('le bouton : affiché si le réglage est coché, ou tant qu’une minuterie tourne', () => {
    expect(boutonMinuteurVisible(true, false)).toBe(true);
    expect(boutonMinuteurVisible(false, false)).toBe(false);
    expect(boutonMinuteurVisible(false, true)).toBe(true);
    // Un blob ancien sans la clé : le bouton reste, comme avant.
    expect(boutonMinuteurVisible(undefined, false)).toBe(true);
  });
});

describe('web#1861 — masquer le bouton lune', () => {
  it('🔴 installation EXISTANTE : un blob enregistré SANS la clé garde le bouton', async () => {
    localStorage.setItem('tune-preferences', JSON.stringify({ theme: 'dark', language: 'fr' }));
    vi.resetModules();
    const ancien = await import('../stores/preferences');
    expect(get(ancien.preferences).afficherMinuteurSommeil).toBe(true);
  });

  it('coché (défaut) : le bouton est dans la barre', () => {
    poserLaBarre();
    expect(boutonLune()).not.toBeNull();
  });

  it('🔴 décoché : le bouton disparaît de la barre', async () => {
    preferences.update((p) => ({ ...p, afficherMinuteurSommeil: false }));
    poserLaBarre();
    await respirer(); flushSync();
    expect(boutonLune(), 'le réglage est décoché et la lune est toujours là').toBeNull();
    // Contre-épreuve du montage : la barre est bien rendue.
    expect(hote!.querySelector('.control-btn.play-btn')).not.toBeNull();
  });

  it('🔴 décoché mais une minuterie TOURNE : le bouton revient, avec son compte à rebours', async () => {
    minuterieServeur = { active: true, remaining_seconds: 600 };
    preferences.update((p) => ({ ...p, afficherMinuteurSommeil: false }));
    poserLaBarre();
    await vi.waitFor(() => { flushSync(); expect(boutonLune()?.textContent).toContain('10:00'); });
  });

  it('le choix part dans le blob synchronisé', () => {
    preferences.update((p) => ({ ...p, afficherMinuteurSommeil: false }));
    expect(JSON.parse(localStorage.getItem('tune-preferences') as string).afficherMinuteurSommeil).toBe(false);
  });
});

describe('web#1861 — durée libre', () => {
  async function ouvrirMenu() {
    poserLaBarre();
    boutonLune()!.click();
    flushSync();
    const input = hote!.querySelector<HTMLInputElement>('.sleep-custom-input');
    const form = hote!.querySelector<HTMLFormElement>('form.sleep-custom');
    expect(input, 'pas de champ de durée libre dans le menu').not.toBeNull();
    return { input: input!, form: form! };
  }

  function saisir(input: HTMLInputElement, v: string) {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  }

  it('🔴 90 minutes saisies partent au serveur telles quelles', async () => {
    const { input, form } = await ouvrirMenu();
    saisir(input, '90');
    form.requestSubmit();
    await vi.waitFor(() => expect(envoisSleep()).toHaveLength(1));
    expect(envoisSleep()[0].corps).toEqual({ minutes: 90 });
  });

  it('5 minutes — moins que la plus courte des durées proposées', async () => {
    const { input, form } = await ouvrirMenu();
    saisir(input, '5');
    form.requestSubmit();
    await vi.waitFor(() => expect(envoisSleep()).toHaveLength(1));
    expect(envoisSleep()[0].corps).toEqual({ minutes: 5 });
  });

  it('une saisie refusée n’envoie RIEN et le dit', async () => {
    const { input, form } = await ouvrirMenu();
    saisir(input, '0');
    form.requestSubmit();
    await respirer(); flushSync();
    expect(envoisSleep()).toHaveLength(0);
    expect(hote!.querySelector('.sleep-custom-err')?.textContent).toBe(dictionnaire('fr')['sleep.customInvalid']);
  });

  it('les durées proposées restent là', async () => {
    await ouvrirMenu();
    expect(hote!.querySelectorAll('.sleep-dropdown .sleep-option').length).toBeGreaterThanOrEqual(5);
  });
});

describe('web#1861 — les 11 langues', () => {
  it('chaque dictionnaire porte les six libellés', () => {
    expect(ONZE_LANGUES).toHaveLength(11);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of ['sleep.customLabel', 'sleep.customPlaceholder', 'sleep.customStart', 'sleep.customInvalid',
        'settings.showSleepTimer', 'settings.showSleepTimerHint']) {
        expect(d[k], `${code} ${k}`).toBeTruthy();
      }
    }
  });
});
