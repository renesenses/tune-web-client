import { describe, it, expect } from 'vitest';
import {
  choixDepuisBande,
  canalDepuisChoix,
  bandesDuCanal,
  reglageAsymetrique,
} from './eqChannel';
import type { EqBand } from './api';

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

describe('bandesDuCanal', () => {
  // Annotées `EqBand` : c'est le type réel, et sans annotation une bande sans
  // `channel` ne partagerait aucune propriété avec la contrainte — TypeScript
  // refuse alors l'appel (détection des « types faibles »).
  const grave: EqBand = { freq: 60, gain: 4, q: 1, channel: 0 };
  const aigu: EqBand = { freq: 8000, gain: -2, q: 1, channel: 1 };
  const commune: EqBand = { freq: 1000, gain: 1, q: 1 };

  it('rend les bandes du canal ET celles qui ne visent personne', () => {
    const bandes = [grave, aigu, commune];
    expect(bandesDuCanal(bandes, 0)).toEqual([grave, commune]);
    expect(bandesDuCanal(bandes, 1)).toEqual([aigu, commune]);
  });

  it("le cas de Daniel Jan : +4 dB à gauche n'apparaît QUE à gauche", () => {
    // Le défaut d'origine : la courbe sommait tout, et montrait +4 dB sur un
    // graphe unique qui ne décrivait ni la gauche ni la droite.
    const bandes = [grave];
    expect(bandesDuCanal(bandes, 0)).toHaveLength(1);
    expect(bandesDuCanal(bandes, 1)).toHaveLength(0);
  });

  it('un réglage symétrique donne deux fois la même chose', () => {
    // `channel: null` ne peut pas venir d'`EqBand` — mais peut arriver d'un
    // préréglage sérialisé ailleurs, et l'aide doit le traiter comme absent.
    const bandes: { freq: number; gain: number; q: number; channel?: number | null }[] = [
      commune,
      { freq: 100, gain: 3, q: 1, channel: null },
    ];
    expect(bandesDuCanal(bandes, 0)).toEqual(bandes);
    expect(bandesDuCanal(bandes, 1)).toEqual(bandes);
  });

  it("un canal inconnu ne disparaît d'aucune courbe", () => {
    // Même repli que le sélecteur : mieux vaut le montrer deux fois que nulle
    // part. Une bande absente des deux courbes serait invisible à l'écran.
    const bizarre: EqBand = { freq: 500, gain: 2, q: 1, channel: 7 };
    expect(bandesDuCanal([bizarre], 0)).toEqual([bizarre]);
    expect(bandesDuCanal([bizarre], 1)).toEqual([bizarre]);
  });

  it("ne touche pas au tableau qu'on lui donne", () => {
    const bandes = [grave, commune];
    bandesDuCanal(bandes, 1);
    expect(bandes).toEqual([grave, commune]);
  });

  it('une liste vide rend une liste vide, pas une erreur', () => {
    expect(bandesDuCanal([], 0)).toEqual([]);
  });
});

describe('reglageAsymetrique', () => {
  it('faux quand aucune bande ne vise un canal', () => {
    expect(reglageAsymetrique([])).toBe(false);
    expect(reglageAsymetrique([{ channel: undefined }, { channel: null }])).toBe(false);
  });

  it('vrai dès UNE bande visant un canal', () => {
    expect(reglageAsymetrique([{ channel: undefined }, { channel: 1 }])).toBe(true);
  });

  it("un canal inconnu ne rend pas le réglage asymétrique", () => {
    // Il s'applique aux deux : les courbes se superposent, donc pas de légende.
    expect(reglageAsymetrique([{ channel: 7 }])).toBe(false);
  });

  it("d'accord avec bandesDuCanal : symétrique ⇔ mêmes bandes des deux côtés", () => {
    const jeux = [
      [{ channel: undefined }],
      [{ channel: 0 }],
      [{ channel: 7 }],
      [{ channel: undefined }, { channel: 1 }],
    ];
    for (const bandes of jeux) {
      const memes =
        JSON.stringify(bandesDuCanal(bandes, 0)) === JSON.stringify(bandesDuCanal(bandes, 1));
      expect(reglageAsymetrique(bandes)).toBe(!memes);
    }
  });
});
