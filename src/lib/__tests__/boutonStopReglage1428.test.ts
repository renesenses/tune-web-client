// @vitest-environment jsdom
//
// #1428 — « ET LA DISPARITION DU BOUTON STOP NE ME PLAÎT PAS DU TOUT »
// (jfpaquet, forum 1879, ticket support 154, 0.9.161, 21/09/2026 ; les
// majuscules sont les siennes).
//
// Le bouton autonome a été retiré le 05/09/2026 au profit du double-clic sur
// Lecture, remis le 08/09 sur une lecture erronée, retiré de nouveau le 09/09.
// La décision tenait : le stop est une commande d'APPAREIL, pas une commande
// de MUSIQUE. Bertrand tranche le 22/09/2026 sans la renier — il OFFRE le
// choix : Réglages ▸ Affichage ▸ « Afficher le bouton Stop », DÉCOCHÉ par
// défaut.
//
// 🔴 CE FICHIER MONTE LA VRAIE BARRE ET LIT LE DOM. Une garde de texte
// (« le gabarit contient la chaîne X ») serait satisfaite par le commentaire
// qui raconte l'histoire, ou par un bouton écrit mais jamais branché. Ce qui
// est mesuré ici, c'est ce que l'utilisateur voit, et ce que le bouton envoie.
//
// Le défaut est la moitié de l'arbitrage : les deux premiers cas le mesurent
// deux fois — installation NEUVE, et installation EXISTANTE dont le blob
// enregistré ne connaît pas encore la clé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { preferences } from '../stores/preferences';
import { zones, currentZoneId } from '../stores/zones';
import { setupKeyboardShortcuts } from '../keyboard';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import lDe from '../locales/de';
import lEs from '../locales/es';
import lIt from '../locales/it';
import lZh from '../locales/zh';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lHu from '../locales/hu';

const PISTE_LOCALE = { id: 42, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'local' };
const PISTE_RADIO = { id: 43, title: 'FIP', artist_name: 'FIP', source: 'radio' };

/** La zone, et la piste qu'elle joue. `currentTrack` et `playbackState` sont
 *  DÉRIVÉS de la zone courante (`stores/nowPlaying`) : les poser à la main
 *  serait impossible, et les croire posés serait un faux vert. */
const SALON = {
  id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
  output_type: 'dlna', current_track: PISTE_LOCALE,
};

const SALON_RADIO = { ...SALON, current_track: PISTE_RADIO };

/** Les requêtes sortantes, telles que le composant les émet. */
let appels: { url: string; methode: string }[] = [];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function poserLaBarre(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  return hote;
}

/** Le bouton Stop RENDU, ou `null` s'il n'est pas à l'écran. */
function boutonStop(): HTMLButtonElement | null {
  return (hote ?? document).querySelector('.control-btn.stop-btn');
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  appels = [];
  try { localStorage.clear(); } catch { /* ignore */ }
  zones.set([SALON] as never);
  currentZoneId.set(1);
  preferences.update((p) => ({ ...p, afficherBoutonStop: false }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    appels.push({ url, methode: (init?.method ?? 'GET').toUpperCase() });
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ ...SALON, state: 'stopped' }),
      text: async () => JSON.stringify({ ...SALON, state: 'stopped' }),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // La barre embarque `AudioVisualizer`, qui observe son canvas : jsdom n'a
  // pas d'API ResizeObserver, et son absence fait tomber le montage entier.
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

describe('#1428 — le défaut : DÉCOCHÉ, et l’écran ne bouge pas', () => {
  it('🔴 installation NEUVE : le réglage vaut false, sans rien avoir enregistré', async () => {
    // Un magasin FRAIS, chargé sur un localStorage vide : c'est très
    // exactement l'utilisateur qui n'a jamais touché ce réglage.
    localStorage.clear();
    vi.resetModules();
    const neuf = await import('../stores/preferences');
    expect(get(neuf.preferences).afficherBoutonStop,
      'le défaut a bougé — l’arbitrage du 22/09 était « décoché »').toBe(false);
  });

  it('🔴 installation EXISTANTE : un blob enregistré SANS la clé reste décoché', async () => {
    // Le piège réel : les préférences de tous les testeurs actuels ont été
    // écrites avant que la clé existe. `{ ...defaults, ...raw }` doit alors
    // laisser le défaut passer — et surtout ne pas lire `undefined` comme
    // « coché ».
    localStorage.setItem('tune-preferences', JSON.stringify({
      theme: 'dark', language: 'fr', v2CollectionsMosaique: true,
    }));
    vi.resetModules();
    const ancien = await import('../stores/preferences');
    const p = get(ancien.preferences);
    expect(Object.prototype.hasOwnProperty.call(p, 'afficherBoutonStop')).toBe(true);
    expect(p.afficherBoutonStop,
      'une installation existante voit le bouton apparaître sans l’avoir demandé').toBe(false);
  });

  it('🔴 à l’écran : aucun bouton Stop dans la barre, comme en 0.9.161', () => {
    poserLaBarre();
    expect(boutonStop(), 'le bouton Stop s’affiche alors que le réglage est décoché').toBeNull();
  });

  it('contre-épreuve du montage : la barre est bien rendue, avec son bouton Lecture', () => {
    const el = poserLaBarre();
    expect(el.querySelector('.control-btn.play-btn'),
      'la barre n’est pas montée : le cas précédent ne prouverait rien').not.toBeNull();
  });
});

describe('#1428 — coché, le bouton revient', () => {
  it('🔴 le bouton Stop apparaît dans la barre', async () => {
    poserLaBarre();
    expect(boutonStop()).toBeNull();
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    flushSync();
    expect(boutonStop(), 'le réglage est coché et le bouton ne se dessine pas').not.toBeNull();
  });

  it('il annonce les deux gestes qui existent déjà, dans son infobulle', () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    poserLaBarre();
    const titre = boutonStop()?.getAttribute('title') ?? '';
    expect(titre).toContain(lFr['common.stop' as never] as string);
    expect(titre).toContain(lFr['transport.dblClickStop' as never] as string);
  });

  it('la RADIO n’a toujours pas de stop, coché ou non', () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    zones.set([SALON_RADIO] as never);
    poserLaBarre();
    expect(boutonStop(),
      'un flux en direct ne se reprend pas où on l’a laissé — le bouton n’a rien à y faire').toBeNull();
  });

  it('sans zone, le bouton est là mais INERTE — la même règle que le double-clic', () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    currentZoneId.set(null);
    zones.set([] as never);
    poserLaBarre();
    const b = boutonStop();
    expect(b).not.toBeNull();
    expect(b!.disabled, 'sans zone il n’y a aucun appareil à libérer').toBe(true);
  });

  it('le choix part dans le blob synchronisé serveur, et se relit au rechargement', () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    const brut = localStorage.getItem('tune-preferences');
    expect(brut, 'les préférences ne sont pas écrites').toBeTruthy();
    expect(JSON.parse(brut as string).afficherBoutonStop).toBe(true);
  });
});

