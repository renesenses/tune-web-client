/**
 * tune-server-rust#6288 — MetaRust, « Albums manquants » : la discographie
 * MusicBrainz d'un artiste identifié (groupes Album et EP), moins la
 * bibliothèque. `GET /library/artists/{id}/missing-albums[?secondaires=1]`.
 *
 * La première lecture d'une discographie va au rythme de MusicBrainz (une
 * requête par seconde, jusqu'à quinze pour un artiste prolifique) : l'écran ne
 * la déclenche qu'à la demande, jamais à l'ouverture de la fiche.
 */
export type StatutManquants = 'ok' | 'non_identifie' | 'inconnu' | 'indisponible';

export interface GroupeManquant {
  mbid: string;
  titre: string;
  type_primaire?: string | null;
  types_secondaires?: string[];
  premiere_sortie?: string | null;
}

export interface ReponseManquants {
  statut: StatutManquants;
  mbid?: string | null;
  manquants?: GroupeManquant[];
  possedes?: number;
  retenus?: number;
  tronquee?: boolean;
}

/** L'année d'une date MusicBrainz (`AAAA`, `AAAA-MM`, `AAAA-MM-JJ`), sinon null. */
export function anneeDe(date: string | null | undefined): string | null {
  const m = /^(\d{4})/.exec((date ?? '').trim());
  return m ? m[1] : null;
}

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La page MusicBrainz du groupe de parutions, ou null pour un identifiant douteux. */
export function lienMusicBrainz(mbid: string | null | undefined): string | null {
  const id = (mbid ?? '').trim();
  return MBID.test(id) ? `https://musicbrainz.org/release-group/${id.toLowerCase()}` : null;
}

/** La clé i18n de l'état à afficher, selon la réponse. */
export function cleEtat(r: ReponseManquants): string {
  switch (r.statut) {
    case 'non_identifie':
    case 'inconnu':
      return 'v2.manquants.nonIdentifie';
    case 'indisponible':
      return 'v2.manquants.indisponible';
    default:
      return (r.manquants?.length ?? 0) > 0 ? 'v2.manquants.compte' : 'v2.manquants.aucun';
  }
}
