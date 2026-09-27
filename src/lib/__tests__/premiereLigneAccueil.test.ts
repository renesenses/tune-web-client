/**
 * LA PREMIÈRE LIGNE DE L'ACCUEIL — Bertrand, 27/09/2026, maquette de Levente.
 *
 * « La première ligne de la homepage : cela devient un gros widget
 * horizontal » — une carte carrée par zone active, puis les genres, les
 * concerts et les statistiques. Avec trois zones, les cartes poussent les
 * panneaux vers la droite et la ligne défile.
 *
 * ## Les quatre pièges que ces gardes tiennent
 *
 *  1. 🔴 LA HAUTEUR. Quatre panneaux de hauteurs voisines mais différentes,
 *     côte à côte sur une même ligne, donnent exactement l'« assemblage de
 *     morceaux » que la règle « tous horizontaux » interdit depuis le
 *     02/09/2026. Une seule cote, déclarée une fois.
 *  2. 🔴 LA LIGNE VIDE. La branche de rendu doit passer AVANT le repli
 *     « (vide) », qui teste `et.elements`. Placée après, une page sans aucune
 *     zone en lecture afficherait « (vide) » à la place des trois panneaux —
 *     c'est le piège que les blocs du Tableau de bord ont déjà payé.
 *  3. 🔴 LE COÛT. Les cartes ne doivent RIEN demander au serveur : tout vient
 *     de `ctx.zones`, que la coquille tient déjà.
 *  4. 🔴 LES TRENTE JOURS. Sur `30d`, la route du tableau de bord dépasse le
 *     chien de garde de 8 s de `PageWidgets` : le panneau tomberait en
 *     « (délai) » chez qui écoute beaucoup.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';
import { COTE_L1, LARGEUR_PANNEAU, PERIODE_L1, zonesDeLaLigne } from '../premiereLigne';
import { migrationPremiereLigne } from '../migrationPremiereLigne';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PANNEAUX = [
  'src/components/v2/ligne1/PanneauGenres.svelte',
  'src/components/v2/ligne1/PanneauConcerts.svelte',
  'src/components/v2/ligne1/PanneauStats.svelte',
];

/** Une zone telle que `/zones` la rend, mesurée sur le .18 le 06/09/2026. */
const zone = (o: any = {}) => ({
  id: 7, name: 'Salon', state: 'playing', position_ms: 42_000,
  current_track: {
    title: 'Out of Time', artist_name: 'Hugo Kant', album_id: 12,
    cover_path: '/c.jpg', format: 'flac', sample_rate: 44100, bit_depth: 16,
    year: 2017, duration_ms: 229_000, source: 'local',
  },
  ...o,
});
const ctx = (zones: any[]) => ({ profileId: 1, albums: [], zones }) as any;

describe('le widget « Première ligne »', () => {
  const w = widgetParId('premiere-ligne')!;

  it('existe, avec sa forme, sa clé de titre, et sans titre affiché', () => {
    expect(w).toBeTruthy();
    expect(w.forme).toBe('premiere-ligne');
    expect(w.cleTitre).toBe('v2.home.wFirstRow');
    // La ligne d'en-tête est déjà sous « Bonsoir Bertrand ! » : un second
    // titre au-dessus d'elle ferait deux en-têtes.
    expect(w.sansTitre).toBe(true);
  });

  it("ouvre l'accueil par défaut, et en PREMIER", () => {
    // Contrairement aux widgets ajoutés depuis le 06/09, celui-ci entre dans
    // le défaut : la demande n'était pas « un widget de plus », c'était « la
    // première ligne de la homepage ». Une disposition déjà enregistrée
    // l'emporte toujours — c'est `charger()` qui le dit.
    expect(DISPOSITION_DEFAUT[0]).toBe('premiere-ligne');
  });

  it("n'est déclaré qu'une fois dans le catalogue", () => {
    expect(WIDGETS.filter((x) => x.forme === 'premiere-ligne')).toHaveLength(1);
  });

  it('ne fait AUCUN appel réseau', () => {
    const src = sansCommentaires(lire('src/lib/accueilWidgets.ts'));
    const i = src.indexOf("id: 'premiere-ligne'");
    const bloc = src.slice(i, src.indexOf("id: 'zones'", i));
    expect(bloc, 'la ligne d’en-tête ne doit pas coûter une requête').not.toContain('api.');
  });
});

