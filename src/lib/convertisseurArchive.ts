/**
 * Le nom sous lequel l'archive du Convertisseur est enregistrée
 * (tune-server-rust#5482).
 *
 * Xavier Joly, 0.9.168 : « Renommer le zip par le nom de l'album avant
 * téléchargement pour plus de lisibilité. »
 *
 * L'archive est téléchargée par `fetch`, puis offerte par une URL `blob:`.
 * Un `<a download>` SANS valeur nomme alors le fichier d'après l'URL du blob
 * (un identifiant opaque) : l'en-tête `Content-Disposition` du serveur n'est
 * jamais lu. Le nom doit donc être posé dans `download`.
 *
 * Le serveur (≥ #5482) le rend dans le statut de la tâche, `archive_name`,
 * déjà nettoyé pour Windows, macOS et Linux (« Artiste - Album (FLAC 24).zip »).
 * On ne fait ici que refuser un chemin. Un serveur antérieur n'envoie rien :
 * `download` reste vide, comme avant.
 */

/** Le nom à poser dans `<a download>`, ou `''`. */
export function nomDArchive(job: { archive_name?: string | null } | null | undefined): string {
  const nom = job?.archive_name?.split(/[\\/]/).pop()?.trim() ?? '';
  return nom === '.' || nom === '..' ? '' : nom;
}
