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
import TransportBar from '../../components/TransportBar.svelte';
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

/** Le bouton de transfert de la ligne dont le nom est donné. */
function transfertDe(el: HTMLElement, nom: string): HTMLButtonElement | null {
  for (const rangee of Array.from(el.querySelectorAll('.zone-popover-row'))) {
    if (rangee.textContent?.includes(nom)) {
      return rangee.querySelector('.zone-transfer-btn') as HTMLButtonElement | null;
    }
  }
  return null;
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

describe('#3630 — la barre de lecture transfère la lecture vers une autre zone', () => {
  it('propose « Transférer la lecture ici » sur les AUTRES zones quand la source joue', () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeSelecteur(el);

    const versChambre = transfertDe(el, 'Chambre');
    expect(versChambre, 'aucun bouton de transfert dans la barre de lecture — défaut #3630').not.toBeNull();
    expect(versChambre!.getAttribute('title')).toBe(libelle);

    // Pas sur la zone COURANTE : on ne transfère pas vers soi-même, et le
    // serveur refuserait.
    expect(transfertDe(el, 'Salon')).toBeNull();
  });

  it('le propose aussi quand la source est en PAUSE — le serveur reporte l’état', () => {
    poserZones('paused');
    const el = poserLaBarre();
    ouvrirLeSelecteur(el);
    expect(transfertDe(el, 'Chambre')).not.toBeNull();
  });

  it('ne le propose PAS quand rien ne joue — le serveur répondrait 400', () => {
    poserZones('stopped');
    const el = poserLaBarre();
    ouvrirLeSelecteur(el);
    expect(transfertDe(el, 'Chambre')).toBeNull();
  });

  it('le clic APPELLE la route de transfert, et non une simple commutation', async () => {
    poserZones('playing');
    const el = poserLaBarre();
    ouvrirLeSelecteur(el);
    transfertDe(el, 'Chambre')!.click();
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
    ouvrirLeSelecteur(el);
    transfertDe(el, 'Chambre')!.click();
    await respirer();
    await respirer();
    flushSync();

    // Sans ce report, l'écran continuerait de piloter une zone silencieuse —
    // c'est ce que fait déjà `Sidebar.svelte:45`.
    expect(get(currentZoneId)).toBe(2);
    expect(el.querySelector('.zone-popover'), 'le popover est resté ouvert').toBeNull();
  });

  it('le clic sur le CORPS de la ligne commute sans rien transférer — les deux gestes restent distincts', async () => {
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