describe('🔴 la zone active ne doit JAMAIS disparaître', () => {
  // Bertrand, 27/09/2026, sur le .18 : « la zone active a disparu ». La ligne
  // rendait `et.elements` — ce que le chargeur avait produit UNE FOIS, au
  // chargement de la page. `PageWidgets` n'appelle `charger` qu'une seule fois
  // par widget : la liste des cartes était donc figée à l'ouverture.

  it('retient les zones qui jouent ou sont en pause, et elles seules', () => {
    // Sur le .18, « Cet ordinateur » est `stopped` et porte pourtant un
    // `current_track` à la position 0 : le garder remplirait la ligne de
    // cartes muettes.
    const zones = [
      zone({ id: 1, name: 'Salon', state: 'playing' }),
      zone({ id: 2, name: 'Bureau', state: 'paused' }),
      zone({ id: 3, name: 'Cet ordinateur', state: 'stopped' }),
      zone({ id: 4, name: 'Cuisine', state: 'playing', current_track: null }),
    ];
    expect(zonesDeLaLigne(zones).map((z: any) => z.id)).toEqual([1, 2]);
  });

  it('suit le magasin dans les DEUX sens', () => {
    // Une zone qui démarre APRÈS l'ouverture doit apparaître ; une zone
    // arrêtée doit disparaître. L'ancienne liste figée se trompait des deux
    // côtés.
    const arret = [zone({ id: 1, state: 'stopped' })];
    expect(zonesDeLaLigne(arret)).toHaveLength(0);
    const demarre = [zone({ id: 1, state: 'playing' })];
    expect(zonesDeLaLigne(demarre)).toHaveLength(1);
  });

  it('supporte un magasin vide ou absent', () => {
    // La coquille charge les zones en deux temps : au premier rendu, le
    // magasin peut être vide. Ce n'est pas une panne, c'est l'instant d'avant.
    expect(zonesDeLaLigne([])).toEqual([]);
    expect(zonesDeLaLigne(null)).toEqual([]);
    expect(zonesDeLaLigne(undefined)).toEqual([]);
  });

  it('le chargeur ne produit plus de liste — le rendu lirait du figé', () => {
    const src = sansCommentaires(lire('src/lib/accueilWidgets.ts'));
    const i = src.indexOf("id: 'premiere-ligne'");
    const bloc = src.slice(i, src.indexOf("id: 'zones'", i));
    expect(bloc).toContain('charger: async () => []');
  });

  it('le rendu lit le MAGASIN, jamais `et.elements`', () => {
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    const i = src.indexOf("w.forme === 'premiere-ligne'");
    const bloc = src.slice(i, src.indexOf('<PanneauStats />', i));
    expect(bloc).toContain('zonesDeLaLigne($zones)');
    expect(bloc, 'la liste figée est revenue').not.toContain('et.elements');
  });
});

describe('le rendu de la première ligne', () => {
  const src = lire('src/components/v2/PageWidgets.svelte');
  const nu = sansCommentaires(src);

  it('passe AVANT le repli « (vide) »', () => {
    // 🔴 Le repli teste `et.elements`, qu'une ligne sans zone en lecture ne
    // remplit pas. Placée après lui, la branche ne serait jamais atteinte et
    // la page s'ouvrirait sur « (vide) » au lieu des trois panneaux.
    const ligne = nu.indexOf("w.forme === 'premiere-ligne'");
    const vide = nu.indexOf('!et.elements.length');
    expect(ligne).toBeGreaterThan(-1);
    expect(vide).toBeGreaterThan(-1);
    expect(ligne).toBeLessThan(vide);
  });

  it('pose la hauteur UNE fois, sur la bande', () => {
    expect(nu).toContain('style:--l1-h="{COTE_L1}px"');
  });

  it('défile horizontalement, comme toutes les autres bandes', () => {
    const i = nu.indexOf('class="l1"');
    expect(i).toBeGreaterThan(-1);
    expect(nu.slice(i, i + 160)).toContain('defilementHorizontal');
  });

  it('montre les trois panneaux à droite des cartes', () => {
    const i = nu.indexOf('class="l1"');
    const bloc = nu.slice(i, nu.indexOf('</div>', nu.indexOf('<PanneauStats />')));
    expect(bloc.indexOf('<CarteZoneL1')).toBeLessThan(bloc.indexOf('<PanneauGenres />'));
    expect(bloc).toContain('<PanneauConcerts />');
    expect(bloc).toContain('<PanneauStats />');
  });

  it('tait le titre du widget hors du mode « Modifier »', () => {
    expect(nu).toContain('class:muette={w.sansTitre && !edition}');
    expect(nu).toContain('.tete.muette{display:none}');
  });
});

