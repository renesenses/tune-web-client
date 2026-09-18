// @vitest-environment jsdom
//
// « Transférer titre en cours vers autre zone » — renesenses/tune-server-rust
// #3630, FabienM, fil forum 1715 (08/09/2026) : « Dans la bottom bar de
// lecture, prévoir un bouton pour transférer la lecture en cours du titre vers
// une autre zone. »
//
// Rien à écrire côté serveur : `POST /api/v1/zones/{id}/transfer/{cible}`
// reporte file locale, file streaming, index de piste ET offset temporel, et
// laisse en pause une source en pause. `api.transferPlayback` l'enveloppe
// depuis toujours — mais son UNIQUE appelant vivait dans `Sidebar.svelte:44`,
// la barre latérale de l'ANCIENNE coquille, que `ShellV2` ne monte pas. En v2
// le geste était donc inatteignable ; dans les deux interfaces, la barre de
// lecture ne l'offrait pas.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. On monte la vraie barre de
// lecture, on ouvre le vrai sélecteur de zones, on clique — et on regarde la
// méthode et l'URL que `fetch` a reçues. Retirer le bouton fait rougir ; le
// laisser sans conduite aussi.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import fr from '../locales/fr';

const libelle = (fr as unknown as Record<string, string>)['zone.transferHere'];

/** Deux zones sans `output_device_id` : le dédoublonnage du popover les garde. */
function poserZones(etatSource: string) {
  zones.set([
    { id: 1, name: 'Salon', state: etatSource, online: true, volume: 0.4 },
    { id: 2, name: 'Chambre', state: 'stopped', online: true, volume: 0.4 },
  ] as never);
  currentZoneId.set(1);
}

let appels: { url: string; method: string }[] = [];

function corpsPour(url: string) {
  // `/zones` sans suffixe = la liste relue après transfert.
  if (/\/zones(\?|$)/.test(url)) {
    return [
      { id: 1, name: 'Salon', state: 'stopped', online: true, volume: 0.4 },
      { id: 2, name: 'Chambre', state: 'playing', online: true, volume: 0.4 },
    ];
  }
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserLaBarre(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  return hote;
}

function ouvrirLeSelecteur(el: HTMLElement) {
  const bouton = el.querySelector('.zone-selector-btn') as HTMLButtonElement;
  expect(bouton, 'le sélecteur de zones a disparu de la barre').not.toBeNull();
  bouton.click();
  flushSync();
}

/**
 * #1192 — le geste a changé de porte, pas de nature.
 *
 * FabienM, fil 1839, point 1 : la flèche par zone et le bouton dédié faisaient
 * la même chose à deux endroits. La flèche est retirée ; le transfert passe
 * désormais par le bouton « Transférer la lecture vers… » à droite de la barre,
 * qui ouvre sa propre liste de cibles. Ce témoin suit ce déplacement : il
 * continue de CLIQUER et de regarder l'appel HTTP, il ne lit pas le balisage.
 */
function ouvrirLeMenuDeTransfert(el: HTMLElement) {
  const bouton = el.querySelector('.transfer-bar-btn') as HTMLButtonElement | null;
  expect(bouton, 'le bouton « Transférer la lecture vers… » a disparu de la barre').not.toBeNull();
  bouton!.click();
  flushSync();
}

/** La cible nommée, dans le menu du bouton dédié. */
function cibleDeTransfert(el: HTMLElement, nom: string): HTMLButtonElement | null {
  for (const item of Array.from(el.querySelectorAll('.zone-popover [role="menuitem"]'))) {
    if (item.textContent?.includes(nom)) return item as HTMLButtonElement;
  }
  return null;
}

/** La flèche d'autrefois, dans le sélecteur de zones : elle ne doit plus exister. */
function flecheDansLeSelecteur(el: HTMLElement): Element | null {
  return el.querySelector('.zone-transfer-btn');
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
    const corps = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('#3630 puis #1192 — la barre de lecture transfère, par UN SEUL geste', () => {
  it('le bouton dédié liste les AUTRES zones quand la source joue', () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeMenuDeTransfert(el);

    const versChambre = cibleDeTransfert(el, 'Chambre');
    expect(versChambre, 'aucune cible dans le menu de transfert — défaut #3630').not.toBeNull();
    expect(versChambre!.getAttribute('title')).toBe(libelle);

    // Pas la zone COURANTE : on ne transfère pas vers soi-même, et le serveur
    // refuserait.
    expect(cibleDeTransfert(el, 'Salon')).toBeNull();
  });

  it('⭐ #1192 — la flèche par zone a DISPARU du sélecteur : un seul geste, pas deux', () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeSelecteur(el);

    expect(
      flecheDansLeSelecteur(el),
      'la flèche « Transférer la lecture ici » est de retour dans le sélecteur : ' +
        'deux gestes concurrents pour la même action (FabienM, fil 1839, point 1)',
    ).toBeNull();

    // Le témoin : le sélecteur garde son geste À LUI, commuter la zone pilotée.
    const rangees = el.querySelectorAll('.zone-popover-row');
    expect(rangees.length, 'le sélecteur de zones a perdu ses lignes').toBeGreaterThan(0);
  });

  it('le bouton n’apparaît PAS quand rien ne joue — le serveur répondrait 400', () => {
    poserZones('stopped');
    const el = poserLaBarre();
    expect(el.querySelector('.transfer-bar-btn')).toBeNull();
  });

  it('il apparaît quand la source est en PAUSE — le serveur reporte l’état', () => {
    poserZones('paused');
    const el = poserLaBarre();
    ouvrirLeMenuDeTransfert(el);
    expect(cibleDeTransfert(el, 'Chambre')).not.toBeNull();
  });

  it('le clic APPELLE la route de transfert, et non une simple commutation', async () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeMenuDeTransfert(el);
    cibleDeTransfert(el, 'Chambre')!.click();
    await respirer();
    await respirer();

    const transfert = appels.filter((a) => /\/zones\/1\/transfer\/2$/.test(a.url));
    expect(
      transfert.length,
      `la route de transfert n’a pas été appelée ; appels vus : ${appels.map((a) => `${a.method} ${a.url}`).join(' | ')}`,
    ).toBe(1);
    expect(transfert[0].method).toBe('POST');
  });

  it('suit la musique : la zone pilotée devient la cible', async () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeMenuDeTransfert(el);
    cibleDeTransfert(el, 'Chambre')!.click();
    await respirer();
    await respirer();
    flushSync();

    // Sans ce report, l'écran continuerait de piloter une zone silencieuse —
    // c'est ce que fait déjà `Sidebar.svelte:45`.
    expect(get(currentZoneId)).toBe(2);
    expect(el.querySelector('.zone-popover'), 'le menu est resté ouvert').toBeNull();
  });

  it('le sélecteur de zones, lui, commute sans rien transférer', async () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeSelecteur(el);

    let corps: HTMLButtonElement | null = null;
    for (const rangee of Array.from(el.querySelectorAll('.zone-popover-row'))) {
      if (rangee.textContent?.includes('Chambre')) {
        corps = rangee.querySelector('.zone-popover-item') as HTMLButtonElement;
      }
    }
    expect(corps).not.toBeNull();
    corps!.click();
    await respirer();

    expect(get(currentZoneId)).toBe(2);
    expect(appels.some((a) => a.url.includes('/transfer/'))).toBe(false);
  });
});
