/**
 * L'assistant pas à pas de la carte Spotify — renesenses/tune-server-rust#8198,
 * volet 3 (étude, § 3d.1).
 *
 * Quatre écrans, dans l'ordre où Spotify les demande :
 *   1. créer son application sur developer.spotify.com/dashboard ;
 *   2. y déclarer l'adresse de retour (celle du serveur, ou du relais) ;
 *   3. User Management : ajouter l'e-mail de son compte ;
 *   4. coller le Client ID, puis Se connecter.
 *
 * Le tableau de bord de Spotify n'accepte aucun pré-remplissage par URL : on
 * guide, avec des valeurs à copier, on n'automatise pas.
 */

export const NB_ETAPES = 4;
export type Etape = 1 | 2 | 3 | 4;

export const TABLEAU_DE_BORD_SPOTIFY = 'https://developer.spotify.com/dashboard';
export const GUIDE_SPOTIFY = 'https://mozaiklabs.fr/docs/spotify';

/** Les valeurs à recopier dans « Create app ». Indifférentes à la langue. */
export const NOM_APPLICATION = 'Tune';
export const DESCRIPTION_APPLICATION = 'Tune music server (personal use)';

export function etapeSuivante(e: Etape): Etape {
  return (e < NB_ETAPES ? e + 1 : NB_ETAPES) as Etape;
}

export function etapePrecedente(e: Etape): Etape {
  return (e > 1 ? e - 1 : 1) as Etape;
}

/**
 * L'assistant s'ouvre de lui-même quand il manque le Client ID et que
 * l'utilisateur ne l'a pas sauté ; sinon il reste replié derrière un lien.
 */
export function ouvertAuDepart(clientIdManque: boolean, saute: boolean): boolean {
  return clientIdManque && !saute;
}

/** « J'ai déjà mon Client ID » se retient dans ce navigateur (confort seulement). */
export const CLE_SAUT = 'tune.spotify.assistantSaute';

export function lireSaut(stockage: Pick<Storage, 'getItem'> | null | undefined = stockageLocal()): boolean {
  try {
    return stockage?.getItem(CLE_SAUT) === '1';
  } catch {
    return false;
  }
}

export function ecrireSaut(saute: boolean, stockage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined = stockageLocal()): void {
  try {
    if (saute) stockage?.setItem(CLE_SAUT, '1');
    else stockage?.removeItem(CLE_SAUT);
  } catch {
    /* navigation privée, stockage bloqué : l'assistant se rouvrira, rien de grave */
  }
}

function stockageLocal(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
