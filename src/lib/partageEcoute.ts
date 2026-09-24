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
  /**
   * Le lien ABSOLU calculé par le serveur — v0.9.159, tune-server-rust#4576.
   *
   * Il porte l'adresse par laquelle le serveur est joignable sur le réseau,
   * celle qu'il met déjà dans les URL de flux. Absent quand le serveur n'a
   * qu'une boucle locale à offrir, et absent des serveurs antérieurs : on
   * retombe alors sur `location.origin`, comme avant.
   */
  url_absolue?: string | null;
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

  // Xavier Joly, 20/09/2026 : son partage est parti avec
  // « http://localhost:8888/shared/… ». `location.origin`, c'est l'adresse
  // tapée dans SA barre d'adresse — le lien ne s'ouvre alors que chez lui.
  // Le serveur, lui, connaît son adresse réseau : quand il la donne
  // (`url_absolue`), elle prime. Sinon, on garde l'ancien comportement.
  const absolu = propre(carte?.url_absolue);
  const chemin = propre(carte?.url);
  const lien = absolu || (chemin && origine ? `${origine.replace(/\/$/, '')}${chemin}` : chemin);

  return [ligne, lien].filter(Boolean).join('\n');
}

/** Y a-t-il quelque chose à coller ? Un presse-papiers vide n'est pas un partage. */
export function partageUtilisable(carte: CartePartage | null | undefined): boolean {
  return texteDePartage(carte).trim() !== '';
}

/**
 * Le LIEN seul, sans la ligne « Titre — Artiste (Album) ».
 *
 * Il sert quand la copie échoue : on ne peut pas mettre le texte dans le
 * presse-papiers, mais on peut au moins montrer à l'utilisateur ce qu'il a à
 * recopier — et un lien tient dans un bandeau, pas une carte entière.
 */
export function lienDePartage(carte: CartePartage | null | undefined, origine = ''): string {
  const absolu = propre(carte?.url_absolue);
  const chemin = propre(carte?.url);
  return absolu || (chemin && origine ? `${origine.replace(/\/$/, '')}${chemin}` : chemin);
}

/**
 * Ce qu'il est advenu d'un « Partager » — #1521.
 *
 * TROIS causes distinctes se partageaient un seul message, « Impossible de
 * partager cette écoute » :
 *
 *  1. la route a refusé (serveur injoignable, 4xx/5xx) ;
 *  2. la route a répondu, mais il n'y a rien à coller (aucune piste) ;
 *  3. tout a marché **et c'est la copie** que le navigateur a refusée.
 *
 * Le troisième cas est celui de Bertrand : `navigator.clipboard` n'existe
 * qu'en contexte sécurisé, et les testeurs atteignent Tune en HTTP clair sur
 * une IP de réseau local. L'appel jetait, le `catch` annonçait « impossible de
 * partager » — alors que le partage, lui, existait bel et bien côté serveur.
 * On ne peut rien faire d'un message qui accuse la mauvaise étape.
 */
export type IssueDePartage =
  /** Copié : le presse-papiers porte vraiment le texte. */
  | { etat: 'copie'; texte: string }
  /** La route a refusé — rien n'a été créé. */
  | { etat: 'routeRefusee'; erreur: unknown }
  /** Réponse reçue, mais vide : aucune piste à partager. */
  | { etat: 'sansPiste' }
  /** Le partage existe ; c'est la copie qui a été refusée. */
  | { etat: 'copieRefusee'; texte: string; lien: string };

/**
 * Demander le partage, puis le copier — en distinguant les trois échecs.
 *
 * `copier` DOIT rendre `false` quand le presse-papiers n'a pas été écrit :
 * c'est le contrat de `copyText()` (`lib/utils.ts`), qui retombe sur
 * `execCommand('copy')` hors contexte sécurisé. On n'annonce « copié » que sur
 * un `true` — un bouton qui fanfaronne en laissant le presse-papiers vide est
 * exactement le défaut que `copyText` a été écrit pour éviter.
 */
export async function partagerEcoute(opts: {
  demanderCarte: () => Promise<CartePartage | null | undefined>;
  copier: (texte: string) => Promise<boolean>;
  origine?: string;
}): Promise<IssueDePartage> {
  const origine = opts.origine ?? '';
  let carte: CartePartage | null | undefined;
  try {
    carte = await opts.demanderCarte();
  } catch (erreur) {
    return { etat: 'routeRefusee', erreur };
  }
  if (!partageUtilisable(carte)) return { etat: 'sansPiste' };

  const texte = texteDePartage(carte, origine);
  let copie = false;
  try {
    copie = await opts.copier(texte);
  } catch {
    // Une exception de copie reste un refus de COPIE, pas un échec de partage.
    copie = false;
  }
  return copie
    ? { etat: 'copie', texte }
    : { etat: 'copieRefusee', texte, lien: lienDePartage(carte, origine) };
}
