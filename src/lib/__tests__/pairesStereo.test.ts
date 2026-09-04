/**
 * La voie gauche est CHOISIE, jamais déduite.
 *
 * Le client actuel prend `Array.from(selectedZoneIds)` et affecte `[0]` à
 * gauche, `[1]` à droite : l'ordre d'insertion d'un `Set`, invisible à
 * l'écran. Une inversion ne lève aucune erreur — la scène stéréo est
 * retournée, et seul quelqu'un qui connaît l'enregistrement s'en aperçoit.
 *
 * D'où ces tests : ils portent sur la seule décision qui puisse se tromper
 * silencieusement.
 */
import { describe, it, expect } from 'vitest';
import { zonesAppairables, parametresPaire, voieDeLaZone } from '../pairesStereo';
import type { Zone } from '../types';

const zone = (o: Partial<Zone>): Zone =>
  ({ id: 1, name: 'z', output_type: 'dlna', output_device_id: 'uuid:1', ...o }) as Zone;

// Deux zones DLNA du .18, mesurées le 04/09/2026.
const GAUCHE = zone({ id: 10, name: 'Eversolo DMP-A8', output_device_id: 'uuid:9C41535E' });
const DROITE = zone({ id: 13, name: 'Lindemann', output_device_id: 'uuid:e92cc83b' });

describe('zonesAppairables', () => {
  it('ne retient que le DLNA', () => {
    const l = [GAUCHE, zone({ id: 2, output_type: 'airplay' }), zone({ id: 3, output_type: 'local' })];
    expect(zonesAppairables(l).map((z) => z.id)).toEqual([10]);
  });

  it('écarte une zone sans appareil', () => {
    // Rien à appairer : `POST` exige deux identifiants d'appareil.
    expect(zonesAppairables([zone({ id: 4, output_device_id: undefined })])).toEqual([]);
  });

  it('écarte une zone déjà appairée', () => {
    expect(zonesAppairables([zone({ id: 5, stereo_pair_id: 'p1' })])).toEqual([]);
  });
});

describe('parametresPaire', () => {
  const zones = [GAUCHE, DROITE];

  it('donne l’appareil de la zone choisie À GAUCHE comme voie gauche', () => {
    const p = parametresPaire(zones, 10, 13, 'Salon');
    expect(p).toEqual({ nom: 'Salon', appareilGauche: 'uuid:9C41535E', appareilDroit: 'uuid:e92cc83b' });
  });

  it('inverser le choix inverse les appareils, et rien d’autre', () => {
    // C'est LA propriété : le résultat suit le choix, pas l'ordre de la liste.
    const p = parametresPaire(zones, 13, 10, 'Salon');
    expect(p?.appareilGauche).toBe('uuid:e92cc83b');
    expect(p?.appareilDroit).toBe('uuid:9C41535E');
  });

  it('refuse la même zone des deux côtés', () => {
    // Le serveur créerait une paire dont les deux moitiés visent le même
    // appareil : une voie sur deux disparaîtrait sans que rien ne le dise.
    expect(parametresPaire(zones, 10, 10, 'Salon')).toBeNull();
  });

  it('refuse un choix incomplet', () => {
    expect(parametresPaire(zones, 10, null, 'Salon')).toBeNull();
    expect(parametresPaire(zones, null, 13, 'Salon')).toBeNull();
  });

  it('refuse un nom vide ou blanc', () => {
    expect(parametresPaire(zones, 10, 13, '')).toBeNull();
    expect(parametresPaire(zones, 10, 13, '   ')).toBeNull();
  });

  it('rogne le nom', () => {
    expect(parametresPaire(zones, 10, 13, '  Salon  ')?.nom).toBe('Salon');
  });

  it('refuse une zone non appairable, même choisie', () => {
    // L'écran ne propose que des zones appairables, mais l'état peut avoir
    // vieilli : une paire créée depuis un autre onglet entre-temps.
    const dejaPrise = [{ ...GAUCHE, stereo_pair_id: 'p1' } as Zone, DROITE];
    expect(parametresPaire(dejaPrise, 10, 13, 'Salon')).toBeNull();
  });
});

describe('voieDeLaZone', () => {
  const paires = [{ left_zone: { id: 10 }, right_zone: { id: 13 } }];

  it('reconnaît chaque voie', () => {
    expect(voieDeLaZone(paires, 10)).toBe('left');
    expect(voieDeLaZone(paires, 13)).toBe('right');
  });

  it('rend null hors paire, et sur une zone sans identifiant', () => {
    expect(voieDeLaZone(paires, 99)).toBeNull();
    expect(voieDeLaZone(paires, null)).toBeNull();
    // Sans cette garde, une zone non enregistrée (`id` nul) tomberait sur une
    // moitié de paire dont l'identifiant est nul et se dirait « voie gauche ».
    expect(voieDeLaZone([{ left_zone: { id: null }, right_zone: null }], null)).toBeNull();
  });
});
