/**
 * tune-server-rust#6287, étape 2 — l'écran de la REQUÊTE TEXTUELLE des
 * playlists intelligentes.
 *
 * L'étape 1 (serveur, rc7) a livré le langage et sa route :
 * `POST /library/smart-playlists/requete` (grammaire :
 * `docs/langage-de-requete.md` du serveur). Cet écran l'essaie depuis
 * l'éditeur, montre l'erreur À SA POSITION, et reprend dans l'éditeur visuel
 * une requête qui a une forme d'éditeur (suite de critères joints par ET, ou
 * seulement par OU). Une requête imbriquée ou niée s'essaie, mais ne
 * s'enregistre pas encore : l'éditeur n'a qu'un niveau (étape 4 du document).
 */
import type { ReponseRequeteTextuelle } from './api';

/** Ce que l'essai d'une requête a donné. */
export type ResultatRequete =
  | { etat: 'ok'; reponse: ReponseRequeteTextuelle }
  | { etat: 'invalide'; message: string; position: number | null }
  | { etat: 'echec'; message: string };

/** Une requête de plus de 2 000 caractères est refusée par le serveur. */
export const LONGUEUR_MAX_REQUETE = 2000;

type Poster = (body: { q: string; sort_by?: string; sort_order?: string; max_tracks?: number }) => Promise<ReponseRequeteTextuelle>;

/**
 * Essaie la requête `q`. Un refus du serveur (`requete_invalide`) garde son
 * message et sa position ; toute autre erreur (réseau, serveur plus ancien
 * sans la route) est un échec, dit comme tel.
 */
export async function essayerRequete(
  q: string,
  options: { sort_by?: string; sort_order?: string; max_tracks?: number },
  poster: Poster,
): Promise<ResultatRequete> {
  try {
    const reponse = await poster({ q, ...options });
    return {
      etat: 'ok',
      reponse: {
        ...reponse,
        tracks: Array.isArray(reponse?.tracks) ? reponse.tracks : [],
        regles_refusees: Array.isArray(reponse?.regles_refusees) ? reponse.regles_refusees : [],
        rules: Array.isArray(reponse?.rules) ? reponse.rules : null,
        match_mode: reponse?.match_mode === 'all' || reponse?.match_mode === 'any' ? reponse.match_mode : null,
      },
    };
  } catch (e: any) {
    const corps = e?.corps;
    if (corps && typeof corps === 'object' && corps.error === 'requete_invalide') {
      return {
        etat: 'invalide',
        message: String(corps.message ?? ''),
        position: typeof corps.position === 'number' ? corps.position : null,
      };
    }
    return { etat: 'echec', message: String(e?.message ?? e ?? '') };
  }
}

/**
 * La requête coupée à la position de l'erreur (en CARACTÈRES, comme le
 * serveur la compte), pour la montrer : `avant`, le caractère fautif, `apres`.
 * Une position hors de la requête désigne sa fin.
 */
export function decouperALaPosition(q: string, position: number): { avant: string; fautif: string; apres: string } {
  const car = Array.from(q);
  const p = Math.max(0, Math.min(position, car.length));
  return { avant: car.slice(0, p).join(''), fautif: car[p] ?? '', apres: car.slice(p + 1).join('') };
}
