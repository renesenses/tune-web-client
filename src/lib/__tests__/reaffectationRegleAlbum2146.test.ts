// @vitest-environment jsdom
//
// web#2146 — Didier, fil 2202 (rc4) : « si je quitte la page de Réaffectation
// des canaux et que je reviens dessus, le bouton Activer n'est plus actif ».
//
// Sa règle 8 → 8 active était enregistrée POUR L'ALBUM. La page ne chargeait
// dans la grille que la règle de ZONE (aucune : 2 → 2, désactivée). La règle
// d'album, qui prime, n'apparaissait que comme une ligne de texte.
//
// On monte le VRAI écran contre un serveur simulé : zone sans règle, album en
// cours avec une règle 8 → 8 active.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Ecran from '../../components/v2/ReaffectationCanauxV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { identite } from '../reaffectationCanaux';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon', output_type: 'local', state: 'playing', volume: 50,
  current_track: { id: 1, title: 'Piste', album_id: 77, album_title: 'Quadraphonie' } };
const effectif = { valid: true, identity: false, bit_exact_copy: true, normalization_db: Array(8).fill(0) };
const REGLE_ALBUM = { ...identite(8), enabled: true };
const VIDE_ZONE = { ...identite(2), enabled: false };
let albumSauve = true;

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
  vi.stubGlobal('fetch', vi.fn(async (url: string) => repondre(String(url))));
  zones.set([ZONE] as any);
  currentZoneId.set(ZONE.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('web#2146 — la règle de l\'album en cours, qui prime, est celle que la grille montre', () => {
  it('🔴 témoin de Didier : règle 8 → 8 active pour l\'album, aucune pour la zone', async () => {
    monter();
    await attendreQue(() => lignesGrille() === 8, 'la grille 8 → 8 de l\'album');
    expect(activer().checked).toBe(true);
    expect(hote!.querySelector('[data-source]')!.getAttribute('data-source')).toBe('album');
    expect(hote!.textContent).toContain('Quadraphonie');
  });

  it('on peut revenir à la règle de la zone, et repasser à celle de l\'album', async () => {
    monter();
    await attendreQue(() => lignesGrille() === 8, 'la grille de l\'album');
    [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Voir la règle de la zone'))!.click();
    flushSync();
    expect(lignesGrille()).toBe(2);
    expect(activer().checked).toBe(false);
    [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Voir la règle de l\'album'))!.click();
    flushSync();
    expect(lignesGrille()).toBe(8);
  });

  it('sans règle d\'album, la grille reste celle de la zone', async () => {
    albumSauve = false;
    monter();
    await attendreQue(() => !!hote!.querySelector('[data-source="zone"]') && lignesGrille() === 2, 'la grille de zone');
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
    expect(lignesGrille()).toBe(2);
    expect(activer().checked).toBe(false);
  });

  it('un changement non enregistré se signale, et quitter la page le dit', async () => {
    albumSauve = false;
    monter();
    await attendreQue(() => lignesGrille() === 2, 'la grille de zone');
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
    expect(hote!.querySelector('[data-non-enregistre]')).toBeNull();
    activer().click();
    flushSync();
    expect(hote!.querySelector('[data-non-enregistre]')).not.toBeNull();
    unmount(monte!); monte = null;
    expect(get(notifications).some((n) => n.message.includes('non enregistrées'))).toBe(true);
  });
});
