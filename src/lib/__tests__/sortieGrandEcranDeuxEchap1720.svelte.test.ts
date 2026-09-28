// @vitest-environment jsdom
//
// #1720 — FabienM, fil forum 2013 « v0.9.167: Divers bugs », point 6 :
//
//   « 6 - Le mode grand écran: quitter le mode avec ECHAP ne revient pas à
//     l'écran normal. Il faut ECHAP une seconde fois pour revenir à l'écran
//     normal »
//
// ## La cause, et pourquoi elle n'est pas où on la cherche
//
// `entrerEnModeGrandEcran` met le document en plein écran NATIF avant d'ouvrir
// la vue `'tv'`. Or, en plein écran natif, le navigateur garde pour lui la
// première pression sur Échap : il quitte le plein écran et n'émet AUCUN
// `keydown` vers la page. L'écouteur clavier de `TvView` — la seule sortie
// jusqu'ici — ne voit donc rien : la vue reste affichée, en fenêtre. Le second
// Échap, lui, arrive, et c'est celui-là qui ferme l'écran.
//
// Le seul signal émis dans ce cas est `fullscreenchange`. Ces témoins jouent
// donc la scène telle que le navigateur la produit : un `fullscreenchange`
// dont `document.fullscreenElement` retombe à `null`, SANS aucun `keydown`.
//
// ## Ce que ces témoins font
//
// Ils montent le VRAI `TvView` (comme `retourDepuisGrandEcran1134`) et
// observent la vue où l'on atterrit. jsdom n'a pas d'API plein écran : elle
// est posée ici à la main, ce qui est justement ce qui rend la scène jouable.
//
// ## Ce qu'ils ne font PAS
//
// Ils ne prouvent pas que le navigateur de FabienM se comporte ainsi — c'est
// le comportement documenté de Chrome, Edge et Firefox, et aucun essai n'a été
// fait sur sa machine. Ils tiennent que Tune, lui, réagit désormais au seul
// signal qu'il reçoit dans ce cas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { surSortieDuPleinEcran, type DocumentPleinEcran } from '../modeGrandEcran';
import TvView from '../../components/v2-heritage/TvView.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';

/** Monter cet écran compile plusieurs milliers de lignes de Svelte. */
vi.setConfig({ testTimeout: 60_000 });

// ─── La règle, à nu ────────────────────────────────────────────────────────

/** Un document de papier : l'état du plein écran et ses abonnés, rien d'autre. */
function documentFeint(depart: Element | null = null) {
  const abonnes = new Set<() => void>();
  const doc = {
    fullscreenElement: depart,
    addEventListener: (_t: string, e: () => void) => { abonnes.add(e); },
    removeEventListener: (_t: string, e: () => void) => { abonnes.delete(e); },
  } as DocumentPleinEcran & { fullscreenElement: Element | null };
  return {
    doc,
    nombreDAbonnes: () => abonnes.size,
    /** Ce que le navigateur fait : il change l'état PUIS il prévient. */
    poser(valeur: Element | null) {
      doc.fullscreenElement = valeur;
      for (const e of [...abonnes]) e();
    },
  };
}

const ELEMENT = { nodeName: 'HTML' } as unknown as Element;

