// @vitest-environment jsdom
//
// #1272 — Ludovic Audouin, v0.9.156, 19/09/2026 : la zone Diretta « dCS
// Vivaldi Upsampler Plus USB », zone par défaut ET en cours de lecture,
// n'apparaissait pas dans la liste des zones de la barre de lecture, alors que
// la zone « LVDS » y était.
//
// Le sélecteur ne garde qu'une zone par appareil de sortie, et gardait la
// PREMIÈRE venue : deux zones sur le même `output_device_id`, et la zone
// pilotée disparaissait de son propre sélecteur. Le compteur de l'en-tête,
// lui, comptait encore la zone masquée.
//
// Deux étages de témoins :
// 1. la règle, sur la vraie fonction `zonesDuSelecteur` ;
// 2. la VRAIE barre de lecture montée, son sélecteur ouvert : on lit les
//    lignes rendues et le compteur, pas le code source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { zonesDuSelecteur } from '../zonesSelecteur';

const LVDS = { id: 7, name: 'Diretta LVDS', output_device_id: 'diretta:target-1', online: true, state: 'stopped', volume: 0.4 };
const USB = { id: 9, name: 'dCS Vivaldi Upsampler Plus USB', output_device_id: 'diretta:target-1', online: true, state: 'playing', volume: 0.4 };
const SALON = { id: 1, name: 'Salon', output_device_id: 'alsa:hw0', online: true, state: 'stopped', volume: 0.4 };
const NAVIGATEUR = { id: 3, name: 'Navigateur', output_device_id: null, online: true, state: 'stopped', volume: 0.4 };

describe('#1272 — zonesDuSelecteur : la zone pilotée représente son appareil', () => {
  it('garde la zone PILOTÉE quand une autre zone, plus haut, partage son appareil', () => {
    const rendu = zonesDuSelecteur([SALON, LVDS, USB, NAVIGATEUR], USB.id);
    expect(
      rendu.map((z) => z.id),
      'la zone pilotée a disparu de son propre sélecteur (#1272) : le dédoublonnage par appareil garde la première venue',
    ).toEqual([SALON.id, USB.id, NAVIGATEUR.id]);
  });

  it('reste à une zone par appareil (la garde de 2fe77a3e contre les centaines de doublons)', () => {
    const doublons = Array.from({ length: 300 }, (_, i) => ({ id: 100 + i, output_device_id: 'dlna:uuid-1' }));
    const rendu = zonesDuSelecteur([...doublons, SALON], SALON.id);
    expect(rendu.map((z) => z.id)).toEqual([100, SALON.id]);
  });

  // ⚠️ Attente RÉVISÉE par #1345. Elle disait « la première venue » sur un
  // montage où `USB` est justement en LECTURE — c'est-à-dire exactement ce dont
  // Ludovic s'est plaint en v0.9.158 : sa zone qui joue restait invisible
  // parce qu'il pilotait une troisième zone. « La première venue » ne vaut
  // donc plus que si AUCUNE zone du groupe ne se distingue.
  it('sans zone pilotée, c\u2019est la zone qui JOUE qui représente le groupe (#1345)', () => {
    expect(zonesDuSelecteur([LVDS, USB, SALON], SALON.id).map((z) => z.id)).toEqual([USB.id, SALON.id]);
    expect(zonesDuSelecteur([LVDS, USB], null).map((z) => z.id)).toEqual([USB.id]);
  });

  it('aucune zone ne se distingue : la première venue, comme avant', () => {
    const a = { ...LVDS, state: 'stopped' };
    const b = { ...USB, state: 'stopped' };
    expect(zonesDuSelecteur([a, b, SALON], SALON.id).map((z) => z.id)).toEqual([a.id, SALON.id]);
    expect(zonesDuSelecteur([a, b], null).map((z) => z.id)).toEqual([a.id]);
  });

  it('ne regroupe jamais les zones sans appareil', () => {
    const a = { id: 1, output_device_id: null };
    const b = { id: 2, output_device_id: undefined };
    const c = { id: 3, output_device_id: '' };
    expect(zonesDuSelecteur([a, b, c], 2).map((z) => z.id)).toEqual([1, 2, 3]);
  });

  it('le plafond de cinquante lignes ne peut pas exclure la zone pilotée', () => {
    const beaucoup = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, output_device_id: `dev-${i}` }));
    const rendu = zonesDuSelecteur(beaucoup, 70);
    expect(rendu).toHaveLength(50);
    expect(rendu.some((z) => z.id === 70), 'la zone pilotée, au-delà du plafond, a été coupée').toBe(true);
  });
});

// ── La vraie barre de lecture ──────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  }) as unknown as Response));
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

