/**
 * Retour automatique de Spotify par mozaiklabs.fr — renesenses/tune-server-rust#8198,
 * volet 3 (contrat, section C). EXPÉRIMENTAL, DÉSACTIVÉ par défaut : seul
 * l'utilisateur l'active, rien ne le fait à sa place.
 *
 * - `GET /api/v1/streaming/spotify/relais` → `{ actif, redirect_uri }` ;
 * - `PUT` même route, `{ actif }` → même forme ;
 * - relais actif : l'adresse à déclarer dans l'application Spotify est
 *   `redirect_uri` du relais (`GET /system/env` → `spotify_redirect_uri`
 *   ne change PAS) ; `POST /streaming/spotify/auth` reçoit en plus
 *   `origine: location.origin`, que le site renvoie au navigateur après
 *   l'autorisation.
 *
 * Un serveur plus ancien répond 404 : l'option ne s'affiche pas.
 */
import { writable, get } from 'svelte/store';
import { BASE, fetchJSON } from './api';

export interface EtatRelais {
  /** `false` : serveur sans relais (404), l'option est masquée. */
  disponible: boolean;
  actif: boolean;
  /** L'adresse du relais, à déclarer chez Spotify quand il est actif. */
  redirect_uri: string | null;
}

export const RELAIS_INCONNU: EtatRelais = { disponible: false, actif: false, redirect_uri: null };

export const relaisSpotify = writable<EtatRelais>(RELAIS_INCONNU);

type Reponse = { actif?: unknown; redirect_uri?: unknown } | null | undefined;

/** La réponse du serveur, lue sans rien supposer : seul `true` active. */
export function lireReponseRelais(r: Reponse): EtatRelais {
  return {
    disponible: true,
    actif: r?.actif === true,
    redirect_uri: typeof r?.redirect_uri === 'string' && r.redirect_uri.trim() ? r.redirect_uri.trim() : null,
  };
}

const URL_RELAIS = () => `${BASE}/streaming/spotify/relais`;

/** Lit l'état du relais ; 404 (serveur plus ancien) → option masquée. */
export async function chargerRelais(
  lire: () => Promise<Reponse> = () => fetchJSON<Reponse>(URL_RELAIS(), undefined, undefined, true),
): Promise<EtatRelais> {
  try {
    const e = lireReponseRelais(await lire());
    relaisSpotify.set(e);
    return e;
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 405) {
      relaisSpotify.set(RELAIS_INCONNU);
      return RELAIS_INCONNU;
    }
    throw err;
  }
}

/** Active ou désactive le relais, sur geste de l'utilisateur seulement. */
export async function ecrireRelais(
  actif: boolean,
  ecrire: (actif: boolean) => Promise<Reponse> = (a) =>
    fetchJSON<Reponse>(URL_RELAIS(), { method: 'PUT', body: JSON.stringify({ actif: a }) }),
): Promise<EtatRelais> {
  const e = lireReponseRelais(await ecrire(actif));
  relaisSpotify.set(e);
  return e;
}

/** L'adresse à déclarer dans l'application Spotify. */
export function adresseADeclarer(uriServeur: string | null | undefined, relais: EtatRelais): string | null {
  if (relais.disponible && relais.actif && relais.redirect_uri) return relais.redirect_uri;
  return uriServeur ?? null;
}

/**
 * Le corps de `POST /streaming/<service>/auth`. Pour Spotify relais actif,
 * on ajoute `origine` (l'adresse de cette page), et rien d'autre ne change.
 */
export function avecOrigineSpotify<T extends object>(
  service: string,
  corps: T | undefined,
  relais: EtatRelais = get(relaisSpotify),
  origine: string = typeof location !== 'undefined' ? location.origin : '',
): (T & { origine?: string }) | undefined {
  if (service !== 'spotify' || !relais.disponible || !relais.actif || !origine) return corps;
  return { ...(corps ?? ({} as T)), origine };
}
