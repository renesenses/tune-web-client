// 🔴 renesenses/tune-web-client#925, #907, #887 — « les en-têtes ne restent pas
// figés au défilement ».
//
// #925 : Benjithom (fils 1104, 1192) et Jean Valjean (fil 1237) — « serait-il
//        possible de bloquer les hauts des onglets […] afin de garder une
//        uniformité, les autres le sont ».
// #907 : Lulu/JLuc (fil 1632) — le bouton « Retour » du détail d'une Collection
//        part avec la grille d'albums.
// #887 : Jean Valjean (fil 1721) — Bandcamp : « quand on utilise la souris pour
//        le défilement, on perd tous ces choix ».
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE CE FICHIER NE PEUT PAS FAIRE, ET POURQUOI IL EST ÉCRIT QUAND MÊME
// ─────────────────────────────────────────────────────────────────────────────
// C'est du CSS : jsdom ne met rien en page, ne calcule aucune hauteur et ne
// défile pas. Un test qui « vérifie le sticky » sous jsdom ne vérifie rien.
//
// La mesure qui tranche a donc été faite AILLEURS — dans deux vrais moteurs, en
// faisant défiler, le 12/09/2026, sur les composants réellement montés :
//
//   écran                        avant (Chrome/Firefox)   après
//   StreamingView .streaming-header   400 px de dérive     0
//   FavoritesView .favorites-header   400 px               0
//   CollectionsView .detail-header    400 px               0
//   BandcampView  .bc-tete            400 px               0
//
// Ce fichier tient les deux invariants qui PRODUISENT ce résultat, et qui
// peuvent être défaits par une modification ultérieure sans que rien ne
// rougisse :
//
//   1. la règle est là, sur le bon élément (garde étroite mais honnête) ;
//   2. 🔴 AUCUN ancêtre bloquant sur le chemin — c'est CELLE-CI qui compte.
//      `overflow`, `contain`, `content-visibility`, `transform` posés sur un
//      parent annulent l'ancrage en silence : la règle reste écrite, l'en-tête
//      repart quand même, et aucun test ordinaire ne le voit. Un cas voisin a
//      été trouvé cette nuit — un menu rogné par un `content-visibility` sur un
//      ANCÊTRE, pas par son propre style.
//
// CONTRE-ÉPREUVE : voir la dernière suite, qui pose un ancêtre bloquant dans un
// gabarit de démonstration et exige que l'analyse le refuse.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declarationsDe, lireStyles, verdictAncrage } from './ancrageDefilement';

const lire = (chemin: string) =>
  readFileSync(resolve(__dirname, '../../components', chemin), 'utf-8');

/** Les écrans repris par ce lot, et l'élément qui doit rester à l'écran. */
const ECRANS = [
  { issue: '#925', fichier: 'StreamingView.svelte', cible: 'streaming-header' },
  { issue: '#925', fichier: 'FavoritesView.svelte', cible: 'favorites-header' },
  { issue: '#907', fichier: 'CollectionsView.svelte', cible: 'detail-header' },
  { issue: '#887', fichier: 'BandcampView.svelte', cible: 'bc-tete' },
] as const;

describe('en-têtes qui doivent rester à l’écran au défilement', () => {
  for (const { issue, fichier, cible } of ECRANS) {
    describe(`${issue} — ${fichier} .${cible}`, () => {
      const source = lire(fichier);

      it('porte bien position:sticky avec un offset et un fond opaque', () => {
        const d = declarationsDe(lireStyles(source), cible);
        expect(d.position, `.${cible} n’est plus épinglé : il repartira avec le contenu`)
          .toBe('sticky');
        expect(d.top, `.${cible} est sticky sans \`top\` : il ne s’arrête nulle part`)
          .toBeDefined();
        // Sans fond opaque, le contenu défile EN TRANSPARENCE sous le titre —
        // le défaut est alors remplacé par un autre, tout aussi visible.
        expect(
          d.background ?? d['background-color'],
          `.${cible} est épinglé sans fond : le contenu défilera visiblement dessous`,
        ).toBeTruthy();
      });

      it('🔴 n’a AUCUN ancêtre bloquant entre lui et son conteneur de défilement', () => {
        const { bloqueurs, inspectes } = verdictAncrage(source, cible);
        expect(
          bloqueurs,
          `un ancêtre de .${cible} annule l’ancrage en silence.\n`
            + `chaîne inspectée : ${inspectes.map((n) => n.balise + '.' + n.classes.join('.')).join(' < ')}\n`
            + `bloqueurs : ${JSON.stringify(bloqueurs)}`,
        ).toEqual([]);
      });
    });
  }
});

