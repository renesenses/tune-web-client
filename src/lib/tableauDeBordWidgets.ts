/**
 * LE CATALOGUE DU NOUVEL ÉCRAN TABLEAU DE BORD — widgets `forme: 'bloc'`.
 *
 * Chantier demandé par Bertrand le 25/09/2026. L'ancien tableau de bord
 * (`v2-heritage/DashboardView.svelte`, 906 lignes) portait quatorze sections
 * FIGÉES dans son balisage. Trois en étaient déjà sorties le 20/09 sous forme
 * de widgets d'accueil (`top-artistes`, `top-radios`, `stats-semaine`), et une
 * quatrième les accompagne (`tops`, qui rend déjà les albums et les titres
 * côte à côte). Les onze qui restent vivent ici, chacune dans son bloc,
 * composables et réordonnables comme n'importe quel widget.
 *
 * ## Pourquoi un FICHIER à part, et pas `accueilWidgets`
 *
 * Deux raisons, et la seconde est la vraie.
 *
 * 1. Ce catalogue importe des COMPOSANTS Svelte ; `accueilWidgets` n'en
 *    importait aucun et une douzaine de témoins l'importent en Node.
 *
 * 2. 🔴 Surtout : la règle « tous horizontaux » de Bertrand (02/09/2026)
 *    protège l'Accueil, Qobuz et Tidal. Tant qu'aucun bloc n'est déclaré dans
 *    `WIDGETS`, aucun ne peut tomber dans leurs catalogues par inadvertance —
 *    la séparation physique fait la moitié du travail, et
 *    `__tests__/blocsHorsAccueilQobuzTidal.test.ts` fait l'autre.
 *
 * ## UNE SEULE REQUÊTE POUR ONZE BLOCS
 *
 * `PageWidgets` charge ses widgets EN PARALLÈLE. Onze blocs qui appelleraient
 * chacun `GET /library/history/dashboard` feraient onze fois la même requête
 * au même instant, sur une route qui coûte ~300 ms par entrée de classement.
 * Ils passent donc tous par `tableauDeBord()`, le partage en vol déjà écrit
 * pour les extraits de l'accueil — et l'écran entier tient en UNE requête.
 * Seul « genres » en ajoute une seconde, pour l'arbre des genres.
 *
 * 🔴 SEPT JOURS, ET NON TRENTE. L'ancien écran ouvrait sur `30d`. La mesure
 * écrite dans `accueilWidgets` est sans appel : « sur 30 jours, même en ne
 * demandant que 5 entrées, la route dépasse le budget » — et le budget, c'est
 * le chien de garde de 8 s de `PageWidgets`. Ouvrir sur `30d` aurait donné
 * onze blocs en « (délai) ». Sur `7d` la requête est la MÊME que celle des
 * extraits de l'accueil, donc partagée avec eux quand les deux écrans se
 * suivent.
 *
 * ⚠️ RELIQUAT ASSUMÉ : le nouvel écran n'a pas le sélecteur de période
 * (aujourd'hui / 7 j / 30 j / tout) ni l'export CSV de l'ancien. `PageWidgets`
 * n'offre pas de commande partagée par toute la page, et en ajouter une
 * toucherait l'Accueil, Qobuz et Tidal. Les deux gestes restent dans le
 * réservoir `/dashboard`, qui n'est pas supprimé.
 *
 * ## LES HAUTEURS SE RÉPONDENT
 *
 * Onze hauteurs de circonstance donneraient « l'air d'un assemblage de
 * morceaux » que Bertrand refuse depuis le 02/09. Elles tombent donc toutes
 * sur UN module et ses multiples — 132, 264, 396 px — et sur rien d'autre.
 * C'est ce qui fait une page plutôt qu'un empilement.
 */
import type { Element, Widget } from './accueilWidgets';
import { tableauDeBord } from './accueilWidgets';
import * as api from './api';
import BlocBarres from '../components/v2/blocs/BlocBarres.svelte';
import BlocCeJourLa from '../components/v2/blocs/BlocCeJourLa.svelte';
import BlocClassement from '../components/v2/blocs/BlocClassement.svelte';
import BlocCompletion from '../components/v2/blocs/BlocCompletion.svelte';
import BlocHeures from '../components/v2/blocs/BlocHeures.svelte';
import BlocSemaineHeures from '../components/v2/blocs/BlocSemaineHeures.svelte';
import BlocSerie from '../components/v2/blocs/BlocSerie.svelte';
import BlocTendance from '../components/v2/blocs/BlocTendance.svelte';

