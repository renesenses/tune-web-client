// tune-server-rust#8531 — la page du widget signale sa zone à la fenêtre, pour
// que les touches média du clavier visent la zone choisie (et plus la zone 1).
import { describe, expect, it } from 'vitest';
import { writable } from 'svelte/store';
import { adresseZone, brancherSignalZone, estHoteWidget } from '../zoneWidget';

describe('zone signalée au widget de bureau', () => {
  it('ne vaut que dans une fenêtre du widget, mini ou complète', () => {
    expect(estHoteWidget('?vue=mini&hote=widget')).toBe(true);
    expect(estHoteWidget('?hote=widget')).toBe(true);
    expect(estHoteWidget('?vue=mini')).toBe(false);
    expect(estHoteWidget('')).toBe(false);
    expect(estHoteWidget(undefined)).toBe(false);
  });

  it('signale la zone affichée, puis chaque CHANGEMENT de zone, et rien d’autre', () => {
    const zone = writable<{ id: number; state?: string } | null>(null);
    const vues: string[] = [];
    const fin = brancherSignalZone(zone, (a) => vues.push(a));
    expect(vues).toEqual([]);
    zone.set({ id: 4 });
    zone.set({ id: 4, state: 'playing' }); // même zone, autre état : pas de signal
    zone.set({ id: 7 });
    zone.set(null);
    zone.set({ id: 7 });
    expect(vues).toEqual([adresseZone(4), adresseZone(7)]);
    fin();
    zone.set({ id: 2 });
    expect(vues).toEqual(['/__widget/zone/4', '/__widget/zone/7']);
  });

  it('n’envoie jamais d’identifiant que la fenêtre refuserait', () => {
    const zone = writable<{ id: number } | null>(null);
    const vues: string[] = [];
    brancherSignalZone(zone, (a) => vues.push(a));
    zone.set({ id: 0 });
    zone.set({ id: -1 });
    zone.set({ id: 1.5 });
    expect(vues).toEqual([]);
  });
});
