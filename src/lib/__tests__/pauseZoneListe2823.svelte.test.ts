// @vitest-environment jsdom
/**
 * web#2823 (fil 2766, rc11 macOS) — dans la liste des zones, le ▶ vert qui
 * marquait une zone EN LECTURE se lisait « cliquez pour lire ». Décision de
 * Bertrand (11/11) : à sa place, un bouton pause cliquable sur chaque zone qui
 * joue ; un clic met CETTE zone en pause sans changer la zone pilotée.
 *
 * Ces bancs montent la vraie barre de lecture, ouvrent la liste et cliquent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { selecteurZoneOuvert } from '../stores/selecteurZone';
import { locale } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const ZONES = [
  { id: 10, name: 'Salon', output_type: 'dlna', state: 'stopped', online: true, volume: 0.4 },
  { id: 20, name: 'Chambre', output_type: 'dlna', state: 'playing', online: true, volume: 0.4 },
  { id: 30, name: 'Bureau', output_type: 'dlna', state: 'paused', online: true, volume: 0.4 },
];

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let posts: string[] = [];
let hote: HTMLElement;
let monte: ReturnType<typeof mount> | null = null;

async function attendre() {
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

function ouvrir(): HTMLElement {
  monte = mount(TransportBar, { target: hote });
  flushSync();
  selecteurZoneOuvert.set(true);
  flushSync();
  const liste = hote.querySelector<HTMLElement>('.zone-popover');
  expect(liste, 'la liste des zones ne s’ouvre pas').not.toBeNull();
  return liste!;
}

const rangee = (liste: HTMLElement, nom: string) =>
  Array.from(liste.querySelectorAll<HTMLElement>('.zone-popover-row'))
    .find((r) => r.querySelector('.zone-popover-name')?.textContent === nom)!;

beforeEach(() => {
  locale.set('fr');
  posts = [];
  hote = document.createElement('div');
  document.body.appendChild(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const m = /\/zones\/(\d+)\/pause/.exec(u);
    if ((init?.method ?? 'GET') === 'POST' && m) {
      posts.push(u);
      const z = ZONES.find((x) => x.id === Number(m[1]))!;
      return reponse({ ...z, state: 'paused' });
    }
    if (/\/zones(\?|$)/.test(u)) return reponse(get(zones));
    return reponse({});
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  zones.set(ZONES.map((z) => ({ ...z })) as never);
  currentZoneId.set(10);
  selecteurZoneOuvert.set(false);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  zones.set([]);
  currentZoneId.set(null);
  selecteurZoneOuvert.set(false);
  vi.unstubAllGlobals();
});

describe('#2823 — la liste des zones : un bouton pause, plus de ▶', () => {
  it('seule la zone qui joue porte un bouton pause, nommé et traduit ; plus aucun ▶', () => {
    const liste = ouvrir();
    expect(liste.querySelector('.zone-playing-indicator'), 'le ▶ « en lecture » est revenu').toBeNull();
    expect(liste.querySelector('polygon[points="0,0 10,6 0,12"]')).toBeNull();

    const pause = rangee(liste, 'Chambre').querySelector<HTMLButtonElement>('button.zone-popover-pause');
    expect(pause, 'pas de bouton pause sur la zone en lecture').not.toBeNull();
    expect(pause!.getAttribute('aria-label')).toBe('Mettre Chambre en pause');
    // Un BOUTON frère, pas une icône dans le bouton de sélection.
    expect(pause!.closest('.zone-popover-item')).toBeNull();

    // Zone arrêtée, zone en pause : pas de bouton.
    expect(rangee(liste, 'Salon').querySelector('.zone-popover-pause')).toBeNull();
    expect(rangee(liste, 'Bureau').querySelector('.zone-popover-pause')).toBeNull();
    expect(liste.querySelectorAll('.zone-popover-pause')).toHaveLength(1);
  });

  it('un clic met CETTE zone en pause, sans changer la zone pilotée ni fermer la liste', async () => {
    const liste = ouvrir();
    const pause = rangee(liste, 'Chambre').querySelector<HTMLButtonElement>('button.zone-popover-pause')!;
    const remonte = vi.fn();
    // Svelte 5 délègue les clics à la racine du montage (`hote`) : on écoute au-dessus.
    document.body.addEventListener('click', remonte);
    pause.click();
    await attendre();

    document.body.removeEventListener('click', remonte);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatch(/\/zones\/20\/pause/);
    expect(get(currentZoneId), 'la zone pilotée a changé').toBe(10);
    expect(get(selecteurZoneOuvert)).toBe(true);
    expect(remonte, 'le clic remonte (stopPropagation manquant)').not.toHaveBeenCalled();
    // L'état est reporté : la zone est en pause, le bouton s'en va.
    expect(get(zones).find((z) => z.id === 20)?.state).toBe('paused');
    expect(hote.querySelector('.zone-popover-pause')).toBeNull();
  });

  it('le libellé existe dans les 15 langues et nomme la zone', () => {
    expect(ONZE_LANGUES.length).toBe(15);
    for (const lang of ONZE_LANGUES) {
      const v = dictionnaire(lang)['zone.pauseThisZone'];
      expect(v, `zone.pauseThisZone manque en ${lang}`).toBeTruthy();
      expect(v, `${lang} : {name} absent`).toContain('{name}');
    }
  });
});