describe('#1720 — la règle : sortir quand le plein écran natif est quitté', () => {
  it('🔴 le plein écran quitté fait sortir — c’est le premier Échap que la page ne reçoit pas', () => {
    const quitter = vi.fn();
    const f = documentFeint(ELEMENT);
    surSortieDuPleinEcran(quitter, f.doc);
    f.poser(null);
    expect(quitter, 'la sortie du plein écran natif n’a pas fermé le Grand écran (#1720)')
      .toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 `requestFullscreen` est ASYNCHRONE et `entrerEnModeGrandEcran` n'attend
   * pas : à l'instant où la vue se monte, le plein écran peut n'être pas encore
   * accordé. Le second cas est donc le cas RÉEL.
   */
  it('s’arme aussi quand le plein écran n’est accordé qu’APRÈS le montage', () => {
    const quitter = vi.fn();
    const f = documentFeint(null);
    surSortieDuPleinEcran(quitter, f.doc);
    f.poser(ELEMENT);
    expect(quitter, 'l’entrée en plein écran ne doit pas fermer la vue').not.toHaveBeenCalled();
    f.poser(null);
    expect(quitter).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 LE CAS DU PLEIN ÉCRAN REFUSÉ, que `demanderPleinEcran` avale exprès.
   * Sans plein écran, rien ne s’arme : la vue Grand écran reste utilisable en
   * fenêtre, où le premier Échap arrive déjà au clavier.
   */
  it('ne sort JAMAIS sur un `null` qui n’a pas été précédé d’un plein écran', () => {
    const quitter = vi.fn();
    const f = documentFeint(null);
    surSortieDuPleinEcran(quitter, f.doc);
    f.poser(null);
    f.poser(null);
    expect(quitter, 'un plein écran refusé ne doit pas refermer la vue').not.toHaveBeenCalled();
  });

  it('ne sort qu’une fois, même si le navigateur répète l’événement', () => {
    const quitter = vi.fn();
    const f = documentFeint(ELEMENT);
    surSortieDuPleinEcran(quitter, f.doc);
    f.poser(null);
    f.poser(null);
    expect(quitter).toHaveBeenCalledTimes(1);
  });

  it('`arreter` retire l’abonnement, et le rend muet', () => {
    const quitter = vi.fn();
    const f = documentFeint(ELEMENT);
    const arreter = surSortieDuPleinEcran(quitter, f.doc);
    expect(f.nombreDAbonnes()).toBe(1);
    arreter();
    expect(f.nombreDAbonnes()).toBe(0);
    f.poser(null);
    expect(quitter).not.toHaveBeenCalled();
    expect(() => arreter()).not.toThrow();
  });

  it('sans document, elle ne lève pas et rend de quoi s’arrêter', () => {
    expect(() => surSortieDuPleinEcran(vi.fn(), null)()).not.toThrow();
    expect(() => surSortieDuPleinEcran(vi.fn(), undefined as never)()).not.toThrow();
  });
});

// ─── Le geste, sur le VRAI écran ───────────────────────────────────────────

const PISTE = {
  track_id: 12,
  album_id: 55,
  artist_id: 994,
  title: 'The Price',
  artist_name: 'Leprous',
  album_title: 'Malina',
  source: 'library',
  duration_ms: 321000,
};
const ZONE = { id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 };

function reponse(url: string) {
  const corps = /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {};
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
/** L'état du plein écran natif, que jsdom n'a pas : posé ici à la main. */
let elementPleinEcran: Element | null = null;

/** Ce que le navigateur fait : il change l'état PUIS il émet l'événement. */
function poserPleinEcran(valeur: Element | null) {
  elementPleinEcran = valeur;
  document.dispatchEvent(new Event('fullscreenchange'));
  flushSync();
}

/** Ce que la coquille fait quand `activeView` passe à `'tv'`. */
function poserGrandEcran(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TvView, { target: hote, props: {} as never });
  flushSync();
  return hote;
}

function retirerGrandEcran() {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponse(String(url))));
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as never,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never,
  );
  elementPleinEcran = null;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => elementPleinEcran,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    writable: true,
    value: async () => { poserPleinEcran(null); },
  });
  zones.set([ZONE] as never);
  currentZoneId.set(1);
  activeView.set('library');
  activeView.set('nowplaying');
  activeView.set('tv');
});

afterEach(() => {
  retirerGrandEcran();
  delete (document as unknown as Record<string, unknown>).fullscreenElement;
  delete (document as unknown as Record<string, unknown>).exitFullscreen;
  vi.unstubAllGlobals();
});

describe('#1720 — le Grand écran se ferme au PREMIER Échap', () => {
  /**
   * 🔴 LE TÉMOIN. Aucun `keydown` n'est joué : c'est tout le sujet du ticket.
   * Le navigateur a consommé la touche pour quitter le plein écran, et n'a
   * transmis à la page que `fullscreenchange`.
   */
  it('🔴 le plein écran quitté SANS keydown ramène à « Lecture en cours »', async () => {
    poserGrandEcran();
    await respirer();
    poserPleinEcran(ELEMENT); // le plein écran est accordé après le montage
    await respirer();
    expect(get(activeView), 'l’entrée en plein écran a refermé la vue').toBe('tv');

    // Le premier Échap, tel que la page le reçoit : rien, sinon ceci.
    poserPleinEcran(null);
    await respirer();

    expect(
      get(activeView),
      'le premier Échap n’a pas fermé le Grand écran : il en faut toujours deux (#1720)',
    ).toBe('nowplaying');
  });

  /**
   * Le plein écran refusé — `demanderPleinEcran` avale le refus. Rien ne doit
   * fermer la vue toute seule : elle reste utilisable en fenêtre, et son Échap
   * au clavier fonctionne déjà.
   */
  it('sans plein écran natif, la vue reste ouverte et l’Échap du clavier la ferme', async () => {
    poserGrandEcran();
    await respirer();
    poserPleinEcran(null); // un `fullscreenchange` sans plein écran préalable
    await respirer();
    expect(get(activeView), 'la vue s’est refermée toute seule').toBe('tv');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await respirer();
    expect(get(activeView)).toBe('nowplaying');
  });

  /**
   * 🔴 La sortie DÉLIBÉRÉE appelle `exitFullscreen()`, qui émet à son tour un
   * `fullscreenchange`. Sans la coupure de la garde, cette sortie serait jouée
   * DEUX fois, la seconde sur une `previousView` entre-temps devenue `'tv'`.
   */
  it('le clic de sortie ne navigue qu’UNE fois, malgré son propre `fullscreenchange`', async () => {
    const tv = poserGrandEcran();
    await respirer();
    poserPleinEcran(ELEMENT);
    await respirer();

    const vues: string[] = [];
    const desabonner = activeView.subscribe((v) => vues.push(String(v)));
    vues.length = 0;

    tv.querySelector<HTMLElement>('.tv-root')!.click();
    await respirer();
    desabonner();

    expect(vues, 'la sortie a été rejouée par son propre `fullscreenchange`').toEqual(['nowplaying']);
  });
});