function barreAvecSelecteurOuvert(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  const bouton = hote.querySelector('.zone-selector-btn') as HTMLButtonElement | null;
  expect(bouton, 'le sélecteur de zones a disparu de la barre').not.toBeNull();
  bouton!.click();
  flushSync();
  return hote;
}

describe('#1272 — la barre de lecture montée', () => {
  it('le sélecteur liste la zone pilotée, et son compteur compte les lignes affichées', () => {
    zones.set([SALON, LVDS, USB, NAVIGATEUR] as never);
    currentZoneId.set(USB.id);
    const el = barreAvecSelecteurOuvert();

    const noms = Array.from(el.querySelectorAll('.zone-popover-row .zone-popover-name')).map((n) => n.textContent?.trim());
    expect(
      noms,
      'la zone pilotée « dCS Vivaldi Upsampler Plus USB » manque au sélecteur de la barre de lecture (#1272)',
    ).toContain(USB.name);
    expect(noms).not.toContain(LVDS.name);

    const compteur = el.querySelector('.zone-popover-count')?.textContent?.trim();
    expect(
      compteur,
      `le compteur de l'en-tête (${compteur}) ne correspond pas aux ${noms.length} lignes affichées (#1272)`,
    ).toBe(String(noms.length));

    // La ligne ACTIVE est bien celle de la zone pilotée.
    const active = el.querySelector('.zone-popover-row.active .zone-popover-name')?.textContent?.trim();
    expect(active).toBe(USB.name);
  });
});

// #1345 — Ludovic Audouin, v0.9.158 : la zone dCS, PAR DÉFAUT et EN LECTURE,
// restait invisible parce qu'il pilotait une troisième zone (le Serenade).

describe('#1345 — la zone qui joue représente son appareil', () => {
  const lvds = { id: 7, output_device_id: 'diretta:target-1', name: 'LVDS' };
  const dcs = {
    id: 12,
    output_device_id: 'diretta:target-1',
    name: 'dCS Vivaldi',
    state: 'playing',
    is_default: true,
  };
  const serenade = { id: 3, output_device_id: 'dlna:serenade', name: 'Serenade' };
  const zones = [lvds, dcs, serenade];

  it('pilote ailleurs : c’est la zone qui JOUE qui apparaît', () => {
    const r = zonesDuSelecteur(zones, serenade.id).map((z) => z.name);
    expect(r).toEqual(['dCS Vivaldi', 'Serenade']);
  });

  it('la zone pilotée garde la priorité sur la zone qui joue', () => {
    const r = zonesDuSelecteur(zones, lvds.id).map((z) => z.name);
    expect(r).toEqual(['LVDS', 'Serenade']);
  });

  it('sans lecture, la zone PAR DÉFAUT représente son appareil', () => {
    const dcsArretee = { ...dcs, state: 'stopped' };
    const r = zonesDuSelecteur([lvds, dcsArretee, serenade], serenade.id).map((z) => z.name);
    expect(r).toEqual(['dCS Vivaldi', 'Serenade']);
  });

  it('contre-épreuve : sans zone pilotée, sans lecture et sans défaut, la première gagne comme avant', () => {
    const neutres = [
      { id: 7, output_device_id: 'diretta:target-1', name: 'LVDS' },
      { id: 12, output_device_id: 'diretta:target-1', name: 'dCS Vivaldi' },
    ];
    expect(zonesDuSelecteur(neutres, null).map((z) => z.name)).toEqual(['LVDS']);
  });

  it('la pause compte comme une écoute en cours', () => {
    const enPause = { ...dcs, state: 'paused', is_default: false };
    const r = zonesDuSelecteur([lvds, enPause, serenade], serenade.id).map((z) => z.name);
    expect(r).toEqual(['dCS Vivaldi', 'Serenade']);
  });

  it('la place de l’appareil dans la liste ne bouge pas', () => {
    const avant = { id: 1, output_device_id: 'dlna:a', name: 'Avant' };
    const apres = { id: 2, output_device_id: 'dlna:b', name: 'Après' };
    const r = zonesDuSelecteur([avant, lvds, dcs, apres], null).map((z) => z.name);
    expect(r).toEqual(['Avant', 'dCS Vivaldi', 'Après']);
  });

  it('le plafond ne peut pas exclure la zone qui joue', () => {
    const remplissage = Array.from({ length: 5 }, (_, i) => ({
      id: 100 + i,
      output_device_id: `dlna:${i}`,
      name: `Z${i}`,
    }));
    const r = zonesDuSelecteur([...remplissage, dcs], null, 3).map((z) => z.name);
    expect(r).toHaveLength(3);
    expect(r).toContain('dCS Vivaldi');
  });
});
