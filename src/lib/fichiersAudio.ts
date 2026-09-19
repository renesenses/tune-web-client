/**
 * Un fichier déposé est-il un fichier audio que le serveur saura lire ?
 *
 * Règle reprise de l'ancienne file d'attente (`QueueView`), seul écran où l'on
 * pouvait glisser un fichier hors bibliothèque dans la file en cours
 * (Sergio : « glisser dans la playlist de la lecture en cours »). Par
 * extension : le navigateur ne connaît pas le type MIME d'un DSF ou d'un APE.
 */
const EXTENSIONS_AUDIO = new Set([
  'flac', 'wav', 'mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma',
  'aiff', 'aif', 'dsf', 'dff', 'wv', 'ape', 'alac',
]);

export function estFichierAudio(nom: string): boolean {
  const i = nom.lastIndexOf('.');
  if (i < 0) return false;
  return EXTENSIONS_AUDIO.has(nom.slice(i + 1).toLowerCase());
}