/**
 * LE MODULE DE HAUTEUR, en pixels — et les trois seules tailles permises.
 *
 * `__tests__/tableauDeBordBlocs.test.ts` vérifie qu'aucun bloc n'invente une
 * quatrième valeur. Sans cette garde, le premier bloc ajouté à la va-vite
 * rétablirait l'empilement.
 */
export const MODULE = 132;
export const PETIT = MODULE;        // 132 — deux nombres, une rangée
export const MOYEN = MODULE * 2;    // 264 — une grille, une liste courte
export const GRAND = MODULE * 3;    // 396 — un classement, le point focal

/** La période du nouvel écran. Voir l'en-tête : sept jours, pas trente. */
const PERIODE = '7d' as const;
/** Combien de jours la tendance dessine — la période, jour pour jour. */
const JOURS_TENDANCE = 7;
/** Au-delà, les genres se replient derrière « voir plus » (comme avant). */
const PLAFOND_GENRES = 20;

/** Un nombre écrit dans la langue de l'écran. Jamais de mot à côté : `sous`
 *  et les valeurs sont des DONNÉES, que `check-i18n` ne lit pas. */
function nombre(n: number, langue: string): string {
  try {
    return new Intl.NumberFormat(langue).format(n);
  } catch {
    return String(n);
  }
}

/**
 * La tendance, jour par jour, TROUS COMPRIS.
 *
 * Repris de `visibleTrend` de l'ancien écran : le serveur n'envoie que les
 * jours qui portent une écoute, et une semaine à cinq barres se lirait comme
 * une semaine de cinq jours. On remplit à zéro.
 */
function joursPleins(trend: { day: string; plays: number }[]): { jour: string; plays: number }[] {
  const par = new Map(trend.map((d) => [d.day, d.plays]));
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out: { jour: string; plays: number }[] = [];
  for (let i = JOURS_TENDANCE - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ jour: cle, plays: par.get(cle) ?? 0 });
  }
  return out;
}

/**
 * La grille 7 × 24, lundi en tête.
 *
 * `weekday` est déjà remis en ISO par le serveur (1 = lundi). Les cases
 * absentes valent 0 : la carte reste pleine, et l'opacité minimale les dit.
 */
function grilleSemaine(cells: { weekday: number; hour: number; plays: number }[]): number[][] {
  const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) {
    const l = c.weekday - 1;
    if (l >= 0 && l < 7 && c.hour >= 0 && c.hour < 24) g[l][c.hour] = c.plays;
  }
  return g;
}

/**
 * Les genres REGROUPÉS PAR BRANCHE de l'arbre de l'utilisateur.
 *
 * Repris tel quel de l'ancien écran : un genre enfant compte pour son parent,
 * un parent pour lui-même, un orphelin pour « Hors arbre ».
 *
 * ⚠️ « Hors arbre » est la seule chaîne en dur de tout le lot, et elle l'était
 * déjà dans `DashboardView.svelte:35`. La traduire demanderait une clé neuve
 * dans onze langues pour un libellé de repli ; on n'en ajoute pas, et le
 * défaut existant n'est pas aggravé. Dit ici plutôt que tu.
 */
function branches(
  parGenre: { genre: string; plays: number }[],
  arbre: Record<string, string[]>,
): { label: string; valeur: number }[] {
  const versParent = new Map<string, string>();
  const parents = new Set<string>();
  for (const [parent, enfants] of Object.entries(arbre)) {
    parents.add(parent.toLowerCase());
    for (const e of enfants) versParent.set(e.toLowerCase(), parent);
  }
  const seaux = new Map<string, number>();
  for (const g of parGenre) {
    const bas = (g.genre || '').toLowerCase();
    const branche = parents.has(bas) ? g.genre : (versParent.get(bas) ?? 'Hors arbre');
    seaux.set(branche, (seaux.get(branche) ?? 0) + g.plays);
  }
  return [...seaux.entries()]
    .map(([label, valeur]) => ({ label, valeur }))
    .sort((a, b) => b.valeur - a.valeur);
}

