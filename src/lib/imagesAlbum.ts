/**
 * Fil forum 3050 (Manfred, GO du 24/11/2026) — toutes les IMAGES du dossier
 * d'un album de la bibliothèque : scans du livret, dos, disque, inlay… comme
 * le fait Roon, et pas seulement le livret PDF quand il y en a un.
 *
 *  - `GET /library/albums/{id}/images` →
 *    `{ images: [{ id, name, folder, size, mime }] }` : les images rangées
 *    avec les pistes, puis celles des sous-dossiers usuels (`Scans`,
 *    `Artwork`, `Covers`…) ;
 *  - `GET /library/albums/{id}/images/{image_id}` sert l'image, et
 *    `?size=400` sa vignette JPEG.
 *
 * Le client ne transmet JAMAIS de nom ni de chemin : seulement l'identifiant
 * que la liste lui a donné (16 hexadécimaux). Un serveur antérieur répond
 * 404 sur la liste : la fiche n'affiche alors simplement aucune galerie.
 */
export interface ImageAlbum {
  id: string;
  nom: string;
  /** Le sous-dossier (`Scans`…) d'où elle vient, `null` à côté des pistes. */
  dossier: string | null;
  /** Vignette pour la grille. */
  vignette: string;
  /** L'image entière, pour la vue plein écran. */
  url: string;
}

/** Taille de vignette demandée pour la grille (une case du serveur). */
export const TAILLE_VIGNETTE = 400;

const ID_IMAGE = /^[0-9a-f]{16}$/;

/** L'adresse d'une image de l'album (avant `urlNavigateur`). */
export function urlImageAlbum(base: string, albumId: number, id: string, taille?: number): string {
  const u = `${base}/library/albums/${albumId}/images/${encodeURIComponent(id)}`;
  return taille ? `${u}?size=${taille}` : u;
}

export interface LecteursImages {
  base: string;
  liste: (albumId: number) => Promise<{ images?: Array<Record<string, unknown>> } | null | undefined>;
  /** `urlNavigateur` — le jeton du pont pour une ressource chargée par `<img>`. */
  navigateur: (url: string) => string;
}

/** Les images à montrer ; une erreur (serveur ancien, panne) n'en montre aucune. */
export async function chargerImagesAlbum(albumId: number, l: LecteursImages): Promise<ImageAlbum[]> {
  if (!Number.isInteger(albumId) || albumId <= 0) return [];
  try {
    const r = await l.liste(albumId);
    const brutes = Array.isArray(r?.images) ? r!.images! : [];
    const vus = new Set<string>();
    const images: ImageAlbum[] = [];
    for (const b of brutes) {
      const id = typeof b?.id === 'string' ? b.id : '';
      if (!ID_IMAGE.test(id) || vus.has(id)) continue;
      vus.add(id);
      images.push({
        id,
        nom: typeof b.name === 'string' ? b.name : '',
        dossier: typeof b.folder === 'string' && b.folder ? b.folder : null,
        vignette: l.navigateur(urlImageAlbum(l.base, albumId, id, TAILLE_VIGNETTE)),
        url: l.navigateur(urlImageAlbum(l.base, albumId, id)),
      });
    }
    return images;
  } catch {
    return [];
  }
}

/**
 * La touche du clavier dans la vue plein écran : l'indice suivant, `null`
 * pour fermer, `undefined` si la touche ne concerne pas la galerie. Les
 * flèches bouclent (après la dernière, la première).
 */
export function indiceApresTouche(touche: string, indice: number, total: number): number | null | undefined {
  if (total <= 0) return touche === 'Escape' ? null : undefined;
  switch (touche) {
    case 'Escape':
      return null;
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
      return (indice + 1) % total;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return (indice - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return undefined;
  }
}

/** Le libellé d'une image : son nom sans extension, précédé du sous-dossier. */
export function libelleImage(image: Pick<ImageAlbum, 'nom' | 'dossier'>): string {
  const nom = image.nom.replace(/\.(jpe?g|png|webp|gif)$/i, '');
  return image.dossier ? `${image.dossier} · ${nom}` : nom;
}
