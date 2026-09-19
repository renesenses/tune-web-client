import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uneZoneParAppareil } from '../zoneIdentity';

// #1272 — Ludovic Audouin, 19/09/2026 : deux zones sur le même Target Diretta,
// « LVDS » (plus ancienne) et « dCS Vivaldi » (par défaut, en lecture). Le menu
// des zones de la barre de lecture ne montrait que LVDS.

const lvds = { id: 7, output_device_id: 'diretta:target-1', name: 'LVDS' };
const dcs = { id: 12, output_device_id: 'diretta:target-1', name: 'dCS Vivaldi' };
const denon = { id: 3, output_device_id: 'dlna:uuid-denon', name: 'Denon' };
const navigateur = { id: 20, output_device_id: null, name: 'Navigateur' };
const zones = [denon, lvds, navigateur, dcs];

describe('uneZoneParAppareil (#1272)', () => {
  it('garde la zone PILOTÉE quand une autre zone partage son appareil', () => {
    const r = uneZoneParAppareil(zones, dcs.id).map((z) => z.name);
    expect(r).toContain('dCS Vivaldi');
    expect(r).not.toContain('LVDS');
  });
  it("contre-épreuve : sans zone pilotée dans le groupe, la première l'emporte comme avant", () => {
    expect(uneZoneParAppareil(zones, denon.id).map((z) => z.name)).toEqual(['Denon', 'LVDS', 'Navigateur']);
    expect(uneZoneParAppareil(zones, null).map((z) => z.name)).toEqual(['Denon', 'LVDS', 'Navigateur']);
  });
  it("conserve l'ordre et ne regroupe jamais les zones sans appareil", () => {
    const sansAppareil = [{ id: 1, output_device_id: null }, { id: 2, output_device_id: '' }, { id: 3, output_device_id: null }];
    expect(uneZoneParAppareil(sansAppareil, 2).map((z) => z.id)).toEqual([1, 2, 3]);
    expect(uneZoneParAppareil(zones, dcs.id).map((z) => z.id)).toEqual([3, 20, 12]);
  });
});

describe('la barre de lecture passe par uneZoneParAppareil (#1272)', () => {
  const src = readFileSync(resolve(__dirname, '../../components/partages/TransportBar.svelte'), 'utf-8');
  it("plus aucun filtre « la première zone de l'appareil »", () => {
    expect(src).not.toContain('arr.findIndex(x => x.output_device_id === z.output_device_id)');
  });
  it('le menu et les cibles de transfert gardent la zone pilotée', () => {
    expect(src).toContain('uneZoneParAppareil($zones, $currentZoneId).slice(0, 50)');
    expect(src).toContain('uneZoneParAppareil($zones, $currentZoneId).filter(');
    expect(src).toContain('{#each zonesDuMenu as z (z.id)}');
  });
  it("le compteur de l'en-tête compte les lignes affichées", () => {
    expect(src).toContain('<span class="zone-popover-count">{zonesDuMenu.length}</span>');
    expect(src).not.toContain('<span class="zone-popover-count">{$zones.length}</span>');
  });
});