/** Les éléments d'un classement d'albums, gestes compris. */
function elementsAlbums(d: api.DashboardData): Element[] {
  return (d.top_albums ?? []).map((a, i) => ({
    id: `tdb-alb-${i}-${a.album_title}`,
    titre: a.album_title || '—',
    sous: a.artist_name || undefined,
    cover: a.cover_path ?? null,
    jouer:
      typeof a.album_id === 'number' && a.album_id > 0
        ? (z: number) => api.play(z, { album_id: a.album_id as number })
        : a.source && a.source !== 'local' && a.source_id
          ? (z: number) => api.play(z, { source: a.source as any, source_id: a.source_id as string })
          : undefined,
  }));
}

/** Les éléments d'un classement de titres, gestes compris. */
function elementsTitres(d: api.DashboardData): Element[] {
  return (d.top_tracks ?? []).map((t, i) => ({
    id: `tdb-tit-${i}-${t.title}`,
    titre: t.title || '—',
    sous: t.artist_name || undefined,
    cover: t.cover_path ?? null,
    jouer:
      typeof t.track_id === 'number' && t.track_id > 0
        ? (z: number) => api.play(z, { track_id: t.track_id as number })
        : t.source && t.source !== 'local' && t.source_id
          ? (z: number) => api.play(z, { source: t.source as any, source_id: t.source_id as string })
          : undefined,
  }));
}

/**
 * 🔴 `charger` rend une liste VIDE sur tous les blocs, et c'est voulu.
 *
 * Le champ est obligatoire sur `Widget` depuis le 02/09 et les dix-neuf
 * widgets existants s'en servent. Un bloc, lui, charge par `bloc.donnees` :
 * sa matière n'est pas une liste d'`Element`. C'est exactement ce que font
 * déjà les deux widgets `forme: 'chiffres'` (`charger: async () => []`), et
 * suivre le précédent vaut mieux que rendre `charger` optionnel — ce qui
 * aurait obligé chacun de ses appelants à se garder.
 */
const VIDE = async (): Promise<Element[]> => [];