describe('#907 — le rail A-Z se range SOUS l’en-tête épinglé, pas derrière', () => {
  const collections = lire('CollectionsView.svelte');
  const alpha = lire('AlphaIndex.svelte');

  // Mesuré avant correction : l'en-tête épinglé avait son bas à 98 px et le
  // rail se calait à 74 px — les premières lettres passaient DERRIÈRE lui.
  it('AlphaIndex expose un offset réglable, à zéro par défaut', () => {
    const d = declarationsDe(lireStyles(alpha), 'alpha-index');
    expect(
      d.top,
      'le rail est revenu à un `top` fixe : les écrans dont l’en-tête est '
        + 'épinglé DANS le scroller le masqueront à nouveau',
    ).toMatch(/var\(\s*--alpha-sticky-top\s*,\s*0\s*\)/);
  });

  for (const [zone, variable] of [
    ['collection-detail', '--hauteur-entete-detail'],
    ['collections-section', '--hauteur-entete-collections'],
  ] as const) {
    it(`.${zone} décale le rail de ${variable}`, () => {
      const d = declarationsDe(lireStyles(collections), zone);
      expect(
        d['--alpha-sticky-top'],
        `.${zone} ne décale plus le rail : il repassera derrière l’en-tête`,
      ).toContain(variable);
    });
  }

  it('les deux bandes épinglées ont une hauteur ARRÊTÉE', () => {
    const regles = lireStyles(collections);
    const contenu = declarationsDe(regles, 'tab-content');
    for (const v of ['--hauteur-entete-detail', '--hauteur-entete-collections']) {
      expect(contenu[v], `${v} n’est plus défini : le rail n’a plus d’offset`).toMatch(/px$/);
    }
    // Si la hauteur flottait avec la police, le rail glisserait sous l'en-tête
    // au premier changement de corps de texte.
    for (const [classe, variable] of [
      ['detail-header', '--hauteur-entete-detail'],
      ['collections-header', '--hauteur-entete-collections'],
    ] as const) {
      const d = declarationsDe(regles, classe);
      expect(d['min-height'], `.${classe} n’a plus de hauteur arrêtée`).toContain(variable);
    }
  });
});

