/**
 * LA BARRE DE LECTURE À VU-MÈTRES — Bertrand, 27/09/2026, maquette de Levente.
 *
 * « Une seconde transport bar via toggle réglages qui affiche les vu-mètres à
 * gauche et droite ». Trois arbitrages du même jour, et chacun a sa garde ici :
 * les cadrans REMPLACENT les lampes de crête et le mini-spectre ; sur une
 * barre étroite on RETOMBE sur la barre normale ; le réglage est un
 * interrupteur à PART, et non une cinquième valeur du crête-mètre.
 *
 * ## Le piège principal : deux aiguilles
 *
 * 🔴 Le cadran existait déjà, dans le mode Grand écran. Le recopier dans la
 * barre aurait donné deux balistiques, deux zones rouges et deux témoins de
 * crête, qui auraient divergé au premier réglage — et personne n'aurait su
 * laquelle des deux avait raison. Les deux surfaces appellent donc la même
 * fonction, et c'est ce que mesure la deuxième série ci-dessous.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RATIO_VU,
  RAYON_VU,
  SEUIL_VU_PX,
  TAILLE_VU_BARRE,
  vuMetresVisibles,
} from '../barreVuMetres';
import {
  BAS_FACE,
  HAUT_FACE,
  PALETTE_SOMBRE,
  paletteVuDepuis,
  MAINTIEN_CRETE_MS,
  MONTEE,
  RETOMBEE,
  SPAN,
  avancerAiguille,
  cadreCadran,
  dbToAngle,
} from '../dessinVuMetre';
import { MIN_DB, MAX_DB } from '../tvVuScale';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const BARRE = 'src/components/partages/TransportBar.svelte';
const CADRAN = 'src/components/partages/VuMetreCanal.svelte';
const GRAND_ECRAN = 'src/components/v2-heritage/TvVuMeters.svelte';

describe('quand la barre montre ses cadrans', () => {
  it('jamais sans le réglage, si large soit la barre', () => {
    expect(vuMetresVisibles(false, 3840)).toBe(false);
    expect(vuMetresVisibles(undefined, 3840)).toBe(false);
  });

  it('jamais AVANT la première mesure de largeur', () => {
    // 🔴 `0` est la valeur d'avant la mesure, pas une barre de zéro pixel.
    // Les montrer puis les retirer à la première image donnerait un sursaut de
    // mise en page à chaque montage.
    expect(vuMetresVisibles(true, 0)).toBe(false);
  });

  it('retombe sur la barre normale en dessous du seuil', () => {
    // Arbitrage de Bertrand, choisi parmi trois : ni cadrans rétrécis (une
    // aiguille et ses graduations cessent de se lire), ni cadran unique (on
    // garderait l'instrument en perdant la stéréo, qui en est le sujet).
    expect(vuMetresVisibles(true, SEUIL_VU_PX - 1)).toBe(false);
    expect(vuMetresVisibles(true, SEUIL_VU_PX)).toBe(true);
    expect(vuMetresVisibles(true, SEUIL_VU_PX + 400)).toBe(true);
  });

  it('mesure la largeur de LA BARRE, jamais celle de la fenêtre', () => {
    // La colonne latérale prend ~280 px : à fenêtre large, la barre peut être
    // étroite. Se tromper de mesure rétablirait les cadrans précisément là où
    // il n'y a pas la place.
    const src = sansCommentaires(lire(BARRE));
    expect(src).toContain('new ResizeObserver(');
    expect(src).toContain('largeurBarre = el.clientWidth');
    expect(src).toContain('vuMetresVisibles($preferences.barreVuMetres, largeurBarre)');
  });

  it('ne tombe pas là où `ResizeObserver` n’existe pas', () => {
    // 🔴 `bind:clientWidth` en instancie un SANS CONDITION : soixante-sept
    // bancs qui montent la coquille sont tombés d'un coup sur
    // « ResizeObserver is not defined », dont aucun ne parlait de cette barre.
    // Sous la garde, la largeur reste à 0 — donc la barre d'avant.
    const src = sansCommentaires(lire(BARRE));
    expect(src).toContain("typeof ResizeObserver === 'undefined'");
    expect(vuMetresVisibles(true, 0)).toBe(false);
  });

  it('est DÉCOCHÉ par défaut', () => {
    // « L'écran de qui n'a rien demandé ne bouge pas d'un pixel » (#1428).
    expect(sansCommentaires(lire('src/lib/stores/preferences.ts')))
      .toContain('barreVuMetres: false,');
  });
});

describe('ce que les cadrans remplacent', () => {
  const src = sansCommentaires(lire(BARRE));

  it('éteint les lampes de crête et le mini-spectre', () => {
    // Trois instruments de niveau dans une même barre se concurrencent, et la
    // place manque de toute façon.
    expect(src).toContain("{#if !vuActif && styleSurLaBarre(");
    expect(src).toContain('{#if !vuActif}');
  });

  it('pose un cadran par canal, de part et d’autre des commandes', () => {
    const gauche = src.indexOf('<VuMetreCanal canal="gauche"');
    const commandes = src.indexOf('class="transport-controls"');
    const droite = src.indexOf('<VuMetreCanal canal="droite"');
    expect(gauche).toBeGreaterThan(-1);
    expect(gauche).toBeLessThan(commandes);
    expect(droite).toBeGreaterThan(commandes);
  });

  it('ne change RIEN à la barre tant qu’ils sont éteints', () => {
    // 🔴 `display: contents` : la pile ajoutée pour loger le cadran droit est
    // transparente à la mise en page. Sans cela, la barre de tout le monde
    // gagnerait un nœud de disposition pour un réglage que personne n'a
    // coché.
    expect(src).toContain('.tb-pile { display: contents; }');
    expect(src).toContain('.transport-bar.vu .tb-pile');
  });
});

describe('UN seul cadran pour les deux surfaces', () => {
  const barre = lire(CADRAN);
  const grandEcran = lire(GRAND_ECRAN);

  it('la barre et le Grand écran appellent le même dessin', () => {
    expect(barre).toContain("from '../../lib/dessinVuMetre'");
    expect(grandEcran).toContain("from '../../lib/dessinVuMetre'");
    expect(barre).toContain('dessinerCadran(');
    expect(grandEcran).toContain('dessinerCadran(');
  });

  it('aucun des deux ne redessine un cadran chez lui', () => {
    // `createLinearGradient` est la première ligne de la face : si elle
    // reparaît dans un composant, c'est qu'une copie est revenue.
    for (const [nom, src] of [['barre', barre], ['grand écran', grandEcran]] as const) {
      expect(src, `${nom} : le dessin appartient à lib/dessinVuMetre`)
        .not.toContain('createLinearGradient');
    }
  });

  it('la balistique est commune : montée rapide, retombée douce', () => {
    expect(MONTEE).toBeGreaterThan(RETOMBEE);
    // À distance égale — trente décibels dans les deux sens — l'aiguille qui
    // monte parcourt plus de chemin en une image que celle qui retombe. C'est
    // ce qui fait lire un VU plutôt qu'un crête-mètre.
    const monte = Math.abs(avancerAiguille(-40, -10) - -40);
    const retombe = Math.abs(avancerAiguille(-10, -40) - -10);
    expect(monte).toBeGreaterThan(retombe);
  });

  it('le mouvement réduit saute directement à la cible', () => {
    expect(avancerAiguille(-40, -6, true)).toBe(-6);
  });

  it('le témoin de crête dure un TEMPS, pas un nombre d’images', () => {
    // 🔴 45 images valaient 750 ms à 60 Hz, 375 ms à 120 Hz, et 1,5 s si la
    // cadence de dessin est réglée sur 30 i/s (#1256). Un témoin dont la durée
    // dépend de l'écran n'est pas un témoin.
    expect(MAINTIEN_CRETE_MS).toBe(750);
    expect(sansCommentaires(grandEcran)).toContain('MAINTIEN_CRETE_MS');
    // `peakHold` était le compteur d'images. Son nom ne doit pas revenir.
    expect(sansCommentaires(grandEcran)).not.toContain('peakHold');
  });

  it('garde l’échelle du Grand écran, celle qui a été recalée trois fois', () => {
    // #323, #370, #439 : deux calages successifs ont collé les aiguilles en
    // butée. L'angle reste tiré de `tvVuScale`, et rien n'en est recopié.
    expect(dbToAngle(MIN_DB)).toBeCloseTo(-SPAN / 2, 10);
    expect(dbToAngle(MAX_DB)).toBeCloseTo(SPAN / 2, 10);
    expect(lire('src/lib/dessinVuMetre.ts')).toContain("from './tvVuScale'");
  });
});

describe('la géométrie du cadran de la barre', () => {
  it('garde le rayon du Grand écran', () => {
    // Là-bas, deux cadrans partagent une toile large de `w`, chacun d'un rayon
    // de `0,42 · w/2`. Un cadran seul dans une toile large de `t` est le même
    // dessin avec `t = w/2`.
    expect(RAYON_VU).toBeCloseTo(0.42, 10);
    expect(TAILLE_VU_BARRE).toBe(84);
  });

  it('🔴 CONTIENT LA FACE ENTIÈRE — le défaut vu par Bertrand sur le .18', () => {
    // « Vumètres mal centrés… en hauteur ! » (27/09/2026). La face monte à
    // 0,92 rayon AU-DESSUS du centre du cadran ; le centre était posé à 42 %
    // de la hauteur, donc le haut passait au-dessus du bord de la toile et il
    // restait du vide en bas.
    const cote = TAILLE_VU_BARRE;
    const rayon = cote * RAYON_VU;
    const hauteur = cote * RATIO_VU;
    const { cy } = cadreCadran(rayon);

    expect(cy - HAUT_FACE * rayon, 'le haut de la face est coupé').toBeGreaterThanOrEqual(0);
    expect(cy + BAS_FACE * rayon, 'le bas de la face déborde').toBeLessThanOrEqual(hauteur);
    // Et pas de vide inutile : la toile épouse la face au pixel près.
    expect(hauteur).toBeCloseTo((HAUT_FACE + BAS_FACE) * rayon, 10);
  });

  it('CONTRE-ÉPREUVE : l’ancien cadrage coupait bien le haut', () => {
    // Le témoin du défaut, pour qu'on ne puisse pas le réintroduire en
    // croyant « simplifier » : 0,68 de côté et le centre à 42 % de la hauteur
    // — les deux cotes recopiées du Grand écran — laissent la face hors cadre.
    const rayon = TAILLE_VU_BARRE * RAYON_VU;
    const ancienneHauteur = TAILLE_VU_BARRE * 0.68;
    const ancienCy = ancienneHauteur * 0.42;
    expect(ancienCy - HAUT_FACE * rayon).toBeLessThan(0);
  });

  it('la hauteur se DÉDUIT de la face, elle n’est pas recopiée', () => {
    expect(RATIO_VU).toBeCloseTo((HAUT_FACE + BAS_FACE) * RAYON_VU, 10);
    expect(sansCommentaires(lire('src/lib/barreVuMetres.ts')))
      .toContain('(HAUT_FACE + BAS_FACE) * RAYON_VU');
  });

  it('le cadran n’a plus AUCUN pixel absolu', () => {
    // Graduations, chiffres et polices étaient posés en pixels absolus
    // (`arcR + 13`, `9px`) : justes vers r ≈ 118, absurdes vers r ≈ 35, où les
    // chiffres sortaient de la face. Tout est désormais multiplié par `u`, la
    // taille du cadran rapportée à son rayon nominal.
    const src = sansCommentaires(lire('src/lib/dessinVuMetre.ts'));
    expect(src).toContain('const u = rayon / 117.6');
    expect(src, 'un `* dpr` a survécu').not.toMatch(/\*\s*dpr/);
  });

  it('les textes gardent un plancher de lisibilité', () => {
    // Proportionnels comme le reste, mais à 2,7 px un chiffre n'est plus un
    // chiffre. Le plancher ne mord que sur les petits cadrans : au rayon
    // nominal, les trois polices valent exactement 9, 11 et 12.
    const src = sansCommentaires(lire('src/lib/dessinVuMetre.ts'));
    expect(src).toContain('Math.max(MIN_TICK, 9 * u)');
    expect(src).toContain('Math.max(MIN_TEXTE_DB, 11 * u)');
    expect(src).toContain('Math.max(MIN_CANAL, 12 * u)');
  });

  it('dessine en pixels CSS : les traits ne sont pas épaissis deux fois', () => {
    // La toile est mise à l'échelle par `setTransform(dpr, …)` : le dessin
    // travaille en pixels CSS. C'est pourquoi `dessinerCadran` ne prend plus
    // de `dpr` — il tire tout du rayon.
    const src = sansCommentaires(lire(CADRAN));
    expect(src).toContain('ctx.setTransform(dpr, 0, 0, dpr, 0, 0)');
    expect(src).not.toContain('dpr: 1,');
  });

  it('les DEUX surfaces posent leur cadran par le même cadre', () => {
    // Le Grand écran avait le même défaut, invisible sur un cadran de 235 px.
    // Deux cadrages différents auraient redonné deux instruments.
    expect(sansCommentaires(lire(CADRAN))).toContain('cadreCadran(');
    expect(sansCommentaires(lire(GRAND_ECRAN))).toContain('cadreCadran(');
    expect(sansCommentaires(lire(GRAND_ECRAN)), 'le cadrage de 42 % est revenu')
      .not.toContain('cy: h * 0.42');
  });

  it('arrête sa boucle au repos, et la passe par la cadence réglée', () => {
    // La barre est TOUJOURS à l'écran : une boucle qui ne s'arrête jamais y
    // redessinerait un cadran immobile trente fois par seconde, en
    // permanence. C'est le défaut mesuré par Levente sur « Lecture en
    // cours » (#1256), qui serait ici sans fin.
    const src = sansCommentaires(lire(CADRAN));
    expect(src).toContain('boucleImages(');
    expect(src).toContain('tempsDeDessiner(maintenant, dernier, cran)');
    expect(src).toContain('auRepos(maintenant)');
  });
});

describe('le réglage', () => {
  const reglages = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));

  it('est un interrupteur à part, pas une cinquième valeur du crête-mètre', () => {
    // Il change la MISE EN PAGE de la barre, là où les quatre styles du
    // crête-mètre ne changent que l'apparence d'un instrument.
    expect(reglages).toContain("$t('v2.set.barVu' as any)");
    expect(reglages).toContain('barreVuMetres: (e.currentTarget as HTMLInputElement).checked');
    const styles = reglages.slice(reglages.indexOf('peakMeterStyle: v'));
    expect(styles).not.toContain('value="vu"');
  });

  it('montre un aperçu vivant, comme le crête-mètre au-dessus', () => {
    // « Cadrans à aiguille » ne dit rien tant qu'on ne les a pas vus bouger.
    expect(reglages).toContain('<VuMetreCanal canal="gauche" taille={64}');
  });
});

describe('le cadran en thème CLAIR', () => {
  const css = lire('src/styles/tune-v2.css');
  const dessin = sansCommentaires(lire('src/lib/dessinVuMetre.ts'));

  it('🔴 ne dessine plus AUCUNE couleur en dur', () => {
    // Bertrand, 27/09/2026 : « vumètres en thème clair ». En clair, le cadran
    // avait purement disparu — face blanche à 5 %, graduations ivoire, bord
    // blanc à 12 %, tout écrit pour un fond noir. Une toile n'hérite d'aucune
    // couleur : il faut aller la lire.
    const corps = dessin.slice(dessin.indexOf('export function dessinerCadran'));
    expect(corps, 'une couleur écrite en dur a survécu dans le dessin')
      .not.toMatch(/'rgba\(|'#[0-9a-fA-F]{6}'/);
  });

  it('laisse la décision au THÈME, pas à un tableau dans le code', () => {
    // Six palettes aujourd'hui, d'autres demain : une correspondance écrite en
    // JavaScript aurait redonné deux endroits où la couleur se décide.
    expect(dessin).toContain("lire('--v2-vu-encre'");
    for (const jeton of ['--v2-vu-face-h', '--v2-vu-bord', '--v2-vu-encre',
                         '--v2-vu-rouge', '--v2-vu-aiguille', '--v2-vu-lueur']) {
      expect(css, `${jeton} n'est pas défini dans le thème de base`).toContain(`${jeton}:`);
    }
  });

  it('les DEUX thèmes clairs redéfinissent la palette entière', () => {
    // Une palette à moitié redéfinie donne un cadran à moitié peint.
    for (const theme of ['clear-white', 'clear-grey']) {
      const i = css.indexOf(`[data-v2-theme="${theme}"]`);
      expect(i, theme).toBeGreaterThan(-1);
      const bloc = css.slice(i, css.indexOf('}', i));
      for (const jeton of ['--v2-vu-face-h', '--v2-vu-face-b', '--v2-vu-bord',
                           '--v2-vu-encre', '--v2-vu-rouge', '--v2-vu-aiguille',
                           '--v2-vu-lueur']) {
        expect(bloc, `${theme} ne redéfinit pas ${jeton}`).toContain(jeton);
      }
    }
  });

  it('retombe sur le cadran d’origine là où les jetons ne résolvent pas', () => {
    // Le Grand écran vit dans la coquille historique, hors de `.tune-v2` : il
    // doit rendre exactement ce qu'il rendait avant que la palette existe.
    expect(paletteVuDepuis(null)).toEqual(PALETTE_SOMBRE);
    expect(PALETTE_SOMBRE.aiguille).toBe('#f2b441');
    expect(PALETTE_SOMBRE.encre).toBe('237,233,224');
  });

  it('relit la palette quand le thème change, et JAMAIS à chaque image', () => {
    // `getComputedStyle` force un recalcul de style. Trente lectures par
    // seconde et par cadran, sur une barre toujours à l'écran, coûteraient
    // plus cher que tout le dessin.
    const src = sansCommentaires(lire(CADRAN));
    expect(src).toContain('void $preferences.v2Theme');
    expect(src).toContain('palette = paletteVuDepuis(c)');
    const boucle = src.slice(src.indexOf('return boucleImages('));
    expect(boucle, 'la palette est relue dans la boucle de dessin')
      .not.toContain('paletteVuDepuis');
  });
});
