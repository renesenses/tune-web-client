/**
 * 🔴 LA RÈGLE « TOUS HORIZONTAUX » TIENT ENCORE — Bertrand, 02/09 et 25/09/2026.
 *
 * ## Ce que cette garde protège
 *
 * En tête d'`accueilWidgets.ts`, une décision écrite de Bertrand du
 * 02/09/2026 :
 *
 *   « Une bande qui défile, pour tous. Une grille pour certains et une bande
 *   pour d'autres donnerait à l'accueil l'air d'un assemblage de morceaux, et
 *   surtout la hauteur deviendrait imprévisible. »
 *
 * Le 25/09/2026, le moteur s'ouvre à une SECONDE forme — `forme: 'bloc'`, qui
 * rend son propre balisage et déclare sa hauteur — pour le nouvel écran
 * Tableau de bord. L'arbitrage du même jour est explicite : la règle ci-dessus
 * reste INTACTE sur l'Accueil, Qobuz et Tidal. Elle protégeait CES écrans-là,
 * pas celui qui n'existait pas encore.
 *
 * ## Pourquoi une garde, et pas un commentaire
 *
 * Parce qu'un commentaire ne résiste pas à la première commodité. Le jour où
 * quelqu'un voudra « juste » poser un histogramme sur l'accueil, la règle
 * cédera en silence, et personne ne le verra avant un testeur — comme la
 * hauteur imprévisible que Bertrand décrit. Cette garde le dit tout de suite,
 * et nomme le widget fautif.
 *
 * ## Ce qu'elle mesure vraiment
 *
 * Les CATALOGUES RÉELS, pas le source. Une garde de texte (`grep "forme:
 * 'bloc'"`) serait satisfaite par la définition même du type dans
 * `accueilWidgets`, et aveugle à un widget construit dynamiquement — ce que
 * `catalogueService` fait précisément, section par section, d'après ce que le
 * service répond. On construit donc les trois catalogues pour de vrai.
 *
 * ⚠️ Chaque cas vérifie D'ABORD que le catalogue n'est pas vide. Un catalogue
 * vide passerait toutes les assertions de « aucun bloc » sans rien prouver :
 * c'est l'absence prise pour une preuve, et c'est le piège que ce dépôt a déjà
 * payé ailleurs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';
import { catalogueService, categoriesPlaylistsPourAccueil } from '../widgetsService';
import { BLOCS_TABLEAU_DE_BORD } from '../tableauDeBordWidgets';

/** Ce que le service répond, juste assez pour que le catalogue se construise. */
function poserLeService() {
  vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([
    { id: 'new-releases', name: 'Nouveautés' },
    { id: 'press-awards', name: 'Sélection de la presse' },
  ] as any);
  vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([
    { id: 'jazz', name: 'Jazz' },
  ] as any);
  vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([
    { id: 'hires', name: 'Hi-Res', playlists: [{ source_id: '1', name: 'Une playlist' }] },
  ] as any);
}

beforeEach(() => {
  vi.restoreAllMocks();
  poserLeService();
});
afterEach(() => vi.restoreAllMocks());

/** Les identifiants des widgets `bloc` d'un catalogue — vide quand la règle tient. */
const blocsDe = (cat: { id: string; forme: string }[]) =>
  cat.filter((w) => w.forme === 'bloc').map((w) => w.id);

describe('🔴 la règle « tous horizontaux » après l’ouverture du moteur aux blocs', () => {
  it('AUCUN bloc dans le catalogue de l’ACCUEIL', () => {
    // La prémisse : sans elle, un registre vidé par accident rendrait ce
    // témoin vert pour la pire des raisons.
    expect(WIDGETS.length, 'le registre de l’accueil est vide : ce témoin ne mesure rien').toBeGreaterThan(15);
    expect(
      blocsDe(WIDGETS),
      'un widget « bloc » est entré dans le registre de l’ACCUEIL. La décision de ' +
      'Bertrand du 02/09/2026 y impose une bande horizontale pour tous ; un bloc ' +
      'y rendrait la hauteur imprévisible. Les blocs vivent dans ' +
      '`tableauDeBordWidgets.ts`, sur l’écran Tableau de bord.',
    ).toEqual([]);
  });

  it('AUCUN bloc dans la disposition par défaut de l’accueil', () => {
    expect(DISPOSITION_DEFAUT.length).toBeGreaterThan(0);
    const fautifs = DISPOSITION_DEFAUT.filter((id) => widgetParId(id)?.forme === 'bloc');
    expect(fautifs, 'un bloc s’imposerait à tous les accueils').toEqual([]);
  });

  it.each(['qobuz', 'tidal'])('AUCUN bloc dans le catalogue éditorial de %s', async (service) => {
    const cat = await catalogueService(service);
    expect(cat.length, `le catalogue ${service} est vide : ce témoin ne mesure rien`).toBeGreaterThan(0);
    expect(
      blocsDe(cat),
      `un widget « bloc » est entré dans le catalogue éditorial de ${service}. ` +
      'Ces deux écrans instancient la même `PageWidgets` que l’accueil et ' +
      'suivent la même règle : une bande qui défile, pour tous.',
    ).toEqual([]);
  });

  it('AUCUN bloc parmi les catégories de playlists que l’accueil APPREND après son montage', async () => {
    // #987 — le catalogue de l'accueil n'est pas figé : `HomeV2` lui ajoute les
    // catégories de playlists Qobuz quand elles arrivent. La règle vaut aussi
    // pour ce qui entre par cette porte-là, qui n'est pas la porte principale.
    const appris = await categoriesPlaylistsPourAccueil('qobuz');
    expect(appris.length, 'aucune catégorie apprise : ce témoin ne mesure rien').toBeGreaterThan(0);
    expect(blocsDe(appris), 'un bloc entrerait dans l’accueil par l’apprentissage de #987').toEqual([]);
  });

  it('🔴 et la contre-épreuve : les blocs existent bel et bien, ailleurs', () => {
    // Sans ce cas, les quatre précédents seraient verts dans un monde où la
    // forme `bloc` n'a jamais été écrite — ils prouveraient que la règle tient
    // en ne prouvant rien du tout. Ils ne valent que parce qu'il y a
    // effectivement des blocs à tenir à l'écart.
    expect(BLOCS_TABLEAU_DE_BORD.length).toBe(11);
    expect(BLOCS_TABLEAU_DE_BORD.every((w) => w.forme === 'bloc')).toBe(true);
  });
});