describe('#887 — Bandcamp : la rangée de modes se cale sous la bande du titre', () => {
  const source = lire('BandcampView.svelte');
  const regles = lireStyles(source);

  it('la rangée de modes est épinglée à la hauteur de la bande du titre', () => {
    const d = declarationsDe(regles, 'bc-modes');
    expect(d.position, '.bc-modes n’est plus épinglé — « on perd tous ces choix »').toBe('sticky');
    expect(
      d.top,
      '.bc-modes est épinglé à 0 : il se superposera au titre au lieu de se caler dessous',
    ).toContain('--bc-bande-tete');
  });

  it('la bande du titre réserve exactement cette hauteur', () => {
    expect(declarationsDe(regles, 'bc')['--bc-bande-tete']).toMatch(/px$/);
    expect(
      declarationsDe(regles, 'bc-tete')['min-height'],
      'sans hauteur arrêtée, un trou transparent s’ouvre entre le titre et les modes',
    ).toContain('--bc-bande-tete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRE-ÉPREUVE — l'analyse voit-elle vraiment un ancêtre bloquant ?
//
// Sans cette suite, les épreuves ci-dessus resteraient vertes même si
// `verdictAncrage` ne savait rien détecter du tout : elles n'affirment qu'une
// ABSENCE. On lui présente donc des gabarits où le défaut est présent, et on
// exige qu'elle le nomme.
// ─────────────────────────────────────────────────────────────────────────────
describe('contre-épreuve — l’analyse refuse un chemin bloqué', () => {
  const gabaritAvec = (styleParent: string) => `
    <div class="ecran">
      <div class="parent">
        <header class="tete"><h2>Titre</h2></header>
        <div class="liste">…</div>
      </div>
    </div>
    <style>
      .ecran { height: 100%; overflow-y: auto; }
      .parent { ${styleParent} }
      .tete { position: sticky; top: 0; background: #111; }
    </style>`;

  it('un chemin sain ne signale rien, et trouve le conteneur de défilement', () => {
    const v = verdictAncrage(gabaritAvec('display: flex;'), 'tete');
    expect(v.bloqueurs).toEqual([]);
    expect(v.scroller?.classes).toContain('ecran');
  });

  for (const [propriete, valeur] of [
    ['overflow', 'hidden'],
    ['overflow-x', 'clip'],
    ['contain', 'paint'],
    ['content-visibility', 'auto'],
    ['transform', 'translateZ(0)'],
    ['filter', 'blur(2px)'],
    ['will-change', 'transform'],
  ] as const) {
    it(`🔴 signale un ancêtre en ${propriete}: ${valeur}`, () => {
      const v = verdictAncrage(gabaritAvec(`${propriete}: ${valeur};`), 'tete');
      expect(
        v.bloqueurs.map((b) => b.propriete),
        `${propriete} sur un ancêtre annule le sticky, et l’analyse ne l’a pas vu`,
      ).toContain(propriete);
    });
  }

  it('ne prend PAS le conteneur de défilement lui-même pour un bloqueur', () => {
    // `.ecran` porte `overflow-y: auto` : c'est ce qui rend l'ancrage possible.
    // Le confondre avec un bloqueur rendrait la garde inutilisable partout.
    const v = verdictAncrage(gabaritAvec('display: block;'), 'tete');
    expect(v.bloqueurs).toEqual([]);
  });

  it('🔴 ne lit PAS une règle de @media comme une règle inconditionnelle', () => {
    // Défaut trouvé par ce fichier même, le 12/09/2026 : `.top-row` de
    // SearchView est redéfini sous deux points de rupture, et la cascade
    // simplifiée retenait la valeur du plus étroit. Une garde qui lit mal le
    // CSS garde n'importe quoi — y compris l'inverse de ce qu'on croit.
    const source = `
      <div class="ecran"><div class="parent"><header class="tete">T</header></div></div>
      <style>
        .ecran { overflow-y: auto; }
        .parent { display: flex; }
        .tete { position: sticky; top: 0; background: #111; }
        @media (max-width: 700px) {
          .parent { overflow: hidden; }
          .tete { position: static; }
        }
      </style>`;
    expect(verdictAncrage(source, 'tete').bloqueurs).toEqual([]);
    expect(declarationsDe(lireStyles(source), 'tete').position).toBe('sticky');
  });

  it('ne se laisse pas berner par un `overflow` cité dans un COMMENTAIRE', () => {
    const source = `
      <div class="ecran"><div class="parent"><header class="tete">T</header></div></div>
      <style>
        .ecran { overflow-y: auto; }
        /* .parent { overflow: hidden; } — retiré le 12/09, ne pas remettre */
        .parent { display: flex; }
        .tete { position: sticky; top: 0; background: #111; }
      </style>`;
    expect(verdictAncrage(source, 'tete').bloqueurs).toEqual([]);
  });
});
