/**
 * La page de l'album d'un titre Bandcamp, à joindre quand on le lance SEUL.
 *
 * # Le défaut (renesenses/tune-web-client#1923, #1924)
 *
 * Bandcamp ne donne jamais la fiche d'une piste seule : l'adresse de la page
 * de son album est la seule identité d'album qu'on lui connaisse. Un titre
 * lancé seul (`POST /zones/{id}/play` ou `/queue/add` avec `source` +
 * `source_id`) entrait en file sans elle. Le serveur la retrouve depuis
 * tune-server-rust#5922 si Tune a déjà vu la piste (file, favori, historique),
 * mais un titre JAMAIS vu restait sans album : le lien de l'album ouvrait la
 * Recherche, et « Aller à l'album » ne faisait rien.
 *
 * Le client, lui, connaît souvent cette page : la fiche d'un album Bandcamp
 * pose `album_id_service` sur chacune de ses pistes, et les lignes de file ou
 * d'historique le portent aussi. Il l'envoie donc dans `album_ref`.
 *
 * # Compatibilité
 *
 * Le champ est ADDITIF : un serveur antérieur l'ignore (serde écarte les clés
 * inconnues) et se comporte comme avant. Il n'est envoyé que pour une piste
 * Bandcamp et une adresse qui a la forme d'une page Bandcamp ; le serveur
 * refait la même vérification avant de la ranger.
 */

/** Ce qu'il faut lire d'une piste pour en connaître l'album Bandcamp. */
export interface PisteAvecAlbum {
  source?: string | null;
  album_id_service?: string | null;
  album_id?: unknown;
}

/** Les clés sous lesquelles un écran désigne le service Bandcamp. */
const SOURCES_BANDCAMP = new Set(['bandcamp', '__bandcamp__']);

/**
 * L'adresse si c'est une page Bandcamp sûre : `https://`, hôte
 * `bandcamp.com` ou `*.bandcamp.com` comparé par composant (jamais par fin de
 * chaîne : `evilbandcamp.com` n'en est pas), ni identifiants ni port, et un
 * chemin. Même règle que `zones::page_d_album_bandcamp_sure` côté serveur.
 */
export function pageAlbumBandcampSure(brute: unknown): string | null {
  if (typeof brute !== 'string') return null;
  const page = brute.trim();
  if (!page || page.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(page)) return null;
  if (!page.startsWith('https://')) return null;
  const reste = page.slice('https://'.length);
  const fin = reste.search(/[/?#]/);
  if (fin <= 0) return null;
  const hote = reste.slice(0, fin);
  const chemin = reste.slice(fin);
  if (/[@:\\]/.test(hote)) return null;
  const h = hote.toLowerCase();
  const bonDomaine = h === 'bandcamp.com' || (
    h.endsWith('.bandcamp.com')
    && h.slice(0, -'.bandcamp.com'.length).split('.').every((e) => /^[a-z0-9-]+$/.test(e))
  );
  if (!bonDomaine || !chemin.startsWith('/') || chemin.length < 2) return null;
  return page;
}

/** La page de l'album d'une piste Bandcamp, ou `null`. */
export function albumBandcampDe(t: PisteAvecAlbum | null | undefined): string | null {
  const source = String(t?.source ?? '').trim().toLowerCase();
  if (!SOURCES_BANDCAMP.has(source)) return null;
  return pageAlbumBandcampSure(t?.album_id_service) ?? pageAlbumBandcampSure(t?.album_id);
}

/**
 * Le champ à étaler dans un corps de `play` ou de `queue/add` : `{ album_ref }`
 * quand l'album est connu, `{}` sinon. Rien n'est ajouté aux autres services,
 * ni à une piste Bandcamp sans album : le corps reste alors celui d'avant.
 */
export function champAlbumBandcamp(t: PisteAvecAlbum | null | undefined): { album_ref?: string } {
  const page = albumBandcampDe(t);
  return page ? { album_ref: page } : {};
}
