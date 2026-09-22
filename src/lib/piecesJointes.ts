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
