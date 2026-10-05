import type { Concert } from './api';

/**
 * L'ordre de la liste de l'écran Concerts — demande de FabienM, fil 2013,
 * point 1 : « permettre de trier sur la date de concert pour afficher les
 * artistes qui se produisent dans les prochaines dates ».
 *
 * Deux ordres, et un seul choix à faire :
 *
 *  - `date` — le DÉFAUT depuis le 29/09/2026 (décision de Bertrand,
 *    web#1718) : une ligne par concert, la plus proche en tête, l'artiste
 *    porté en tête de chaque ligne. C'est la lecture « qui joue bientôt ».
 *  - `artiste` — l'ordre d'origine : un groupe par artiste, groupes rangés
 *    par nom. C'est ainsi qu'on cherche quand on part de ce qu'on écoute.
 *
 * 🔴 Le défaut n'est JAMAIS enregistré comme un choix (piège de #1650) : la
 * préférence `concertsTri` vaut `null` tant que l'utilisateur n'a pas cliqué,
 * et c'est ici, à l'affichage, que `null` devient `date`. Changer le défaut
 * plus tard atteindra donc tous ceux qui n'ont rien choisi.
 *
 * ⚠️ Le tri vit ICI, pas dans le gabarit : il se mesure sur des DONNÉES
 * (liste en entrée, ordre en sortie), et non sur la lecture d'un `.svelte`.
 *
 * Le serveur rend aujourd'hui `upcoming` déjà croissant (mesuré le 28/09/2026
 * sur 192.168.1.18 : 57 concerts, 32 artistes, `event_date` en `YYYY-MM-DD`,
 * ordre croissant). On ne s'y FIE PAS : c'est un fait d'observation, pas un
 * contrat écrit, et le regroupement par artiste le détruisait de toute façon.
 */
export type TriConcerts = 'artiste' | 'date';

export const TRIS_CONCERTS = ['artiste', 'date'] as const;

/** « Par date », les plus proches d'abord — web#1718, Bertrand, 29/09/2026. */
export const TRI_CONCERTS_DEFAUT: TriConcerts = 'date';

/**
 * Ramène n'importe quoi à un tri connu. `null` (rien choisi), une préférence
 * enregistrée par une version future — ou effacée à moitié — ne doit pas
 * vider la liste : elle retombe sur le défaut.
 */
export function normaliserTriConcerts(valeur: unknown): TriConcerts {
  return valeur === 'date' || valeur === 'artiste' ? valeur : TRI_CONCERTS_DEFAUT;
}

/** Un bloc de la liste : un artiste en tête, et les dates qui lui reviennent. */
export interface GroupeConcerts {
  /** Clé de boucle Svelte — stable, et unique même sur deux lignes jumelles. */
  cle: string;
  /** Le nom porté en tête du bloc. */
  artiste: string;
  concerts: Concert[];
  /**
   * Clé de boucle de chaque date du bloc, dans l'ordre de `concerts` — web#1856.
   *
   * Le greffon ne rend aucun identifiant d'événement, et deux concerts peuvent
   * partager date, artiste, ville et salle : deux soirs Muse jumeaux à Nanterre
   * le 27/11, vus dans la capture réseau du 02/10. La clé `date + salle + ville`
   * du gabarit se répétait, et Svelte levait `each_key_duplicate` à chaque
   * ouverture de l'écran rangé par artiste. Le rang de la ligne parmi ses
   * jumelles départage : la clé reste la même tant que la liste ne change pas.
   */
  cles: string[];
}

/** Les clés des dates d'un bloc : les champs du concert, puis son rang parmi
 *  les lignes qui ont exactement les mêmes champs. Uniques par construction. */
function clesDesDates(concerts: readonly Concert[]): string[] {
  const vues = new Map<string, number>();
  return concerts.map((c) => {
    const base = [c.event_date, c.artist_name, c.city ?? '', c.venue ?? '', c.event_url ?? ''].join('|');
    const rang = vues.get(base) ?? 0;
    vues.set(base, rang + 1);
    return `${base}#${rang}`;
  });
}

/**
 * La date d'un concert, réduite à une clé comparable.
 *
 * `event_date` est une date ISO `YYYY-MM-DD` : la comparaison de chaînes suffit
 * et ne dépend d'aucun fuseau. Tout ce qui n'a PAS cette forme — champ vide,
 * date libre d'une source future — passe en fin de liste plutôt que de
 * disparaître : une ligne mal datée reste une ligne que l'utilisateur voit.
 */
function cleDate(c: Concert): string {
  const brut = (c.event_date ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(brut) ? `0${brut}` : `1${brut}`;
}

/** Départage deux concerts de même date : l'artiste, puis le lieu. */
function departager(a: Concert, b: Concert): number {
  const parNom = (a.artist_name ?? '').localeCompare(b.artist_name ?? '');
  if (parNom !== 0) return parNom;
  const parVille = (a.city ?? '').localeCompare(b.city ?? '');
  if (parVille !== 0) return parVille;
  return (a.venue ?? '').localeCompare(b.venue ?? '');
}

function parDate(a: Concert, b: Concert): number {
  const ka = cleDate(a);
  const kb = cleDate(b);
  if (ka < kb) return -1;
  if (ka > kb) return 1;
  return departager(a, b);
}

/**
 * La liste rendue à l'écran, dans l'ordre demandé.
 *
 * Ne modifie JAMAIS le tableau reçu : il vient d'un `$state` Svelte, et le
 * trier sur place déclencherait une boucle de réactivité.
 */
export function grouperConcerts(
  concerts: readonly Concert[] | null | undefined,
  tri: unknown = TRI_CONCERTS_DEFAUT,
): GroupeConcerts[] {
  const liste = [...(concerts ?? [])];
  if (liste.length === 0) return [];

  if (normaliserTriConcerts(tri) === 'date') {
    const triee = liste.sort(parDate);
    // Les clés se calculent sur TOUTE la liste : deux jumelles, chacune dans
    // son bloc d'une ligne, gardent quand même deux clés distinctes.
    const cles = clesDesDates(triee);
    return triee.map((c, i) => ({
      cle: `${i}|${c.event_date}|${c.artist_name}|${c.city ?? ''}|${c.venue ?? ''}`,
      artiste: c.artist_name,
      concerts: [c],
      cles: [cles[i]],
    }));
  }

  const groupes = new Map<string, Concert[]>();
  for (const c of liste) {
    const dates = groupes.get(c.artist_name) ?? [];
    dates.push(c);
    groupes.set(c.artist_name, dates);
  }
  return [...groupes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    // Dans un groupe, la prochaine date d'abord : « les prochaines dates » de
    // la demande valent aussi quand on lit par artiste.
    .map(([artiste, dates]) => {
      const triees = dates.sort(parDate);
      return { cle: `a|${artiste}`, artiste, concerts: triees, cles: clesDesDates(triees) };
    });
}