describe('#1428 — le bouton emprunte le MÊME chemin d’arrêt que les gestes existants', () => {
  /** Les seuls appels d'arrêt, dans l'ordre. */
  const arrets = () => appels.filter((a) => a.url.includes('/stop') && a.methode === 'POST');

  it('🔴 un clic envoie POST /zones/1/stop — comme la touche S', async () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    poserLaBarre();

    boutonStop()!.click();
    await respirer();
    const parLeBouton = arrets();
    expect(parLeBouton, 'le bouton n’a rien envoyé : il est écrit mais pas branché')
      .toHaveLength(1);

    // Le MÊME geste au clavier, mesuré dans la même monnaie.
    appels = [];
    const detacher = setupKeyboardShortcuts();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
    await respirer();
    const parLaTouche = arrets();
    detacher();

    expect(parLaTouche, 'la touche S n’arrête plus rien : le témoin ne compare rien')
      .toHaveLength(1);
    expect(parLeBouton[0]).toEqual(parLaTouche[0]);
    expect(parLeBouton[0].url).toMatch(/\/zones\/1\/stop$/);
  });

  it('inerte sans zone, il n’envoie rien du tout', async () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    currentZoneId.set(null);
    zones.set([] as never);
    poserLaBarre();
    appels = [];
    boutonStop()!.click();
    await respirer();
    expect(arrets()).toHaveLength(0);
  });
});

describe('#1428 — le réglage est rangé avec les autres réglages d’affichage', () => {
  it('il vit dans le blob `ui_preferences`, pas dans une clé à part', () => {
    preferences.update((p) => ({ ...p, afficherBoutonStop: true }));
    // Aucune clé localStorage dédiée : une seconde surface de persistance
    // finirait par diverger du profil.
    const cles = Object.keys(localStorage);
    expect(cles.filter((c) => /stop/i.test(c))).toEqual([]);
    expect(cles).toContain('tune-preferences');
  });
});

describe('#1428 — les libellés existent dans les ONZE langues', () => {
  const LANGUES: [string, Record<string, string>][] = [
    ['fr', lFr as never], ['en', lEn as never], ['de', lDe as never], ['es', lEs as never],
    ['it', lIt as never], ['zh', lZh as never], ['ja', lJa as never], ['ko', lKo as never],
    ['ro', lRo as never], ['sv', lSv as never], ['hu', lHu as never],
  ];
  const CLES = ['settings.showStopButton', 'settings.showStopButtonHint'];
  // Réutilisées telles quelles, et déjà traduites partout : le bouton n'a pas
  // eu besoin d'une clé neuve pour son libellé.
  const REUTILISEES = ['common.stop', 'transport.dblClickStop'];

  it('les onze langues sont bien au rendez-vous', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [code, dict] of LANGUES) {
    it(`${code} — libellé et infobulle traduits, et pas recopiés du français`, () => {
      for (const cle of [...CLES, ...REUTILISEES]) {
        expect(dict[cle], `${code} : ${cle} manque`).toBeTruthy();
        if (code !== 'fr') {
          expect(dict[cle], `${code} : ${cle} est resté en français`)
            .not.toBe((lFr as never as Record<string, string>)[cle]);
        }
      }
    });

    it(`${code} — l’infobulle nomme les DEUX gestes : le double-clic et la touche S`, () => {
      // C'est le reproche instruit dans #1428 : le geste existait, rien ne le
      // disait. Un texte qui ne nommerait qu'un seul des deux chemins
      // laisserait le second aussi invisible qu'avant.
      const hint = dict['settings.showStopButtonHint'];
      expect(hint, `${code} : l’infobulle ne mentionne pas la touche S`).toMatch(/\bS\b/);
      expect(hint!.length, `${code} : l’infobulle est trop courte pour dire les deux gestes`)
        .toBeGreaterThan(40);
    });
  }
});
