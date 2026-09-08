/**
 * « Partager » l'écoute en cours — #533.
 *
 * Deux défauts en un, et le second seul suffisait à tout casser :
 *
 *  1. **La méthode.** Le client appelait la route en GET ; le serveur la
 *     déclare en POST (`routes/playback.rs:760`, `.route("/{id}/share",
 *     post(share_now_playing))`). L'appel rendait 405, l'échec mourait dans un
 *     `console.error`, et le bouton ne faisait rien — sans rien dire.
 *
 *  2. **Les champs.** Le client attendait `{ title, artist, album, text,
 *     cover_url }`. Le serveur rend :
 *
 *         { "token": "...", "url": "/shared/<token>",
 *           "track": { "title", "artist_name", "album_title", "cover_path", "source" } }
 *
 *     Il n'y a **pas de champ `text`** : c'était `undefined` qui partait au
 *     presse-papiers. Même une fois la méthode corrigée, le partage aurait
 *     collé « undefined ».
 *
 * Le texte se compose donc ICI, à partir de ce que le serveur envoie vraiment.
 */

export interface PistePartagee {
  title?: string | null;
  artist_name?: string | null;
  album_title?: string | null;
  cover_path?: string | null;
  source?: string | null;
}

export interface CartePartage {
  token: string;
  url: string;
  track: PistePartagee;
}

const propre = (v: string | null | undefined) => (v ?? '').trim();

/**
 * Le texte à coller.
 *
 * « Titre — Artiste (Album) », puis le lien de partage sur une seconde ligne
 * quand il y en a un. Les parties absentes disparaissent au lieu de laisser
 * des tirets orphelins : une radio sans album ne doit pas coller
 * « Titre — Artiste () ».
 */
export function texteDePartage(carte: CartePartage | null | undefined, origine = ''): string {
  const t = propre(carte?.track?.title);
  const a = propre(carte?.track?.artist_name);
  const al = propre(carte?.track?.album_title);

  let ligne = [t, a].filter(Boolean).join(' — ');
  if (al) ligne = ligne ? `${ligne} (${al})` : al;

  const chemin = propre(carte?.url);
  // `url` est relative (« /shared/<token> ») : sans origine, un lien collé
  // dans un message ne mène nulle part.
  const lien = chemin && origine ? `${origine.replace(/\/$/, '')}${chemin}` : chemin;

  return [ligne, lien].filter(Boolean).join('\n');
}

/** Y a-t-il quelque chose à coller ? Un presse-papiers vide n'est pas un partage. */
export function partageUtilisable(carte: CartePartage | null | undefined): boolean {
  return texteDePartage(carte).trim() !== '';
}
