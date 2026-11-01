// @vitest-environment jsdom
// rc10 — le serveur renomme la zone par défaut « Cet ordinateur » en
// « Ce navigateur » (#3067) ; un onglet sans clé localStorage doit la jouer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { estZoneJouableIci } from '../zoneNavigateurProprietaire';

const CLE = 'tune.zonesNavigateurDeCetAppareil';
const zone = (name: string, id = 7) => ({ id, name, output_type: 'browser' });

describe('zone « Ce navigateur » jouable ici', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it.each(['Ce navigateur', 'This browser', ' ce navigateur ', 'THIS BROWSER', 'Ce navigateur (192.168.1.20)'])(
    'sans clé localStorage, « %s » est jouable', (nom) => {
      expect(estZoneJouableIci(zone(nom))).toBe(true);
    });

  it.each(['Cet ordinateur', 'This computer'])('anciens noms toujours jouables : %s', (nom) => {
    expect(estZoneJouableIci(zone(nom))).toBe(true);
  });

  it('avec une clé qui ne contient pas son id, elle reste non jouable', () => {
    localStorage.setItem(CLE, JSON.stringify([3]));
    expect(estZoneJouableIci(zone('Ce navigateur', 7))).toBe(false);
    expect(estZoneJouableIci(zone('This browser', 7))).toBe(false);
  });

  it('avec une clé qui contient son id, elle est jouable', () => {
    localStorage.setItem(CLE, JSON.stringify([7]));
    expect(estZoneJouableIci(zone('Ce navigateur', 7))).toBe(true);
  });

  it("un nom quelconque sans clé n'est pas jouable", () => {
    expect(estZoneJouableIci(zone('Safari'))).toBe(false);
  });
});
