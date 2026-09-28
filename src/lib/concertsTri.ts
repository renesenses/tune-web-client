import type { Concert } from './api';

/**
 * L'ordre de la liste de l'écran Concerts — demande de FabienM, fil 2013,
 * point 1 : « permettre de trier sur la date de concert pour afficher les
 * artistes qui se produisent dans les prochaines dates ».
 *
 * Deux ordres, et un seul choix à faire :
 *
 *  - `artiste` — l'ordre d'origine, et le DÉFAUT : un groupe par artiste,
 *    groupes rangés par nom. C'est ainsi qu'on cherche quand on part de ce
 *    qu'on écoute. L'écran de qui n'a rien demandé ne change pas d'ordre.
 *  - `date` — une ligne par concert, la plus proche en tête, l'artiste porté
 *    en tête de chaque ligne. C'est la lecture « qui joue bientôt ».
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

/** L'ordre d'origine : changer de défaut changerait l'écran de tout le monde. */
export const TRI_CONCERTS_DEFAUT: TriConcerts = 'artiste';

/**
 * Ramène n'importe quoi à un tri connu. Une préférence enregistrée par une
 * version future — ou effacée à moitié — ne doit pas vider la liste : elle
 * retombe sur l'ordre d'origine.
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
    return liste
      .sort(parDate)
      .map((c, i) => ({
        cle: `${i}|${c.event_date}|${c.artist_name}|${c.city ?? ''}|${c.venue ?? ''}`,
        artiste: c.artist_name,
        concerts: [c],
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
    .map(([artiste, dates]) => ({ cle: `a|${artiste}`, artiste, concerts: dates.sort(parDate) }));
}