describe('la cote unique de la ligne', () => {
  it('vaut 315, le carré de Levente', () => {
    // « I've changed to 315x315 so it's more on grid […] better to have 1:1
    // ratio » (26/09/2026). La carte est une pochette en plein cadre : tout
    // autre rapport la rognerait selon l'album.
    expect(COTE_L1).toBe(315);
    expect(LARGEUR_PANNEAU).toBe(COTE_L1);
  });

  it('est la SEULE hauteur : la carte et le cadre la lisent, nul ne se la donne', () => {
    const carte = lire('src/components/v2/ligne1/CarteZoneL1.svelte');
    const cadre = lire('src/components/v2/ligne1/PanneauL1.svelte');
    expect(carte).toContain('height: var(--l1-h)');
    expect(carte, 'le carré : le côté suit la hauteur').toContain('width: var(--l1-h)');
    expect(cadre).toContain('height: var(--l1-h)');
  });

  it("aucun panneau n'écrit son propre cadre", () => {
    // Trois cadres écrits trois fois auraient divergé au premier ajustement,
    // et sur une ligne où les panneaux se touchent un écart de deux pixels se
    // voit.
    for (const f of PANNEAUX) {
      const s = lire(f);
      expect(s, f).toContain('<PanneauL1');
      expect(s, `${f} — le cadre appartient à PanneauL1`).not.toContain('class="panneau"');
    }
  });
});

