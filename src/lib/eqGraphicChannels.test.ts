import { describe, it, expect } from 'vitest';
import {
  bandesGraphiques,
  courbesDepuisBandes,
  delier,
  CANAL_GAUCHE,
  CANAL_DROITE,
} from './eqGraphicChannels';

const GRILLE = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const Q = 1.0;

describe('bandesGraphiques', () => {
  it("liées : une seule passe, et AUCUN champ channel", () => {
    const g = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bandes = bandesGraphiques(GRILLE, g, null, Q);

    expect(bandes).toHaveLength(GRILLE.length);
    // Le point qui compte : le serveur lit l'absence du champ comme « les deux ».
    // `channel: -1` ou `channel: null` ferait taire un canal.
    for (const b of bandes) {
      expect('channel' in b).toBe(false);
    }
    expect(bandes.map((b) => b.gain)).toEqual(g);
  });

  it('déliées : la grille deux fois, gauche puis droite', () => {
    const g = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const d = [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10];
    const bandes = bandesGraphiques(GRILLE, g, d, Q);

    expect(bandes).toHaveLength(GRILLE.length * 2);
    const gauche = bandes.filter((b) => b.channel === CANAL_GAUCHE);
    const droite = bandes.filter((b) => b.channel === CANAL_DROITE);
    expect(gauche.map((b) => b.gain)).toEqual(g);
    expect(droite.map((b) => b.gain)).toEqual(d);
    // Même grille des deux côtés : c'est ce qui fait que les deux courbes se
    // superposent point à point à l'écran.
    expect(gauche.map((b) => b.freq)).toEqual(GRILLE);
    expect(droite.map((b) => b.freq)).toEqual(GRILLE);
  });

  it('déliées mais identiques : on envoie quand même deux passes', () => {
    // Ne PAS optimiser en repliant sur une passe : l'utilisateur a demandé des
    // courbes séparées, il va en bouger une. Replier ici ferait réapparaître le
    // champ absent au prochain enregistrement, donc changerait le préréglage.
    const g = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const bandes = bandesGraphiques(GRILLE, g, [...g], Q);
    expect(bandes).toHaveLength(GRILLE.length * 2);
  });

  it('une courbe trop courte ne troue pas la grille', () => {
    const bandes = bandesGraphiques(GRILLE, [3, 3], null, Q);
    expect(bandes).toHaveLength(GRILLE.length);
    expect(bandes.map((b) => b.gain)).toEqual([3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('courbesDepuisBandes', () => {
  it("un préréglage d'avant cette version se relit lié", () => {
    const bandes = GRILLE.map((freq, i) => ({ freq, gain: i, q: Q }));
    const { gauche, droite } = courbesDepuisBandes(bandes, GRILLE.length);

    // `droite === null` = lié : le réenregistrer ne lui fera pas gagner de canal.
    expect(droite).toBeNull();
    expect(gauche).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('deux passes se relisent en deux courbes', () => {
    const g = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const d = [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10];
    const { gauche, droite } = courbesDepuisBandes(
      bandesGraphiques(GRILLE, g, d, Q),
      GRILLE.length,
    );
    expect(gauche).toEqual(g);
    expect(droite).toEqual(d);
  });

  it("l'aller-retour ne perd rien", () => {
    const g = [2, -4, 0, 6, -1, 3, 0, 0, 5, -5];
    const d = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
    const relu = courbesDepuisBandes(bandesGraphiques(GRILLE, g, d, Q), GRILLE.length);
    expect(relu.gauche).toEqual(g);
    expect(relu.droite).toEqual(d);

    const lie = courbesDepuisBandes(bandesGraphiques(GRILLE, g, null, Q), GRILLE.length);
    expect(lie.gauche).toEqual(g);
    expect(lie.droite).toBeNull();
  });
});

describe('delier', () => {
  it('délier ne change rien à ce qu’on entend', () => {
    const g = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(delier(g)).toEqual(g);
  });

  it('la copie est indépendante', () => {
    // Sans copie, bouger un curseur à droite bougerait aussi la gauche — le
    // défaut serait invisible tant qu'on ne compare pas les deux courbes.
    const g = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const d = delier(g);
    d[0] = 99;
    expect(g[0]).toBe(1);
  });
});
