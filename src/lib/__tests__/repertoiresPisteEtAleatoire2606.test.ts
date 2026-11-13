// @vitest-environment jsdom
//
// web#2606 — fil forum 2595 (JeanPitre, 1.0.0-rc9, Windows 10 Pro), écran
// « Répertoires » :
//  1. « surligner la ligne du morceau en cours qui est lue » (c'était le cas
//     en 0.9) ;
//  2. « rajouter dans le bandeau supérieur un onglet lecture aléatoire ».
//
// Les témoins montent le VRAI écran, lisent la ligne marquée et la REQUÊTE
// émise par le bouton de l'en-tête.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import BrowseView from '../../components/v2-heritage/BrowseView.svelte';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { zones, currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 30_000 });

const DOSSIER = '/music/Jazz';
const PISTES = [
  { id: 11, title: 'So What', track_number: 1, duration_ms: 1000 },
  { id: 12, title: 'Freddie Freeloader', track_number: 2, duration_ms: 1000 },
  { id: 13, title: 'Blue in Green', track_number: 3, duration_ms: 1000 },
];

let zone: any;
let envois: { methode: string; chemin: string; requete: URLSearchParams }[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Bad Request',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    clone() { return this; },
  } as unknown as Response;
}

function repondre(url: string, init?: RequestInit): Response {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  const methode = init?.method ?? 'GET';
  if (methode !== 'GET') envois.push({ methode, chemin: p, requete: u.searchParams });
  if (p === '/library/browse') return reponse(200, { roots: [{ name: 'Musique', path: DOSSIER, track_count: 3, exists: true }] });
  if (p === '/library/browse/dir') {
    return reponse(200, {
      path: DOSSIER, parent: null, music_root: DOSSIER, accessible: true,
      directories: [], tracks: PISTES,
    });
  }
  if (p === '/playback/shuffle-all') return reponse(200, { status: 'ok', track_count: 42 });
  if (/\/zones/.test(p)) return reponse(200, [zone]);
  return reponse(200, {});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 5_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

beforeEach(() => {
  envois = [];
  zone = { id: 4, name: 'Salon', state: 'playing', volume: 0.5, current_track: { track_id: 12, title: 'Freddie Freeloader' } };
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  zones.set([zone]);
  currentZoneId.set(zone.id);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const lignes = () => Array.from(hote!.querySelectorAll<HTMLElement>('.track-item'));

async function ouvrirLeDossier() {
  monte = mount(BrowseView, { target: hote!, props: {} });
  flushSync();
  // L'historique de la coquille survit d'un témoin à l'autre : l'écran peut
  // rouvrir directement le dernier dossier (même garde que #7597).
  await attendreQue(() => !!hote!.querySelector('.root-item') || lignes().length > 0, 'l’écran Répertoires');
  if (lignes().length === 0) {
    hote!.querySelector<HTMLButtonElement>('.root-item')!.click();
    flushSync();
  }
  await attendreQue(() => hote!.querySelectorAll('.track-item').length === 3, 'les pistes du dossier');
}


describe('web#2606 — Répertoires repère la piste en cours', () => {
  it('🔴 la ligne de la piste qui joue est marquée, et elle seule', async () => {
    await ouvrirLeDossier();
    const marquees = lignes().filter((l) => l.classList.contains('en-lecture'));
    expect(marquees).toHaveLength(1);
    expect(marquees[0].textContent).toContain('Freddie Freeloader');
    expect(marquees[0].getAttribute('aria-current')).toBe('true');
    // Le repère d'état (trois canaux : icône, libellé, couleur) remplace le numéro.
    expect(marquees[0].querySelector('.track-num [aria-label]')?.getAttribute('aria-label')).toBe('En lecture');
  });

  it('en pause, la ligne reste repérée, mais dit « en pause »', async () => {
    zone.state = 'paused';
    zones.set([zone]);
    await ouvrirLeDossier();
    const l = lignes().find((x) => x.classList.contains('en-lecture'))!;
    expect(l.textContent).toContain('Freddie Freeloader');
    expect(l.querySelector('.track-num [aria-label]')?.getAttribute('aria-label')).toBe('En pause');
  });

  it('le repère suit la lecture quand la piste change', async () => {
    await ouvrirLeDossier();
    zones.set([{ ...zone, current_track: { track_id: 13, title: 'Blue in Green' } }]);
    flushSync();
    const marquees = lignes().filter((l) => l.classList.contains('en-lecture'));
    expect(marquees).toHaveLength(1);
    expect(marquees[0].textContent).toContain('Blue in Green');
  });

  it('aucune ligne marquée quand la piste en cours n’est pas dans ce dossier', async () => {
    zone.current_track = { track_id: 999, title: 'Ailleurs' };
    zones.set([zone]);
    await ouvrirLeDossier();
    expect(lignes().some((l) => l.classList.contains('en-lecture'))).toBe(false);
  });
});

describe('web#2606 — Répertoires : lecture aléatoire dans l’en-tête', () => {
  it('🔴 le bouton est dans l’en-tête et tire dans le DOSSIER (sous-dossiers compris) par la lecture aléatoire existante', async () => {
    await ouvrirLeDossier();
    const b = hote!.querySelector<HTMLButtonElement>('.browse-header [data-dossier-aleatoire]');
    expect(b, 'bouton absent de l’en-tête').not.toBeNull();
    expect(b!.textContent).toContain('Aléatoire');
    expect(b!.title).toBe('Lire ce dossier et ses sous-dossiers en aléatoire');
    b!.click();
    await attendreQue(() => envois.some((e) => e.chemin === '/playback/shuffle-all'), 'la requête d’aléatoire');
    const e = envois.find((x) => x.chemin === '/playback/shuffle-all')!;
    expect(e.methode).toBe('POST');
    expect(e.requete.get('zone_id')).toBe('4');
    expect(e.requete.get('folder')).toBe(DOSSIER);
    await attendreQue(() => get(notifications).some((n) => n.message.includes('42')), 'la confirmation');
  });

  it('sans zone choisie, rien ne part et l’écran le dit', async () => {
    await ouvrirLeDossier();
    // Aucune zone : `currentZone` retombe sinon sur la première.
    zones.set([]);
    currentZoneId.set(null as any);
    flushSync();
    hote!.querySelector<HTMLButtonElement>('[data-dossier-aleatoire]')!.click();
    await attendreQue(() => get(notifications).some((n) => n.level === 'error'), 'le message');
    expect(envois.some((e) => e.chemin === '/playback/shuffle-all')).toBe(false);
  });
});
