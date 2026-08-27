import { describe, expect, it } from 'vitest';
import {
  GLOBALES,
  analyser,
  classesDe,
  infobullesCreuses,
  sansInfobulle,
  type Analyse,
} from './infobullesTronquees';

/**
 * Accueil et tableau de bord : un texte coupé doit pouvoir se lire au survol.
 *
 * Lot 2 du chantier `renesenses/tune-server-rust#2411`, après le lot 0
 * (Bandcamp, `tune-web-client#590`) et le lot 1 (le lecteur, `#603`). C'est le
 * premier écran : ce qu'on y coupe est ce qu'on voit en premier.
 *
 * Le moteur est celui du lot 1, extrait dans `infobullesTronquees.ts` — il lit
 * les règles de troncature dans la feuille globale ET dans le `<style>` du
 * composant, en déduit les classes, exige un `title=` sur les éléments qui les
 * portent, accepte qu'un ANCÊTRE porteur d'un `title=` couvre son contenu, et
 * refuse une bulle qui ne dirait qu'un libellé statique.
 *
 * ⚠️ **Limite assumée, identique à celle des lots précédents : ce test lit la
 * source, il ne rend pas le composant.** Aucune infobulle n'a été observée
 * dans un navigateur, et rien ici ne dit que ces textes sont réellement coupés
 * à la largeur où on les regarde.
 */

/**
 * Les composants du lot 2. `LibraryView` et `StreamingView` en sont
 * volontairement absents — le chantier les traite seuls et en dernier — et les
 * composants du lecteur ont leur propre garde.
 *
 * `AlbumArt` et `ServiceBadge`, montés par `HomeView`, n'y sont pas non plus :
 * une vingtaine de vues les partagent, ils ne sont pas propres à cette
 * surface.
 */
const COMPOSANTS = [
  'HomeView',
  'DashboardView',
  'DashboardHighlights',
  'RecommendationsSection',
] as const;

const ANALYSES: Analyse[] = COMPOSANTS.map(analyser);
const analyse = (nom: string) => ANALYSES.find((a) => a.nom === nom)!;

describe('Accueil et tableau de bord — infobulle sur les textes tronqués (#2411, lot 2)', () => {
  it('la feuille globale définit bien une classe de troncature', () => {
    // Contre-épreuve du test lui-même : si la lecture du CSS retournait un
    // ensemble vide, tous les cas suivants passeraient sans rien vérifier.
    expect(
      [...GLOBALES],
      "aucune règle de troncature lue dans tune-theme.css — le lecteur de CSS est cassé, pas l'écran",
    ).toContain('truncate');
  });

  it('les règles propres du tableau de bord sont vues elles aussi', () => {
    // Le relevé de l'issue ne comptait que le mot `truncate` : il ne pouvait
    // pas voir ces quatre-là, définies dans le `<style>` de `DashboardView`.
    // C'est le même angle mort que `BandcampView` (#2404) et que
    // `.inline-credits` du lot 1.
    const locales = analyse('DashboardView').locales;
    for (const classe of ['rank-artist-link', 'rank-name', 'bar-label']) {
      expect([...locales], `la règle de troncature de .${classe} n’est plus lue`).toContain(classe);
    }
  });

  it('la section de recommandations tronque avec sa propre règle', () => {
    expect(
      [...analyse('RecommendationsSection').locales].length,
      'RecommendationsSection ne pose plus aucune règle de troncature',
    ).toBeGreaterThan(0);
  });

  it('chaque composant du lot tronque bien du texte', () => {
    for (const a of ANALYSES) {
      expect(
        a.coupables.length,
        `${a.nom}.svelte : plus aucun élément tronqué — le test ne garde plus rien`,
      ).toBeGreaterThan(0);
    }
  });

  it('chaque élément tronqué peut se lire au survol', () => {
    const nus = sansInfobulle(ANALYSES);
    expect(
      nus,
      `L'accueil coupe du texte sans donner de recours au survol :\n  ${nus.join('\n  ')}`,
    ).toEqual([]);
  });

  it("l'infobulle porte la donnée, pas un libellé d'interface", () => {
    // Une bulle « Album » sur un titre d'album coupé ne sert à rien : ce qu'on
    // veut lire, c'est le texte entier. On refuse donc le littéral statique et
    // le `$t()` seul. Un `$t()` employé en REPLI dans une expression plus
    // large (`{album.artist || $t('home.unknownArtist')}`) reste légitime.
    const creux = infobullesCreuses(ANALYSES);
    expect(creux, `Infobulles creuses :\n  ${creux.join('\n  ')}`).toEqual([]);
  });

  it('un texte coupé à l’intérieur d’un élément déjà pourvu reste exempté', () => {
    // Cas limite explicite, comme la pastille de zone du lot 1 : l'exemption
    // par héritage doit rester une RÈGLE observable, et non un trou silencieux.
    // Si plus aucun élément du lot n'en bénéficie, la règle n'est plus
    // exercée par ce lot et le cas doit disparaître plutôt que mentir.
    const herites = ANALYSES.flatMap((a) =>
      a.coupables
        .filter((x) => x.b.titreHerite)
        .map((x) => `${a.nom}.svelte:${x.b.ligne} — ${classesDe(x.b.attrs).join(' ')}`),
    );
    expect(
      herites.length,
      'plus aucun texte tronqué du lot 2 n’hérite du title= d’un ancêtre — le cas ne prouve plus rien',
    ).toBeGreaterThan(0);
  });
});
