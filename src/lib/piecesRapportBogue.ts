/**
 * Pièces jointes du rapport de bogue envoyé au forum : captures ET journaux.
 *
 * renesenses/tune-server-rust#7920 — le champ n'acceptait que des images
 * (#4564) : un testeur ne pouvait pas joindre son `tune.log`. Le site range
 * désormais aussi des journaux avec le fil (site-mozaiklabs#471) ; le serveur
 * les relaie sous `attachments[]`, les images restant sous `images[]`.
 *
 * Les bornes sont celles du serveur (`BUG_REPORT_*` de
 * `tune-server/src/routes/system/diagnostics.rs`), qui les tient du site :
 * 3 images de 4 Mo, et 3 journaux de 10 Mo en plus.
 */

export const BUG_REPORT_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
export const BUG_REPORT_ATTACHMENT_EXT = ['log', 'txt', 'json', 'zip'] as const;

export const BUG_REPORT_MAX_IMAGES = 3;
export const BUG_REPORT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const BUG_REPORT_MAX_ATTACHMENTS = 3;
export const BUG_REPORT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * La valeur de l'attribut `accept` du champ. Les types d'image d'abord : le
 * champ reste repérable comme celui des captures (`accept^="image/"`).
 */
export const ACCEPT_RAPPORT_BOGUE = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  ...BUG_REPORT_ATTACHMENT_EXT.map((e) => `.${e}`),
].join(',');

export type FamillePiece = 'image' | 'journal';

/** La famille d'un fichier d'après son extension, ou `null` s'il est refusé. */
export function familleDePiece(nom: string): FamillePiece | null {
  const point = nom.lastIndexOf('.');
  const ext = point >= 0 ? nom.slice(point + 1).toLowerCase() : '';
  if ((BUG_REPORT_IMAGE_EXT as readonly string[]).includes(ext)) return 'image';
  if ((BUG_REPORT_ATTACHMENT_EXT as readonly string[]).includes(ext)) return 'journal';
  return null;
}

/** Un refus : la clé de traduction et ses paramètres. */
export interface RefusPieceRapport {
  cle: string;
  params: Record<string, string | number>;
}

/**
 * Pourquoi la liste choisie serait refusée, ou `null` si elle passe.
 * Même ordre que le serveur : type, nombre, puis taille.
 */
export function refusPiecesRapport(fichiers: readonly Pick<File, 'name' | 'size'>[]): RefusPieceRapport | null {
  const inconnu = fichiers.find((f) => familleDePiece(f.name) === null);
  if (inconnu) return { cle: 'v2.sup.bugImagesType', params: { nom: inconnu.name } };

  const images = fichiers.filter((f) => familleDePiece(f.name) === 'image');
  const journaux = fichiers.filter((f) => familleDePiece(f.name) === 'journal');
  if (images.length > BUG_REPORT_MAX_IMAGES) {
    return { cle: 'v2.sup.bugImagesTooMany', params: { max: BUG_REPORT_MAX_IMAGES } };
  }
  if (journaux.length > BUG_REPORT_MAX_ATTACHMENTS) {
    return { cle: 'v2.sup.bugLogsTooMany', params: { max: BUG_REPORT_MAX_ATTACHMENTS } };
  }

  const imageLourde = images.find((f) => f.size > BUG_REPORT_MAX_IMAGE_BYTES);
  if (imageLourde) {
    return {
      cle: 'v2.sup.bugImagesTooLarge',
      params: { nom: imageLourde.name, max: Math.round(BUG_REPORT_MAX_IMAGE_BYTES / (1024 * 1024)) },
    };
  }
  const journalLourd = journaux.find((f) => f.size > BUG_REPORT_MAX_ATTACHMENT_BYTES);
  if (journalLourd) {
    return {
      cle: 'v2.sup.bugImagesTooLarge',
      params: { nom: journalLourd.name, max: Math.round(BUG_REPORT_MAX_ATTACHMENT_BYTES / (1024 * 1024)) },
    };
  }
  return null;
}
