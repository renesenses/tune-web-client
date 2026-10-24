/**
 * tune-server-rust#6288 — MetaRust, « Albums manquants » : la discographie
 * MusicBrainz d'un artiste identifié (groupes Album et EP), moins la
 * bibliothèque. `GET /library/artists/{id}/missing-albums[?secondaires=1]`.
 *
 * La première lecture d'une discographie va au rythme de MusicBrainz (une
 * requête par seconde, jusqu'à quinze pour un artiste prolifique) : l'écran ne
 * la déclenche qu'à la demande, jamais à l'ouverture de la fiche.
 */
export type StatutManquants =
  | 'ok'
  | 'non_identifie'
  | 'inconnu'
  | 'indisponible'
  | 'sans_album'
  // Pas un statut du serveur : une réponse 500 `code: bibliotheque_illisible`,
  // traduite ici pour que l'écran dise CE qui a échoué.
  | 'bibliotheque_illisible';

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
    case 'sans_album':
      return 'v2.manquants.sansAlbum';
    case 'bibliotheque_illisible':
      return 'v2.manquants.bibliothequeIllisible';
    default:
      return (r.manquants?.length ?? 0) > 0 ? 'v2.manquants.compte' : 'v2.manquants.aucun';
  }
}

/** Le code d'erreur que rend le serveur quand la bibliothèque est illisible. */
export const CODE_BIBLIOTHEQUE_ILLISIBLE = 'bibliotheque_illisible';

/**
 * La réponse à afficher pour une requête en ÉCHEC : une bibliothèque illisible
 * (500, `code: bibliotheque_illisible`) a sa propre phrase ; tout autre échec
 * (réseau, serveur antérieur) reste « MusicBrainz ne répond pas ».
 */
export function reponseDEchec(e: unknown): ReponseManquants {
  const code = (e as { code?: unknown } | null)?.code;
  return { statut: code === CODE_BIBLIOTHEQUE_ILLISIBLE ? 'bibliotheque_illisible' : 'indisponible' };
}

// ---------------------------------------------------------------------------
// « Écouter » et « Ajouter aux favoris » — la suite de #6288
// ---------------------------------------------------------------------------

/** Un album manquant trouvé chez un service connecté. */
export interface ManqueSurUnService {
  service: string;
  /** L'identifiant de l'album CHEZ le service. */
  sourceId: string;
  album: { title?: string | null; artist_name?: string | null; cover_path?: string | null; artist_id?: unknown };
}

/** Les sections d'albums de service que la fiche d'artiste a déjà chargées. */
export interface SectionDeService {
  service: string;
  albums: { title?: string | null; source_id?: unknown; artist_name?: string | null; cover_path?: string | null; artist_id?: unknown }[];
}

/**
 * La clé d'un titre d'album pour l'apparier entre MusicBrainz et un service :
 * sans accents, minuscules, ponctuation et espaces resserrés, et sans la
 * mention d'édition finale entre parenthèses ou crochets que les services
 * ajoutent (« Kind of Blue (Legacy Edition) », « Abbey Road [Remastered] »).
 */
export function cleDeTitre(titre: string | null | undefined): string {
  let t = (titre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Les mentions finales, une ou plusieurs : « (Deluxe) [Remastered 2009] ».
  for (;;) {
    const sans = t.replace(/\s*[([][^()[\]]*[)\]]\s*$/, '').trim();
    if (sans === t || !sans) break;
    t = sans;
  }
  return t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * L'album manquant `titre`, chez le premier service qui l'a (dans l'ordre des
 * sections), ou `null`. Un titre ne s'apparie qu'à un titre IDENTIQUE une fois
 * la clé faite : « Kind of Blue » ne trouve ni « Kind of Blue Live » ni
 * « Blue ». Un album sans identifiant chez son service n'est pas retenu : il
 * ne serait ni jouable ni mis en favori.
 */
export function trouverSurUnService(
  titre: string | null | undefined,
  sections: readonly SectionDeService[] | null | undefined,
): ManqueSurUnService | null {
  const cle = cleDeTitre(titre);
  if (!cle) return null;
  for (const s of sections ?? []) {
    for (const a of s.albums ?? []) {
      const id = a?.source_id == null ? '' : String(a.source_id).trim();
      if (id && cleDeTitre(a.title) === cle) return { service: s.service, sourceId: id, album: a };
    }
  }
  return null;
}
