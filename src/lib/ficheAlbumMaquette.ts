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
import { trouverArtisteExact } from './libraryNavigation';

/**
 * Les genres d'un album, lisibles. Le serveur rend `genres` en CHAÎNE JSON
 * (`'["Rock"]'`, vu sur le .18 le 15/11 : le bloc affichait le JSON brut) ;
 * on accepte aussi un vrai tableau, ou une chaîne simple séparée par « , »
 * ou « ; ». Sans doublon, dans l'ordre reçu.
 */
export function listeDeGenres(v: unknown): string[] {
  let brut: unknown = v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { brut = JSON.parse(v); } catch { brut = v.replace(/[[\]"]/g, ''); }
  }
  const morceaux = Array.isArray(brut)
    ? brut.map((x) => (typeof x === 'string' ? x : x == null ? '' : String(x)))
    : typeof brut === 'string' ? brut.split(/[;,]/) : [];
  const vus = new Set<string>();
  const out: string[] = [];
  for (const m of morceaux) {
    const t = m.trim();
    if (t && !vus.has(t.toLowerCase())) { vus.add(t.toLowerCase()); out.push(t); }
  }
  return out;
}

/** Une ligne du bloc « Détails de l'album » : la clé i18n et la valeur. */
export interface LigneDetail { cle: string; valeur: string }

interface AlbumDetaille {
  genre?: string | null;
  genres?: string | string[] | null;
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
  const genres = listeDeGenres(a.genres);
  ajouter('v2.album.fiche.genre', genres.length ? genres.join(', ') : listeDeGenres(a.genre).join(', '));
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
 * Le numéro de catalogue d'une version (« CL 1355 »), que le serveur ajoute à
 * `/library/albums/{id}/versions` pour la rc12. Les deux graphies sont
 * acceptées ; un serveur antérieur ne l'envoie pas : `null`, rien affiché.
 */
export function numeroCatalogue(v: VersionAlbum): string | null {
  const brut = (v as { catalog_number?: unknown; catalogNumber?: unknown }).catalog_number
    ?? (v as { catalogNumber?: unknown }).catalogNumber;
  const t = typeof brut === 'string' ? brut.trim() : typeof brut === 'number' ? String(brut) : '';
  return t || null;
}

/**
 * Les pastilles d'une version : année, canaux, format, résolution, numéro de
 * catalogue — ce qui est connu seulement.
 */
export function pastillesVersion(v: VersionAlbum): string[] {
  return [
    v.year ? String(v.year) : '',
    libelleNombreCanaux(v.max_channels) ?? '',
    v.format ? v.format.toUpperCase() : '',
    resolution(v),
    numeroCatalogue(v) ?? '',
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

type ChercherArtistes = (nom: string) => Promise<{ artists?: { id?: number | null; name?: string | null; image_path?: string | null }[] } | null | undefined>;

/**
 * Le portrait de chaque interprète présent dans la BIBLIOTHÈQUE, retrouvé par
 * son nom EXACT (`trouverArtisteExact`, la règle des artistes similaires de la
 * page artiste) : jamais une image approchante. Le serveur n'a pas de route
 * groupée par noms : une recherche par interprète, `max` au plus, et un échec
 * laisse ce seul nom sans portrait (ses initiales).
 */
export async function portraitsInterpretes(
  noms: readonly string[],
  chercher: ChercherArtistes,
  max = 6,
): Promise<Record<string, string>> {
  const uniques = [...new Set(noms.map((n) => n?.trim()).filter((n): n is string => !!n))].slice(0, Math.max(0, max));
  const res = await Promise.allSettled(uniques.map(async (nom) => {
    const r = await chercher(nom);
    const id = trouverArtisteExact(r?.artists, nom);
    if (id == null) return null;
    const image = r?.artists?.find((a) => a?.id === id)?.image_path;
    return image ? ([nom, image] as const) : null;
  }));
  const out: Record<string, string> = {};
  for (const r of res) if (r.status === 'fulfilled' && r.value) out[r.value[0]] = r.value[1];
  return out;
}
