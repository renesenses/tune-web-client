// @vitest-environment jsdom
//
// tune-server-rust#8666 — recette rc12 du 13/11 : poser un réveil depuis
// Lecture en cours sur un titre échouait (« no source ») et le toast
// « Erreur réveil » restait affiché indéfiniment.
//
// Le témoin monte le VRAI `NowPlaying`, ouvre le panneau Réveil, pose 07:00 :
//  - refus `alarm_source_required` : le panneau reste ouvert, dit en clair
//    quoi faire et mène à l'écran Réveils ; aucun toast ;
//  - autre échec : le toast « Erreur réveil » se ferme SEUL (durée > 0).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView, mobileNowPlayingOpen } from '../stores/navigation';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const PISTE = {
  title: 'Blue in Green', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  source: 'qobuz', source_id: 'qobuz-123', duration_ms: 330000,
};

let refus: { status: number; corps: unknown } | null = null;
let poses = 0;
let corpsPose: any = null;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function reponse(url: string, methode: string, body?: unknown): Response {
  if (/\/zones\/1\/alarm(\?|$)/.test(url) && methode === 'POST') corpsPose = body ? JSON.parse(String(body)) : null;
  if (/\/zones\/1\/alarm(\?|$)/.test(url) && methode === 'POST') {
    poses++;
    if (refus) {
      const { status, corps } = refus;
      return {
        ok: false, status, statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }
  }
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search|alarm)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  locale.set('fr');
  refus = null;
  poses = 0;
  corpsPose = null;
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    return reponse(url, String(options?.method ?? 'GET').toUpperCase(), options?.body);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as never);
  currentZoneId.set(1);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  mobileNowPlayingOpen.set(false);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.unstubAllGlobals();
});

async function poserUnReveil(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as never }) as Record<string, unknown>;
  flushSync();
  await respirer();
  const bouton = [...hote.querySelectorAll<HTMLButtonElement>('.np-credits-btn')]
    .find((b) => (b.textContent ?? '').trim() === fr['nowplaying.alarm']);
  expect(bouton, 'bouton Réveil absent — témoin sans objet').toBeTruthy();
  bouton!.click();
  flushSync();
  const heure = hote.querySelector<HTMLInputElement>('.alarm-time-input');
  expect(heure, 'panneau Réveil non ouvert').not.toBeNull();
  heure!.value = '07:00';
  heure!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  hote.querySelector<HTMLButtonElement>('.alarm-set-btn')!.click();
  await respirer();
  flushSync();
  expect(poses, 'le réveil n’est pas parti au serveur').toBe(1);
  return hote;
}

describe('#8666 — réveil depuis Lecture en cours', () => {
  it('🔴 source requise : le panneau le dit, sans toast, et mène aux Réveils', async () => {
    refus = {
      status: 400,
      corps: { error: 'alarm_source_required', code: 'alarm_source_required', message: 'Ce que joue la zone ne peut pas devenir la source du réveil.' },
    };
    const h = await poserUnReveil();
    const avis = h.querySelector('[data-reveil-source-requise]');
    expect(avis, 'le refus ne se dit pas dans le panneau').not.toBeNull();
    expect(avis!.textContent).toContain(fr['nowplaying.alarmSourceRequired' as keyof typeof fr]);
    expect(get(notifications).some((n) => n.level === 'error'), 'pas de toast pour un refus expliqué').toBe(false);
    avis!.querySelector<HTMLButtonElement>('[data-reveil-choisir-source]')!.click();
    flushSync();
    expect(get(activeView)).toBe('alarms');
  });

  it('🔴 serveur d’avant #8666 (`invalid_source`) : même panneau, pas de toast', async () => {
    refus = { status: 400, corps: { error: 'invalid_source', message: 'no source: name source_type and source_id' } };
    const h = await poserUnReveil();
    expect(h.querySelector('[data-reveil-source-requise]')).not.toBeNull();
    expect(get(notifications).some((n) => n.level === 'error')).toBe(false);
  });

  it('🔴 piste de la bibliothèque : son album part avec le réveil', async () => {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: { ...PISTE, source: 'local', album_id: 42, track_id: 7 }, position_ms: 1000 }] as never);
    await poserUnReveil();
    expect(corpsPose).toMatchObject({ time: '07:00', album_id: 42 });
  });

  it('piste de service sans album de bibliothèque : rien de plus n’est envoyé', async () => {
    await poserUnReveil();
    expect(corpsPose?.album_id).toBeUndefined();
  });

  it('🔴 autre refus : le toast « Erreur réveil » se ferme seul', async () => {
    refus = { status: 422, corps: { error: 'invalid_days', message: 'jours invalides' } };
    await poserUnReveil();
    const erreurs = get(notifications).filter((n) => n.level === 'error');
    expect(erreurs.length, 'un seul toast').toBe(1);
    expect(erreurs[0].message).toContain(fr['nowplaying.alarmError']);
    expect(erreurs[0].duration, 'toast d’erreur permanent').toBeGreaterThan(0);
  });

  it('🔴 panne du serveur : le toast du client suffit, il se ferme seul, pas de doublon', async () => {
    refus = { status: 500, corps: { error: 'internal', message: 'boom' } };
    await poserUnReveil();
    const erreurs = get(notifications).filter((n) => n.level === 'error');
    expect(erreurs.length, 'un seul toast pour une panne').toBe(1);
    expect(erreurs.every((n) => n.duration > 0), 'toast d’erreur permanent').toBe(true);
  });

  it('les deux phrases existent dans les quinze langues', () => {
    for (const langue of ONZE_LANGUES) {
      expect(dictionnaire(langue)['nowplaying.alarmSourceRequired'], langue).toBeTruthy();
      expect(dictionnaire(langue)['nowplaying.alarmChooseSource'], langue).toBeTruthy();
    }
  });
});
