/**
 * L'ARL Deezer saisi sur la carte Streaming (serveur #5427, fil 2035).
 *
 * Deezer n'a pas de flot par code d'appareil : il faut un ARL, le cookie de
 * session de deezer.com. Jusqu'ici la carte Streaming n'offrait que « Se
 * connecter », qui postait un corps vide, et le serveur répondait « deezer:
 * app_id required ». L'ARL ne se saisissait que dans Accès et jetons, et un
 * serveur antérieur à #5427 l'y rangeait sans jamais le remettre à Deezer.
 *
 * Le champ passe par la même route que Accès et jetons
 * (`POST /services/tokens/deezer`). Il n'est offert que si le serveur annonce
 * `arl_streaming: true` dans `GET /services/tokens` : sur un serveur plus
 * ancien, la carte reste telle qu'elle était.
 *
 * ⛔ La valeur de l'ARL n'est ni journalisée ni conservée après la réponse.
 */
import type { ServiceTokenInfo, ServiceTokenSaveResult } from './api/metadata';

export type EtatArl = 'accepte' | 'refuse' | 'injoignable';

export interface RetourArl {
  etat: EtatArl;
  /** Le message du serveur, tel quel (il ne contient jamais l'ARL). */
  message: string;
}

/** Le serveur remet-il l'ARL d'Accès et jetons au service de streaming ? */
export function offreChampArl(liste: ServiceTokenInfo[] | null | undefined): boolean {
  if (!Array.isArray(liste)) return false;
  const deezer = liste.find((s) => s?.id === 'deezer') as
    | (ServiceTokenInfo & { arl_streaming?: unknown })
    | undefined;
  return deezer?.arl_streaming === true;
}

/** La réponse de `POST /services/tokens/deezer`, lue en trois états. */
export function lireRetourArl(r: (ServiceTokenSaveResult & { etat?: unknown }) | null | undefined): RetourArl {
  const message = (r?.validation_message ?? r?.message ?? r?.error ?? '').toString();
  const etat: EtatArl =
    r?.etat === 'accepte' || r?.etat === 'refuse' || r?.etat === 'injoignable'
      ? r.etat
      : r?.valid === true
        ? 'accepte'
        : 'refuse';
  return { etat, message };
}

/** La clé i18n de la ligne qui accompagne le message du serveur. */
export function cleDuRetourArl(etat: EtatArl): string {
  switch (etat) {
    case 'accepte':
      return 'settings.deezerArlAccepted';
    case 'injoignable':
      return 'settings.deezerArlUnreachable';
    default:
      return 'settings.deezerArlRejected';
  }
}