export const BLOCS_TABLEAU_DE_BORD: Widget[] = [
  {
    // ── LE POINT FOCAL ────────────────────────────────────────────────────
    // Premier et plus haut. C'est lui qui donne le ton de la page : un grand
    // nombre, puis la forme de la semaine.
    id: 'tdb-tendance',
    cleTitre: 'dashboard.section.trend',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocTendance,
      hauteur: GRAND,
      donnees: async (ctx) => {
        const d = await tableauDeBord(PERIODE);
        const jours = joursPleins(d.trend ?? []);
        return {
          jours,
          total: nombre(d.totals?.plays ?? 0, ctx.langue ?? 'fr'),
          actifs: jours.filter((j) => j.plays > 0).length,
        };
      },
    },
  },
  {
    id: 'tdb-semaine-heures',
    cleTitre: 'dashboard.section.weekday_hourly',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocSemaineHeures,
      hauteur: MOYEN,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        return { grille: grilleSemaine(d.weekday_hourly ?? []), periode: PERIODE };
      },
    },
  },
  {
    id: 'tdb-heures',
    cleTitre: 'dashboard.section.hourly',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocHeures,
      hauteur: PETIT,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        const par = Array(24).fill(0);
        for (const h of d.hourly ?? []) {
          if (h.hour >= 0 && h.hour < 24) par[h.hour] = h.plays;
        }
        return { parHeure: par };
      },
    },
  },
  {
    id: 'tdb-top-albums',
    cleTitre: 'dashboard.section.top_albums',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocClassement,
      hauteur: GRAND,
      donnees: async () => elementsAlbums(await tableauDeBord(PERIODE)),
    },
  },
  {
    id: 'tdb-top-titres',
    cleTitre: 'dashboard.section.top_tracks',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocClassement,
      hauteur: GRAND,
      donnees: async () => elementsTitres(await tableauDeBord(PERIODE)),
    },
  },
  {
    id: 'tdb-genres',
    cleTitre: 'dashboard.genreBranches',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocBarres,
      hauteur: GRAND,
      donnees: async () => {
        // 🔴 L'arbre des genres ne doit PAS emporter le bloc. Il est un
        // confort de regroupement : sans lui, tout retombe sur « Hors arbre »,
        // ce qui reste plus utile qu'un bloc en échec.
        const [d, arbre] = await Promise.all([
          tableauDeBord(PERIODE),
          api.getGenreTree().then((r: any) => r?.tree ?? {}).catch(() => ({})),
        ]);
        return { lignes: branches(d.by_genre ?? [], arbre), plafond: PLAFOND_GENRES };
      },
    },
  },
  {
    id: 'tdb-zones',
    cleTitre: 'dashboard.section.by_zone',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocBarres,
      hauteur: MOYEN,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        return {
          lignes: (d.by_zone ?? []).map((z) => ({
            label: z.zone_name ?? `#${z.zone_id ?? '?'}`,
            valeur: z.plays,
          })),
        };
      },
    },
  },
  {
    id: 'tdb-sources',
    cleTitre: 'dashboard.section.by_source',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocBarres,
      hauteur: MOYEN,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        return {
          lignes: (d.by_source ?? []).map((s) => ({ label: s.source ?? '—', valeur: s.plays })),
        };
      },
    },
  },
  {
    id: 'tdb-ce-jour-la',
    cleTitre: 'dashboard.onThisDay',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocCeJourLa,
      hauteur: MOYEN,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        return {
          lignes: (d.on_this_day ?? []).slice(0, 8).map((o) => ({
            annee: o.year ?? null,
            titre: o.track_title ?? '—',
            artiste: o.artist_name ?? null,
          })),
        };
      },
    },
  },
  {
    id: 'tdb-serie',
    cleTitre: 'dashboard.section.streak',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocSerie,
      hauteur: PETIT,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        return { courante: d.streak?.current ?? 0, record: d.streak?.best ?? 0 };
      },
    },
  },
  {
    id: 'tdb-completion',
    cleTitre: 'dashboard.section.completion',
    forme: 'bloc',
    charger: VIDE,
    bloc: {
      composant: BlocCompletion,
      hauteur: PETIT,
      donnees: async () => {
        const d = await tableauDeBord(PERIODE);
        return { completes: d.completion?.completed ?? 0, passes: d.completion?.skipped ?? 0 };
      },
    },
  },
];

/**
 * LA DISPOSITION PAR DÉFAUT — l'ordre, et donc le rythme de la page.
 *
 * Ce n'est pas l'ordre de l'ancien écran : c'est celui que la consigne de
 * design du 25/09 demande. Un bloc dominant en haut qui ancre le regard, puis
 * des blocs plus petits et réguliers.
 *
 *   1. Tendance            GRAND   — le point focal : un grand nombre, la semaine
 *   2. Jour × heure        MOYEN   — la signature visuelle, sa grille dense
 *   3. Heures              PETIT   — la journée en vingt-quatre cases
 *   4. Albums              GRAND   — les deux classements, même taille, se
 *   5. Titres              GRAND     répondent l'un l'autre
 *   6. Genres              GRAND   — la plus longue des listes de barres
 *   7. Zones               MOYEN   — les deux « par … », même taille, appariés
 *   8. Sources             MOYEN
 *   9. Ce jour-là          MOYEN
 *  10. Série               PETIT   — les deux petits chiffres ferment la page
 *  11. Complétion          PETIT
 *
 * Les tailles descendent par paliers et les blocs de même nature portent la
 * même hauteur : c'est ce qui fait que la page se lit de haut en bas au lieu
 * de se regarder morceau par morceau.
 *
 * ⚠️ Contrairement à l'accueil, TOUT est au défaut ici. La règle « personne ne
 * doit voir son écran changer sans l'avoir demandé » protège un écran qu'on a
 * déjà ; celui-ci est neuf, et un écran neuf VIDE ne se lirait pas comme un
 * choix mais comme une panne. Chacun retire ensuite ce qu'il ne veut pas.
 */
export const DISPOSITION_DEFAUT_TABLEAU_DE_BORD = BLOCS_TABLEAU_DE_BORD.map((w) => w.id);
