/**
 * #1327 — « la zone permettant le défilement vers le bas est très étroite »
 * (Gros Bidon / Didier, fil 1858, 20/09/2026, écran Streaming Qobuz).
 *
 * Le geste de #1137 a été livré le 19/09 et signalé le 20 : une rangée AU
 * MILIEU de sa course — c'est-à-dire presque toujours — prenait la molette
 * verticale, et la page ne défilait plus sous le pointeur. La garde écrite ne
 * couvrait que le bout de course, donc le cas RARE.
 *
 * 🔴 Ces témoins jugent la règle, pas le texte : ils appellent
 * `deplacementMolette` avec l'entourage que l'action lui donne réellement.
 * Sur le code d'avant le correctif, le troisième argument est ignoré et
 * chacun d'eux rend le déplacement au lieu de `0`.
 */
import { describe, it, expect } from 'vitest';
import {
  deplacementMolette,
  pagePeutDefiler,
  VERROU_VERTICAL_MS,
} from '../defilementHorizontal';

/** Une rangée mesurée : 1 000 px de contenu dans 400 px de fenêtre. */
const rangee = (scrollLeft: number) => ({ scrollLeft, scrollWidth: 1000, clientWidth: 400 });

/** L'entourage : la page défile ou non, et depuis quand elle a la main. */
const entourage = (pageDefile: boolean, dernierVertical = 0, maintenant = 100_000) =>
  ({ pageDefile, dernierVertical, maintenant });

describe('#1327 — la page passe d’abord', () => {
  it('🔴 une rangée AU MILIEU de sa course laisse la page défiler', () => {
    // Le défaut exact du ticket : Didier survole « Albums favoris », tourne la
    // molette vers le bas, et c'est la rangée qui part vers la gauche.
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120 }, entourage(true))).toBe(0);
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: -120 }, entourage(true))).toBe(0);
  });

  it('elle la reprend là où il n’y a RIEN à confisquer', () => {
    // Page qui tient tout entière à l'écran, ou déjà en butée dans ce sens :
    // la molette verticale ne servirait à personne d'autre.
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120 }, entourage(false))).toBe(120);
  });

  it('`Maj` + molette la lui rend en toutes circonstances', () => {
    // L'idiome universel du défilement horizontal : il passe avant les verrous,
    // sinon la demande de #1137 n'aurait plus aucun chemin à la souris.
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120, shiftKey: true }, entourage(true)))
      .toBe(120);
    // …mais il ne fait pas franchir le bord : la règle d'en-tête tient.
    expect(deplacementMolette(rangee(600), { deltaX: 0, deltaY: 120, shiftKey: true }, entourage(false)))
      .toBe(0);
  });
});

describe('#1327 — un geste vertical EN COURS ne se vole pas', () => {
  it('🔴 la rangée qui passe sous le pointeur pendant l’inertie laisse passer', () => {
    // Point 4 de Didier : « si on arrive à lancer un défilement vers le bas et
    // que la souris tombe sur une zone des sous-titres, ce sont ces derniers
    // qui PARFOIS se déplacent ». Le « parfois », c'est la rangée déjà en
    // butée qui relâchait l'événement par accident.
    const t = 100_000;
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120 },
      entourage(false, t - VERROU_VERTICAL_MS + 20, t))).toBe(0);
  });

  it('le verrou s’éteint quand le geste s’arrête', () => {
    const t = 100_000;
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120 },
      entourage(false, t - VERROU_VERTICAL_MS - 1, t))).toBe(120);
  });

  it('aucun verrou n’est armé au premier geste', () => {
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120 }, entourage(false, 0, 100_000)))
      .toBe(120);
  });
});

describe('#1327 — ce que la page peut encore faire', () => {
  /** Un ancêtre : ce qu'il mesure, et où il en est. */
  const aieul = (scrollTop: number, scrollHeight: number, clientHeight: number, parentElement: any = null) =>
    ({ scrollTop, scrollHeight, clientHeight, parentElement });

  it('un ancêtre qui déborde et qui peut avancer compte', () => {
    expect(pagePeutDefiler({ parentElement: aieul(0, 3000, 800) } as any, 120)).toBe(true);
    expect(pagePeutDefiler({ parentElement: aieul(2200, 3000, 800) } as any, 120)).toBe(false);
    expect(pagePeutDefiler({ parentElement: aieul(2200, 3000, 800) } as any, -120)).toBe(true);
  });

  it('on remonte toute la lignée, pas seulement le parent', () => {
    // `.bande` est dans `.bloc`, lui-même dans `.scroll` : le seul défileur du
    // contenu est deux étages plus haut.
    const scroll = aieul(0, 3000, 800);
    const bloc = aieul(0, 300, 300, scroll);
    expect(pagePeutDefiler({ parentElement: bloc } as any, 120)).toBe(true);
  });

  it('un ancêtre qui ne déborde que d’un sous-pixel ne défile pas', () => {
    expect(pagePeutDefiler({ parentElement: aieul(0, 800.5, 800) } as any, 120)).toBe(false);
  });

  it('sans aucun ancêtre, rien ne défile', () => {
    expect(pagePeutDefiler({ parentElement: null } as any, 120)).toBe(false);
  });
});
