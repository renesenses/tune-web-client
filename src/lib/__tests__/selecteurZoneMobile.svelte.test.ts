// @vitest-environment jsdom
/**
 * Essai en 5G du 09/10/2026 (iPhone, par le pont) : aucun sélecteur de zone
 * sur téléphone. La pastille de zone de la barre vit dans `.transport-right`,
 * masquée sous 768 px ; la puce « Eversolo DMP-A8 » de la carte de l'accueil
 * ne faisait que commuter vers sa propre zone. Impossible donc de passer sur
 * « Cet ordinateur » pour faire jouer le téléphone.
 *
 * Ces bancs montent les vrais composants et cliquent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import CarteZoneL1 from '../../components/v2/ligne1/CarteZoneL1.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { selecteurZoneOuvert } from '../stores/selecteurZone';
import { locale } from '../i18n';
import type { Zone } from '../types';

const ZONES = [
  { id: 10, name: 'Eversolo DMP-A8', output_type: 'dlna', state: 'playing', online: true, volume: 0.4 },
  { id: 15, name: 'Cet ordinateur', output_type: 'browser', state: 'stopped', online: true, volume: 1 },
];

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];
function monter(C: any, props: Record<string, unknown> = {}) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  const m = mount(C, { target: hote, props });
  montes.push(m);
  flushSync();
  return hote;
}
async function attendre() {
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (/\/zones(\?|$)/.test(String(url))) return reponse(ZONES);
    return reponse({});
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // Un téléphone : 390 px de large.
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /max-width:\s*768px/.test(q), media: q,
    addEventListener() {}, removeEventListener() {},
  }));
  zones.set(ZONES as never);
  currentZoneId.set(10);
  selecteurZoneOuvert.set(false);
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  zones.set([]);
  currentZoneId.set(null);
  selecteurZoneOuvert.set(false);
  vi.unstubAllGlobals();
});

describe('barre de lecture : le choix de zone sur téléphone', () => {
  it('un bouton de zone propre au petit écran ouvre la feuille des zones', () => {
    const el = monter(TransportBar);
    const bouton = el.querySelector<HTMLButtonElement>('.mobile-zone-wrapper button');
    expect(bouton, 'aucun bouton de zone hors de .transport-right (masquée sous 768 px)').not.toBeNull();
    expect(bouton!.closest('.transport-right')).toBeNull();
    bouton!.click();
    flushSync();
    const feuille = el.querySelector('.mobile-zone-wrapper .zone-popover.zone-sheet');
    expect(feuille, 'la feuille des zones ne s’ouvre pas').not.toBeNull();
    expect(feuille!.closest('.transport-right')).toBeNull();
    expect(feuille!.textContent).toContain('Cet ordinateur');
    expect(feuille!.textContent).toContain('Eversolo DMP-A8');
    // Une seule liste dans le DOM
    expect(el.querySelectorAll('.zone-popover').length).toBe(1);
  });

  it('choisir « Cet ordinateur » en fait la zone pilotée et referme la feuille', () => {
    const el = monter(TransportBar);
    el.querySelector<HTMLButtonElement>('.mobile-zone-wrapper button')!.click();
    flushSync();
    const ligne = Array.from(el.querySelectorAll<HTMLButtonElement>('.zone-sheet .zone-popover-item'))
      .find((b) => b.textContent?.includes('Cet ordinateur'));
    expect(ligne).toBeTruthy();
    ligne!.click();
    flushSync();
    expect(get(currentZoneId)).toBe(15);
    expect(get(selecteurZoneOuvert)).toBe(false);
    expect(el.querySelector('.zone-sheet')).toBeNull();
  });

  it('le sélecteur s’ouvre aussi quand un autre écran le demande', () => {
    const el = monter(TransportBar);
    selecteurZoneOuvert.set(true);
    flushSync();
    expect(el.querySelector('.zone-sheet')).not.toBeNull();
  });
});

describe('accueil : la puce de zone de la carte ouvre le sélecteur', () => {
  it('un appui sur la puce ouvre le choix de zone', async () => {
    const props = $state({ zone: { ...ZONES[0], position_ms: 0 } as unknown as Zone });
    const el = monter(CarteZoneL1, props);
    const puce = el.querySelector<HTMLButtonElement>('button.zone');
    expect(puce).not.toBeNull();
    puce!.click();
    await attendre();
    expect(get(selecteurZoneOuvert)).toBe(true);
    expect(get(currentZoneId)).toBe(10);
  });
});
