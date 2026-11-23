// @vitest-environment jsdom
//
// web#3275 — LA REPRISE DU DÉFILEMENT S'ARRÊTE QUAND ON L'ARRÊTE.
//
// CI de `main` rouge le 19/11 : toute la suite passait, mais une passe de
// `restaurerDefilements` lancée par un Précédent de `flechesNavigation3275`
// tournait encore après la fin du fichier, et son arrêt appelait
// `removeEventListener` sur une fenêtre jsdom déjà démontée (« Uncaught
// Exception », sortie en code 1). Annuler la reprise ne faisait que lever un
// jeton : les écouteurs de gestes restaient posés et la passe suivante
// touchait encore la fenêtre. Débrancher la coquille ne l'annulait pas du tout.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { brancherHistoriqueCoquille } from '../historiqueCoquille';
import {
  _poserRacine,
  _reinitialiserMemoire,
  annulerRestaurationDefilement,
  restaurerDefilements,
  retenirEntree,
  suivreLesDefilements,
} from '../memoireNavigation';

/** Une fenêtre qui compte ses écouteurs, et qui peut « partir » (démontage de l'environnement). */
function fausseFenetre() {
  const poses = new Set<string>();
  let partie = false;
  return {
    poses,
    partir: () => { partie = true; },
    addEventListener: (type: string) => {
      if (partie) throw new TypeError('fenêtre démontée');
      poses.add(type);
    },
    removeEventListener: (type: string) => {
      if (partie) throw new TypeError('fenêtre démontée');
      poses.delete(type);
    },
  };
}

let racine: HTMLElement;
let liste: HTMLElement;
let arretSuivi: () => void;
const sh = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');

beforeEach(() => {
  _reinitialiserMemoire();
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 9000 });
  arretSuivi = suivreLesDefilements();
  racine = document.createElement('main');
  document.body.appendChild(racine);
  _poserRacine(() => racine);
  liste = document.createElement('div');
  liste.className = 'pistes';
  racine.appendChild(liste);
  liste.scrollTop = 900;
  liste.dispatchEvent(new Event('scroll'));
  retenirEntree('e1', 'library');
  liste.scrollTop = 0;
});

afterEach(() => {
  arretSuivi();
  _reinitialiserMemoire();
  if (sh) Object.defineProperty(Element.prototype, 'scrollHeight', sh);
  document.body.innerHTML = '';
});

describe('web#3275 — une reprise annulée ne touche plus la fenêtre', () => {
  it('annuler retire les écouteurs de gestes TOUT DE SUITE, et la passe restante ne touche à rien', () => {
    const fenetre = fausseFenetre();
    const taches: Array<() => void> = [];
    restaurerDefilements('e1', { fenetre, programmer: (cb) => { taches.push(cb); } });
    expect(fenetre.poses.size, 'la reprise écoute les gestes de l’utilisateur').toBe(4);

    annulerRestaurationDefilement();
    expect(fenetre.poses.size, 'annulée : plus aucun écouteur posé').toBe(0);

    fenetre.partir();
    expect(() => { while (taches.length) taches.shift()!(); }, 'la passe restante ne touche plus la fenêtre').not.toThrow();
    expect(liste.scrollTop).toBe(0);
  });

  it('une nouvelle reprise arrête la précédente (pas d’écouteurs orphelins)', () => {
    const premiere = fausseFenetre();
    const seconde = fausseFenetre();
    restaurerDefilements('e1', { fenetre: premiere, programmer: () => {} });
    restaurerDefilements('e1', { fenetre: seconde, programmer: () => {} });
    expect(premiere.poses.size).toBe(0);
    expect(seconde.poses.size).toBe(4);
    annulerRestaurationDefilement();
    expect(seconde.poses.size).toBe(0);
  });

  it('débrancher la coquille arrête la reprise qu’un Précédent avait lancée', async () => {
    // La minuterie PAR DÉFAUT (setTimeout), comme au `popstate` de la coquille.
    const fenetre = fausseFenetre();
    restaurerDefilements('e1', { fenetre });
    brancherHistoriqueCoquille({ fenetre: window })();
    expect(fenetre.poses.size, 'coquille débranchée : écouteurs retirés').toBe(0);
    fenetre.partir();
    await new Promise((r) => setTimeout(r, 120));
    expect(liste.scrollTop, 'aucune passe n’a tourné après le débranchement').toBe(0);
  });
});
