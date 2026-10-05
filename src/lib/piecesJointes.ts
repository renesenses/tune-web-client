/**
 * Pièces jointes d'un formulaire : chaque sélection S'AJOUTE à la liste.
 *
 * renesenses/tune-server-rust#4664 — jfpaquet annonce trois captures dans
 * « Écrire au support », une seule arrive. Aucune borne de la chaîne ne
 * plafonne à un fichier (client, serveur et site en acceptent cinq) : c'est
 * le champ qui REMPLAÇAIT sa liste à chaque passage,
 * `fichiers = Array.from(input.files)`. Choisir ses captures une par une —
 * trois clics, trois dossiers — n'en gardait que la dernière, sans erreur ni
 * message. Le `<input type="file">` natif remplace de toute façon sa propre
 * `FileList` à chaque ouverture du sélecteur : c'est donc à nous de cumuler.
 */

/** Même fichier choisi deux fois : même nom, même taille, même date. */
function cle(f: File): string {
  return `${f.name}\u0000${f.size}\u0000${f.lastModified}`;
}

/**
 * La liste existante, suivie des fichiers nouvellement choisis qu'elle ne
 * contient pas déjà. L'ordre de sélection est conservé.
 */
export function cumulerFichiers(existants: readonly File[], nouveaux: Iterable<File> | null | undefined): File[] {
  const vus = new Set(existants.map(cle));
  const out = [...existants];
  for (const f of nouveaux ?? []) {
    const k = cle(f);
    if (vus.has(k)) continue;
    vus.add(k);
    out.push(f);
  }
  return out;
}

/** La liste privée du fichier d'indice `index` (hors bornes : inchangée). */
export function retirerFichier(existants: readonly File[], index: number): File[] {
  return existants.filter((_, i) => i !== index);
}

/**
 * Ce que le support admet en pièce jointe — web#1905 (Levente Toth, fil 2134,
 * ticket 227 : la vidéo d'un défaut visuel, choisie sans un mot, refusée à
 * l'envoi).
 *
 * La liste est celle du site, qui fait autorité : `StoreSupportTicketRequest`
 * (`mimes:log,txt,zip,json,csv,xml,md,png,jpg,jpeg`, `max:51200` Ko), recopiée
 * telle quelle par le serveur (`ALLOWED_EXT` et `MAX_FILE_BYTES` de
 * `tune-server/src/routes/support.rs`). Le champ la porte en `accept`, et
 * `refusPieceJointe` la rappelle dès le choix : `accept` n'est qu'une
 * suggestion, le sélecteur laisse passer « Tous les fichiers ».
 */
export const EXTENSIONS_PIECES_JOINTES = ['log', 'txt', 'zip', 'json', 'csv', 'xml', 'md', 'png', 'jpg', 'jpeg'] as const;

/** La valeur de l'attribut `accept` du champ. */
export const ACCEPT_PIECES_JOINTES = EXTENSIONS_PIECES_JOINTES.map((e) => `.${e}`).join(',');

/** 50 Mo par fichier, comme le site (`max:51200`, en Ko). */
export const MAX_PIECE_JOINTE_OCTETS = 50 * 1024 * 1024;

/** Pourquoi un fichier serait refusé par le support, ou `null` s'il passe. */
export function refusPieceJointe(f: Pick<File, 'name' | 'size'>): 'type' | 'taille' | null {
  const point = f.name.lastIndexOf('.');
  const ext = point >= 0 ? f.name.slice(point + 1).toLowerCase() : '';
  if (!(EXTENSIONS_PIECES_JOINTES as readonly string[]).includes(ext)) return 'type';
  if (f.size > MAX_PIECE_JOINTE_OCTETS) return 'taille';
  return null;
}
