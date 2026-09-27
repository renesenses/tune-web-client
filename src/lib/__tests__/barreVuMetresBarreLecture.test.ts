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
  SEUIL_VU_PX,
  TAILLE_VU_BARRE,
  vuMetresVisibles,
} from '../barreVuMetres';
import {
  MAINTIEN_CRETE_MS,
  MONTEE,
  RETOMBEE,
  SPAN,
  avancerAiguille,
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
  it('est celle du Grand écran, à l’identique', () => {
    // Là-bas, deux cadrans partagent une toile large de `w`, haute de
    // `0,34 w`, chacun d'un rayon de `0,42 · w/2`. Un cadran seul dans une
    // toile large de `t` est le même dessin avec `t = w/2`.
    expect(RATIO_VU).toBeCloseTo(0.68, 10);
    expect(RATIO_VU).toBeCloseTo(0.34 * 2, 10);
    expect(TAILLE_VU_BARRE).toBe(84);
  });

  it('dessine en pixels CSS : les traits ne sont pas épaissis deux fois', () => {
    // La toile est mise à l'échelle par `setTransform(dpr, …)`. Multiplier
    // AUSSI les traits par `dpr` ferait de l'aiguille un trait gras sur un
    // écran Retina.
    const src = sansCommentaires(lire(CADRAN));
    expect(src).toContain('ctx.setTransform(dpr, 0, 0, dpr, 0, 0)');
    expect(src).toContain('dpr: 1,');
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
