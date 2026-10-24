// @vitest-environment jsdom
//
// web#2146, reste recadré le 15/10 — Didier, fil 2202, réponse 8281 : « si
// j'ai configuré la zone avec une réaffectation par défaut et que je veux
// ajouter une réaffectation différente pour un album en particulier, je suis
// obligé de modifier la matrice ».
//
// Rien ne distinguait « éditer la règle de zone » de « créer une règle
// d'album à partir d'elle », et rien ne disait qu'« Enregistrer pour la zone »
// remplace le réglage par défaut de toute la zone — même quand la grille
// montrait la règle de l'album. On monte le VRAI écran contre un serveur
// simulé et on compte les écritures (PUT) qu'il reçoit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Ecran from '../../components/v2/ReaffectationCanauxV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { dialogs } from '../stores/dialogs';
import { identite } from '../reaffectationCanaux';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon', output_type: 'local', state: 'playing', volume: 50,
  current_track: { id: 1, title: 'Piste', album_id: 77, album_title: 'Quadraphonie' } };
const effectif = { valid: true, identity: false, bit_exact_copy: true, normalization_db: Array(8).fill(0) };
const REGLE_ALBUM = { ...identite(8), enabled: true };
const VIDE_ZONE = { ...identite(2), enabled: false };
let albumSauve = true;
const ecritures: string[] = [];

function etat(settings: unknown, saved: boolean) {
  return { key: 'k', saved, settings, effective: effectif, input_names: null, output_names: null };
}

function repondre(url: string) {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  let corps: unknown = {};
  if (p === '/channel-remap/presets') corps = { presets: [], limits: { max_channels: 8, gain_min_db: -60, gain_max_db: 12 } };
  else if (p === '/channel-remap/zones/4') corps = etat(VIDE_ZONE, false);
  else if (p === '/channel-remap/albums/77') corps = albumSauve ? etat(REGLE_ALBUM, true) : etat(VIDE_ZONE, false);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

const activer = () => hote!.querySelector<HTMLInputElement>('input[type=checkbox][aria-label="Activer"]')!;
const lignesGrille = () => hote!.querySelectorAll('[data-grille] tbody tr').length;
const monter = () => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Ecran, { target: hote, props: {} });
  flushSync();
};

beforeEach(() => {
  albumSauve = true;
  locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  ecritures.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') ecritures.push(`${init.method} ${new URL(String(url), 'http://localhost').pathname.replace(/^\/api\/v1/, '')}`);
    return repondre(String(url));
  }));
  zones.set([ZONE] as any);
  currentZoneId.set(ZONE.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bouton = (texte: string) =>
  [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte);

describe('web#2146 — créer une règle d\'album sans toucher à la règle de zone', () => {
  it('🔴 sans règle d\'album : le bouton dit « Créer », et que la zone ne change pas', async () => {
    albumSauve = false;
    monter();
    await attendreQue(() => !!hote!.querySelector('[data-source="zone"]') && lignesGrille() === 2, 'la grille de zone');
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
    expect(bouton('Créer la règle de cet album')).toBeDefined();
    expect(bouton('Enregistrer pour cet album')).toBeUndefined();
    expect(hote!.querySelector('[data-creer-album]')!.textContent).toContain("la règle de la zone n'est pas modifiée");
    expect(hote!.querySelector('[data-portee-zone="zone"]')!.textContent).toContain('toute la zone');
  });

  it('créer la règle d\'album n\'écrit QUE la règle de l\'album', async () => {
    albumSauve = false;
    monter();
    await attendreQue(() => !!bouton('Créer la règle de cet album'), 'le bouton Créer');
    activer().click();
    flushSync();
    bouton('Créer la règle de cet album')!.click();
    await attendreQue(() => ecritures.length > 0, 'une écriture');
    expect(ecritures).toEqual(['PUT /channel-remap/albums/77']);
  });

  it('🔴 grille de l\'album : « Enregistrer pour la zone » prévient et demande avant de remplacer la zone', async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    monter();
    await attendreQue(() => lignesGrille() === 8, 'la grille de l\'album');
    expect(hote!.querySelector('[data-portee-zone="album"]')!.textContent).toContain('remplacera le réglage par défaut de toute la zone');
    expect(bouton('Enregistrer pour cet album')).toBeDefined();
    bouton('Enregistrer pour la zone')!.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(ecritures).toEqual([]);
    confirmer.mockResolvedValue(true);
    bouton('Enregistrer pour la zone')!.click();
    await attendreQue(() => ecritures.length > 0, 'une écriture');
    expect(ecritures).toEqual(['PUT /channel-remap/zones/4']);
  });

  it('grille de la zone : « Enregistrer pour la zone » ne demande rien', async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    albumSauve = false;
    monter();
    await attendreQue(() => !!hote!.querySelector('[data-source="zone"]') && lignesGrille() === 2, 'la grille de zone');
    bouton('Enregistrer pour la zone')!.click();
    await attendreQue(() => ecritures.length > 0, 'une écriture');
    expect(confirmer).not.toHaveBeenCalled();
    expect(ecritures).toEqual(['PUT /channel-remap/zones/4']);
  });
});
