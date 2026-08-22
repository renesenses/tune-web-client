import { describe, it, expect } from 'vitest';
import { choixDepuisBande, canalDepuisChoix } from './eqChannel';

describe('choixDepuisBande', () => {
  it('nomme les deux canaux', () => {
    expect(choixDepuisBande(0)).toBe('0');
    expect(choixDepuisBande(1)).toBe('1');
  });

  it("un champ absent, c'est « les deux »", () => {
    // Le cas de tous les préréglages enregistrés avant cette version.
    expect(choixDepuisBande(undefined)).toBe('both');
    expect(choixDepuisBande(null)).toBe('both');
  });

  it("un canal inconnu ne fait taire personne", () => {
    // Mieux vaut appliquer aux deux que de retirer la bande d'un côté sur la
    // foi d'une valeur qu'on ne sait pas interpréter.
    expect(choixDepuisBande(7)).toBe('both');
    expect(choixDepuisBande(-1)).toBe('both');
  });
});

describe('canalDepuisChoix', () => {
  it('rend un nombre pour un canal nommé', () => {
    expect(canalDepuisChoix('0')).toBe(0);
    expect(canalDepuisChoix('1')).toBe(1);
  });

  it("« les deux » rend `undefined`, pas `null` ni `-1`", () => {
    expect(canalDepuisChoix('both')).toBeUndefined();
  });

  it("et `undefined` DISPARAÎT de la charge utile", () => {
    // C'est tout l'enjeu : le serveur lit `Option<u16>` et traite l'absence
    // comme « tous les canaux ». `null` serait sérialisé et présent.
    const bande = { freq: 1000, gain: 3, q: 1, channel: canalDepuisChoix('both') };
    expect(JSON.stringify(bande)).not.toContain('channel');

    const gauche = { freq: 1000, gain: 3, q: 1, channel: canalDepuisChoix('0') };
    expect(JSON.stringify(gauche)).toContain('"channel":0');
  });
});

describe('aller-retour', () => {
  it("ne perd ni n'invente rien", () => {
    for (const c of [undefined, 0, 1]) {
      expect(canalDepuisChoix(choixDepuisBande(c))).toBe(c);
    }
  });

  it("ramène un canal inconnu à « les deux », une fois pour toutes", () => {
    // Deuxième passage stable : pas d'oscillation entre deux valeurs.
    const une = canalDepuisChoix(choixDepuisBande(7));
    expect(une).toBeUndefined();
    expect(canalDepuisChoix(choixDepuisBande(une))).toBeUndefined();
  });
});
