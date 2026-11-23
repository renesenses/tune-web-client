/**
 * LE CHOIX D'UNE ANNÉE OU D'UNE PÉRIODE EN UNE LISTE — fil 3009 (FabienM,
 * 1.0.0-rc13), point 19.
 *
 * « Menu bibliothèque : onglet albums : filtre sur année : très lourd la barre
 * de sélection de l'année, de plus elle prend beaucoup de place, ce qui laisse
 * peu d'espace à l'écran pour afficher les albums. Proposer une solution de
 * sélection d'une période et d'une année plus simple qui tienne dans la ligne
 * "Année retenue, origine sinon édition, …" »
 *
 * La vue Années montrait TROIS rangées (année retenue, champs De / À, frise de
 * 60 px avec curseur et poignées). Le choix tient désormais dans UNE liste
 * native, posée dans la ligne « Année retenue » :
 *
 *   Toutes les années
 *   ── 1970–1979 ──
 *      Toute la décennie 1970–1979 (12)
 *      1971 (3)
 *      1975 (9)
 *   ── 1980–1989 ── …
 *   Autre période…           → les deux champs De / À, dans la même ligne
 *
 * Une liste native se parcourt au clavier sans rien apprendre (flèches,
 * initiale, Entrée), se lit par un lecteur d'écran, et s'ouvre en roue sur un
 * téléphone. Seules les années qui ont un album y figurent : la frise montrait
 * aussi les années vides pour dessiner un axe, une liste n'en a pas besoin.
 *
 * La frise n'est pas supprimée : un bouton la déplie sous la ligne pour qui
 * veut balayer les années au survol. C'est là, et là seulement, que l'aperçu
 * au survol garde un sens — une liste native n'émet pas de survol.
 *
 * Ce module ne porte que les règles, sans écran.
 */
import { SANS_PERIODE, periodePosee, bornesPeriode, type Periode } from './periodeAnnees';

export interface BarreAnnee {
  year: number;
  n: number;
}

export interface DecennieDeLaListe {
  /** La première année de la décennie : 1970 pour 1970–1979. */
  decennie: number;
  /** Les albums de toute la décennie. */
  n: number;
  /** Ses années qui ont au moins un album, dans l'ordre demandé. */
  annees: BarreAnnee[];
}

/**
 * Les décennies et leurs années, d'après les barres de la frise (une par
 * année, vides comprises). Ordre : `desc` = plus récent d'abord, comme la
 * grille (`ordreAnnee`).
 */
export function decenniesDeLaListe(bars: readonly BarreAnnee[], ordre: 'asc' | 'desc' = 'desc'): DecennieDeLaListe[] {
  const parDecennie = new Map<number, BarreAnnee[]>();
  for (const b of bars) {
    if (!(b.n > 0)) continue;
    const d = Math.floor(b.year / 10) * 10;
    const liste = parDecennie.get(d) ?? [];
    liste.push({ year: b.year, n: b.n });
    parDecennie.set(d, liste);
  }
  const sens = ordre === 'desc' ? -1 : 1;
  return [...parDecennie.entries()]
    .sort(([a], [b]) => (a - b) * sens)
    .map(([decennie, annees]) => ({
      decennie,
      n: annees.reduce((s, x) => s + x.n, 0),
      annees: annees.sort((a, b) => (a.year - b.year) * sens),
    }));
}

/** La valeur de la liste : `''` (tout), `a:1975`, `d:1970` ou `perso`. */
export type ValeurChoix = '' | 'perso' | `a:${number}` | `d:${number}`;

/** La période couvre-t-elle EXACTEMENT une décennie ? */
function decennieDe(p: Periode): number | null {
  const { de, a } = bornesPeriode(p);
  return de != null && a != null && de % 10 === 0 && a === de + 9 ? de : null;
}

/**
 * Ce que la liste affiche pour l'état de l'écran : l'année figée d'abord
 * (`fYear`, posée aussi depuis l'écran de lecture), puis la période.
 */
export function valeurDuChoix(annee: number | null, periode: Periode): ValeurChoix {
  if (annee != null) return `a:${annee}`;
  if (!periodePosee(periode)) return '';
  const d = decennieDe(periode);
  return d != null ? `d:${d}` : 'perso';
}

export interface EffetDuChoix {
  annee: number | null;
  periode: Periode;
  /** Ouvrir les champs De / À (« Autre période… »). */
  perso: boolean;
}

/**
 * Ce que produit un choix dans la liste. Une année et une période ne se
 * cumulent pas : en choisir une retire l'autre. « Autre période… » garde la
 * période en cours, s'il y en a une, et ouvre les champs pour la corriger.
 */
export function effetDuChoix(v: string, periodeCourante: Periode): EffetDuChoix {
  const an = /^a:(\d{3,4})$/.exec(v);
  if (an) return { annee: Number(an[1]), periode: SANS_PERIODE, perso: false };
  const dec = /^d:(\d{3,4})$/.exec(v);
  if (dec) {
    const d = Number(dec[1]);
    return { annee: null, periode: { de: d, a: d + 9 }, perso: false };
  }
  if (v === 'perso') return { annee: null, periode: periodeCourante, perso: true };
  return { annee: null, periode: SANS_PERIODE, perso: false };
}
