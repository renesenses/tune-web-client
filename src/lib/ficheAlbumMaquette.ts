/**
 * La fiche album d'après la maquette de Levente (Figma 611:5805-5807, rc12).
 *
 * Ce module ne fait que METTRE EN FORME ce que le serveur sert déjà : la
 * colonne de droite (artiste, interprètes, détails, autres albums) et les
 * lignes de l'onglet Versions (#7617). Règle de la maquette : un bloc sans
 * donnée est MASQUÉ — chaque fonction rend une liste vide ou `null`, jamais
 * un zéro ni un texte de remplissage.
 */
import { blocsDeCredits, libelleLigne, type CreditAvecPiste } from './library/credits';
import { resolution, type VersionAlbum } from './oeuvres';
import { libelleNombreCanaux } from './utils';

/** Une ligne du bloc « Détails de l'album » : la clé i18n et la valeur. */
export interface LigneDetail { cle: string; valeur: string }

interface AlbumDetaille {
  genre?: string | null;
  genres?: string | null;
  label?: string | null;
  format?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
}

/**
 * Sortie, genre, label, format : seulement ce qui est connu. `annee` est le
 * texte que la fiche affiche déjà (`formatAnneeAlbum`), pour que les deux
 * endroits disent la même chose.
 */
export function detailsAlbum(a: AlbumDetaille, annee: string | null | undefined): LigneDetail[] {
  const lignes: LigneDetail[] = [];
  const ajouter = (cle: string, v: string | null | undefined) => {
    const t = (v ?? '').trim();
    if (t) lignes.push({ cle, valeur: t });
  };
  ajouter('v2.album.fiche.release', annee);
  ajouter('v2.album.fiche.genre', a.genres || a.genre);
  ajouter('v2.album.fiche.label', a.label);
  const res = resolution({ sample_rate: a.sample_rate ?? null, bit_depth: a.bit_depth ?? null });
  ajouter('v2.album.fiche.format', [a.format ? a.format.toUpperCase() : '', res].filter(Boolean).join(' · '));
  return lignes;
}

/** Un interprète de la colonne : son nom et ce qu'il fait sur le disque. */
export interface Interprete { nom: string; artist_id: number | null; roles: string[] }

/**
 * Les interprètes du disque, une fois chacun, avec leurs instruments ou
 * rôles — la famille « interprètes » de la fiche des crédits (#1572), dans
 * le même ordre. `max` borne la colonne ; l'onglet Crédits a la liste entière.
 */
export function interpretesAlbum(
  credits: CreditAvecPiste[],
  traduire: (cle: string) => string,
  max = 6,
): Interprete[] {
  const parNom = new Map<string, Interprete>();
  for (const bloc of blocsDeCredits(credits)) {
    if (bloc.famille !== 'interpretes') continue;
    for (const ligne of bloc.lignes) {
      const role = libelleLigne(ligne, traduire);
      for (const a of ligne.artistes) {
        const cle = a.artist_id != null ? `#${a.artist_id}` : a.artist_name.toLowerCase();
        let p = parNom.get(cle);
        if (!p) { p = { nom: a.artist_name, artist_id: a.artist_id, roles: [] }; parNom.set(cle, p); }
        if (role && !p.roles.includes(role)) p.roles.push(role);
      }
    }
  }
  return [...parNom.values()].slice(0, Math.max(0, max));
}

/**
 * Les pastilles d'une version : année, canaux, format, résolution — ce qui
 * est connu seulement. Le numéro de catalogue de la maquette n'est pas servi
 * par `/library/albums/{id}/versions` : il n'apparaît pas.
 */
export function pastillesVersion(v: VersionAlbum): string[] {
  return [
    v.year ? String(v.year) : '',
    libelleNombreCanaux(v.max_channels) ?? '',
    v.format ? v.format.toUpperCase() : '',
    resolution(v),
  ].filter(Boolean);
}

/** Le titre d'une ligne de version : son nom d'édition, sinon le titre. */
export function titreVersion(v: VersionAlbum): string {
  return (v.version_name ?? '').trim() || v.title;
}

/**
 * « Plus de cet artiste » : ses autres albums, sans celui qu'on regarde ni
 * ses autres versions (elles sont dans l'onglet Versions). Vide quand il n'y
 * en a pas : le bloc disparaît.
 */
export function autresAlbumsDeLArtiste<A extends { id?: number | null }>(
  albums: A[] | null | undefined,
  exclus: Iterable<number>,
  max = 3,
): A[] {
  const sans = new Set(exclus);
  const vus = new Set<number>();
  const sortie: A[] = [];
  for (const a of albums ?? []) {
    if (a?.id == null || sans.has(a.id) || vus.has(a.id)) continue;
    vus.add(a.id);
    sortie.push(a);
    if (sortie.length >= max) break;
  }
  return sortie;
}