describe('ce que chaque panneau doit tenir', () => {
  it('les statistiques partagent la requête du tableau de bord, sur 7 jours', () => {
    // Onze blocs qui appelleraient chacun la route la demanderaient onze fois
    // au même instant ; `tableauDeBord()` la partage EN VOL. Et `30d` dépasse
    // le chien de garde de 8 s.
    const s = sansCommentaires(lire('src/components/v2/ligne1/PanneauStats.svelte'));
    expect(s).toContain('tableauDeBord(PERIODE_L1)');
    expect(PERIODE_L1).toBe('7d');
  });

  it("les statistiques n'introduisent aucune bibliothèque de graphiques", () => {
    // Il n'y en a aucune dans ce projet : les barres sont des `<div>` dont la
    // largeur porte la valeur, l'heure du jour vingt-quatre cases dont
    // l'opacité la porte.
    const s = lire('src/components/v2/ligne1/PanneauStats.svelte');
    expect(s).not.toContain('<canvas');
    expect(s).not.toMatch(/from '(chart\.js|d3|recharts)/);
  });

  it('les concerts DISPARAISSENT sans le greffon ou sur un refus d’offre', () => {
    // 402/403 n'est pas une panne, et la ligne d'en-tête n'est pas une place
    // de réclame : l'écran Concerts, lui, explique le geste.
    const s = sansCommentaires(lire('src/components/v2/ligne1/PanneauConcerts.svelte'));
    expect(s).toContain('$concertsCharge');
    expect(s).toContain('refusConcerts');
    expect(s).toMatch(/\{#if \$concertsCharge && phase !== 'refus'\}/);
  });

  it('un genre ouvre CE genre, par le chemin que la Bibliothèque écoute déjà', () => {
    // « Je sélectionne une smart collection et le raccourci me renvoie sur la
    // liste » (05/09/2026). `tune:v2-facette` existe et porte l'onglet et la
    // valeur ; en inventer un second aurait donné deux vérités.
    const s = sansCommentaires(lire('src/components/v2/ligne1/PanneauGenres.svelte'));
    expect(s).toContain("new CustomEvent('tune:v2-facette'");
    expect(s).toContain("onglet: 'genres'");
    const biblio = lire('src/components/v2/LibraryV2.svelte');
    expect(biblio, 'la Bibliothèque doit toujours écouter cet évènement')
      .toContain("addEventListener('tune:v2-facette'");
  });
});

describe('la première ligne entre UNE FOIS dans les accueils déjà rangés', () => {
  // Arbitrage de Bertrand du 27/09/2026. `DISPOSITION_DEFAUT` ne vaut que pour
  // les profils qui n'ont JAMAIS rangé leur accueil : sans cette migration,
  // quiconque a déplacé un widget une seule fois ne verrait jamais la ligne
  // d'en-tête — le widget le plus visible du lot, invisible pour les
  // utilisateurs les plus engagés.
  const DEFAUT = ['premiere-ligne', 'reprendre', 'statistiques'];

  it("l'insère EN TÊTE d'une disposition enregistrée qui ne l'a pas", () => {
    const r = migrationPremiereLigne(['reprendre', 'favoris'], undefined, DEFAUT);
    expect(r.aMigrer).toBe(true);
    expect(r.disposition).toEqual(['premiere-ligne', 'reprendre', 'favoris']);
  });

  it('🔴 ne la remet JAMAIS à qui l’a retirée', () => {
    // Sans marqueur, la migration se rejouerait contre l'utilisateur : un
    // widget qu'on ne peut plus enlever serait pire que le défaut corrigé.
    // C'est mot pour mot la leçon de #1519.
    const r = migrationPremiereLigne(['reprendre'], true, DEFAUT);
    expect(r.aMigrer).toBe(false);
    expect(r.disposition).toEqual(['reprendre']);
  });

  it("n'écrit RIEN quand la ligne est déjà là", () => {
    const r = migrationPremiereLigne(['premiere-ligne', 'reprendre'], undefined, DEFAUT);
    expect(r.aMigrer).toBe(false);
  });

  it("n'écrit RIEN pour un profil qui n'a jamais rangé son accueil", () => {
    // Il suit déjà le défaut, qui porte la ligne. Ouvrir l'accueil ne doit
    // rien écrire chez lui.
    expect(migrationPremiereLigne([], undefined, DEFAUT).aMigrer).toBe(false);
    expect(migrationPremiereLigne(null, undefined, DEFAUT).aMigrer).toBe(false);
  });

  it('ÉPARGNE les écrans éditoriaux Qobuz et Tidal', () => {
    // Ils instancient la même page avec leur propre catalogue, où
    // `premiere-ligne` n'existe pas : leur insérer cet identifiant laisserait
    // un trou muet dans leur page.
    const r = migrationPremiereLigne(['qobuz-nouveautes'], undefined, ['qobuz-nouveautes']);
    expect(r.aMigrer).toBe(false);
    expect(r.disposition).toEqual(['qobuz-nouveautes']);
  });

  it('écrit la disposition ET son marqueur dans le MÊME appel', () => {
    // Seul le marqueur : la ligne disparaîtrait au rechargement sans jamais
    // revenir. Seule la disposition : elle reviendrait chez qui la retire.
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    const i = src.indexOf('async function migrerPremiereLigne');
    const bloc = src.slice(i, src.indexOf('async function enregistrer', i));
    expect(bloc).toContain('[CLE]: disp');
    expect(bloc).toContain('[CLE_LIGNE_MIGRE]: true');
  });

  it('🔴 écrit la disposition NON filtrée : #987 ne se rejoue pas', () => {
    // `disposition` est filtrée sur les identifiants que cette version sait
    // nommer ; l'écrire effacerait un widget choisi avec une version plus
    // récente.
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    expect(src).toContain('migrerPremiereLigne(pid, [...(dispositionEnregistree ?? [])])');
  });
});

describe('« En écoute » (zones-cartes) ne fige plus sa liste non plus', () => {
  it('son chargeur ne produit plus de liste', () => {
    const src = sansCommentaires(lire('src/lib/accueilWidgets.ts'));
    const i = src.indexOf("id: 'zones-cartes'");
    const bloc = src.slice(i, src.indexOf("id: 'reprendre'", i));
    expect(bloc).toContain('charger: async () => []');
  });

  it('son rendu lit le magasin, par le MÊME filtre que la première ligne', () => {
    // Deux copies du filtre auraient divergé au premier ajustement.
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    const i = src.indexOf('class="zcartes"');
    const bloc = src.slice(i, i + 900);
    expect(bloc).toContain('zonesDeLaLigne($zones)');
    expect(bloc, 'la liste figée est revenue').not.toContain('et.elements');
  });
});
