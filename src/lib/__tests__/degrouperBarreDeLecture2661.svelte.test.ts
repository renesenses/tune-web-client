// @vitest-environment jsdom
//
// web#2661 (moitié web de server#7937) — impossible de dégrouper des zones.
// La barre de lecture ouvrait la fenêtre de la zone avec une liste de groupes
// VIDE : le bouton « Dégrouper tout » n'apparaissait jamais, et « Appliquer »
// créait un nouveau groupe sans défaire l'ancien.
//
// Le témoin MONTE la barre de lecture, avec un serveur simulé qui dit que
// Salon et Cuisine sont groupées, ouvre « Lecture groupée… » et vérifie :
//  - que « Dégrouper tout » est affiché et défait le groupe ;
//  - qu'« Appliquer » défait l'ancien groupe AVANT d'en créer un nouveau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { selecteurZoneOuvert } from '../stores/selecteurZone';
import { locale } from '../i18n';
import { dictionnaire } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const ZONES = [
  { id: 1, name: 'Salon', output_type: 'dlna', output_device_id: 'uuid:1', state: 'stopped', online: true, group_id: 'g-1' },
  { id: 2, name: 'Cuisine', output_type: 'dlna', output_device_id: 'uuid:2', state: 'stopped', online: true, group_id: 'g-1' },
  { id: 3, name: 'Bureau', output_type: 'dlna', output_device_id: 'uuid:3', state: 'stopped', online: true },
];
const GROUPE = { group_id: 'g-1', leader_id: 1, zone_ids: [1, 2], auto_synced: false, group_manufacturer: '' };

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];
let appels: string[] = [];

const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  locale.set('fr');
  appels = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    const methode = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/zones/groups/list')) return json([GROUPE]);
    if (methode === 'DELETE' && url.includes('/zones/group/')) { appels.push(`ungroup ${url.split('/zones/group/')[1]}`); return json({}); }
    if (methode === 'POST' && url.endsWith('/zones/group')) { appels.push(`group ${init?.body}`); return json({ ...GROUPE, group_id: 'g-2' }); }
    return json([]);
  }));
  (Element.prototype as any).scrollIntoView = function () {};
});
afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  document.querySelectorAll('.modal-overlay, .zone-config-modal').forEach((n) => n.remove());
  zones.set([]);
  currentZoneId.set(null);
  selecteurZoneOuvert.set(false);
  delete (Element.prototype as any).scrollIntoView;
  vi.unstubAllGlobals();
});

const attendre = async () => {
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

async function ouvrirLectureGroupee(): Promise<void> {
  zones.set(ZONES as never);
  currentZoneId.set(1);
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(TransportBar, { target: hote }));
  flushSync();
  hote.querySelector<HTMLButtonElement>('.zone-selector-btn')!.click();
  flushSync();
  hote.querySelector<HTMLButtonElement>('.zone-popover [data-lecture-groupee]')!.click();
  await attendre();
}

const boutons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
const bouton = (texte: string) => boutons().find((b) => b.textContent?.trim() === texte);

describe('web#2661 — dégrouper depuis la barre de lecture', () => {
  it('🔴 la fenêtre reçoit les vrais groupes : « Dégrouper tout » est affiché', async () => {
    await ouvrirLectureGroupee();
    expect(bouton(fr['zone.ungroupAll']), 'aucun bouton « Dégrouper tout » pour une zone groupée').toBeDefined();
  });

  it('🔴 « Dégrouper tout » défait le groupe de la zone', async () => {
    await ouvrirLectureGroupee();
    bouton(fr['zone.ungroupAll'])!.click();
    await attendre();
    expect(appels).toEqual(['ungroup g-1']);
  });

  it('🔴 « Appliquer » défait l’ancien groupe AVANT d’en créer un nouveau', async () => {
    await ouvrirLectureGroupee();
    // Ajouter Bureau au groupe Salon + Cuisine.
    const cases = Array.from(document.querySelectorAll<HTMLLabelElement>('label')).filter((l) => l.textContent?.includes('Bureau'));
    const caseBureau = cases.map((l) => l.querySelector<HTMLInputElement>('input[type="checkbox"]')).find(Boolean)!;
    expect(caseBureau, 'case à cocher de la zone Bureau introuvable').toBeTruthy();
    caseBureau.click();
    flushSync();
    bouton(fr['common.apply'])!.click();
    await attendre();
    expect(appels[0]).toBe('ungroup g-1');
    expect(appels[1]).toMatch(/^group /);
    expect(JSON.parse(appels[1].slice('group '.length)).zone_ids.sort()).toEqual([1, 2, 3]);
  });
});
