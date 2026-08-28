import { describe, it, expect } from 'vitest';
import { resolveKioskZone } from './kioskZone';

// Mode kiosque : la zone doit être désignable dans l'URL
// (renesenses/tune-server-rust#2274). Jusqu'ici le client web ne lisait que
// les drapeaux `kiosk` et `mini` ; la zone d'un écran kiosque venait du seul
// réglage global, donc deux écrans muraux ne pouvaient pas afficher deux
// zones différentes.
//
// Ces tests verrouillent les trois cas qui comptent — et surtout le premier,
// qui est le contrat existant : une URL kiosque SANS paramètre de zone doit
// continuer à se comporter exactement comme avant.

const ZONES = [
  { id: 1, name: 'Salon' },
  { id: 2, name: 'Cuisine' },
  { id: 7, name: 'Chambre' },
];

describe('resolveKioskZone', () => {
  describe('sans paramètre de zone — le contrat existant ne bouge pas', () => {
    it('rend « global » sur une URL kiosque nue', () => {
      expect(resolveKioskZone('?kiosk', ZONES)).toEqual({ kind: 'global' });
    });

    it('rend « global » sur ?kiosk=true, la forme documentée aujourd’hui', () => {
      // `?kiosk=true` est la forme citée dans le code depuis l'origine : sa
      // valeur n'est PAS un numéro de zone et ne doit jamais être lue comme
      // telle, sinon toutes les URLs existantes basculeraient en « zone
      // inconnue ».
      expect(resolveKioskZone('?kiosk=true', ZONES)).toEqual({ kind: 'global' });
    });

    it('rend « global » quand le paramètre zone est vide', () => {
      expect(resolveKioskZone('?kiosk&zone=', ZONES)).toEqual({ kind: 'global' });
    });

    it('rend « global » sur une chaîne de requête vide', () => {
      expect(resolveKioskZone('', ZONES)).toEqual({ kind: 'global' });
    });
  });

  describe('avec une zone valide — l’URL prend le pas', () => {
    it('épingle la zone demandée par ?kiosk&zone=<id>', () => {
      expect(resolveKioskZone('?kiosk&zone=2', ZONES)).toEqual({ kind: 'pinned', zoneId: 2 });
    });

    it('épingle aussi via le raccourci ?kiosk=<id>', () => {
      expect(resolveKioskZone('?kiosk=7', ZONES)).toEqual({ kind: 'pinned', zoneId: 7 });
    });

    it('donne la priorité à zone= sur la valeur de kiosk=', () => {
      expect(resolveKioskZone('?kiosk=1&zone=7', ZONES)).toEqual({ kind: 'pinned', zoneId: 7 });
    });

    it('accepte la chaîne de requête avec ou sans « ? » de tête', () => {
      expect(resolveKioskZone('kiosk&zone=1', ZONES)).toEqual({ kind: 'pinned', zoneId: 1 });
    });
  });

  describe('avec une zone inconnue ou invalide — repli explicite', () => {
    it('signale une zone absente de la liste sans l’épingler', () => {
      // Le danger à écarter : `currentZoneId` posé à 99 ferait retomber le
      // store dérivé sur `zones[0]`, et l'écran piloterait le Salon en
      // croyant piloter la zone 99. On refuse d'épingler et on le dit.
      expect(resolveKioskZone('?kiosk&zone=99', ZONES)).toEqual({ kind: 'unknown', requested: '99' });
    });

    it('signale une valeur non numérique', () => {
      expect(resolveKioskZone('?kiosk&zone=salon', ZONES)).toEqual({ kind: 'unknown', requested: 'salon' });
    });

    it('signale une valeur négative', () => {
      expect(resolveKioskZone('?kiosk&zone=-1', ZONES)).toEqual({ kind: 'unknown', requested: '-1' });
    });

    it('ne plante pas sur une liste de zones vide', () => {
      expect(() => resolveKioskZone('?kiosk&zone=2', [])).not.toThrow();
      expect(resolveKioskZone('?kiosk&zone=2', [])).toEqual({ kind: 'unknown', requested: '2' });
    });

    it('ne plante pas sur une zone sans identifiant', () => {
      const orphelines = [{ id: null, name: 'orpheline' }];
      expect(resolveKioskZone('?kiosk&zone=2', orphelines)).toEqual({
        kind: 'unknown',
        requested: '2',
      });
    });
  });
});
