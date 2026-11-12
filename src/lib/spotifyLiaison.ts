/**
 * Spotify : la liaison Spotify Connect requise — web#2804, côté client de
 * tune-server-rust#8154 (PR serveur #8411, lot rc12).
 *
 * Spotify refuse le jeton de Tune à librespot tant que l'appareil de Tune n'a
 * jamais été choisi dans l'application Spotify. Le serveur rendait « Erreur
 * de lecture » ; il rend désormais un 409 au code stable
 * `spotify_liaison_connect_requise`, avec sa phrase traduite (`message`),
 * l'appareil à choisir (`device_name`), l'état du récepteur
 * (`receiver_active`) et la route qui l'allume (`enable_endpoint`).
 *
 * Ce module ne fait que LIRE : il ne parle pas au serveur (pas d'import de
 * `api`, qui l'importe). Tolérant : un champ absent ne fait rien inventer —
 * pas de bouton tant que le serveur n'a pas dit `receiver_active: false`.
 */
export const CODE_LIAISON_SPOTIFY = 'spotify_liaison_connect_requise';

/** L'appareil quand le serveur ne le nomme pas : le nom par défaut du récepteur. */
const APPAREIL_PAR_DEFAUT = 'Tune';

export type RefusLiaisonSpotify = {
  appareil: string;
  /** `false` seulement quand le serveur l'a dit : c'est lui qui fait le bouton. */
  recepteurEteint: boolean;
};

export function lireRefusLiaison(corps: unknown): RefusLiaisonSpotify {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const params = (c.params && typeof c.params === 'object' ? c.params : {}) as Record<string, unknown>;
  const brut = typeof c.device_name === 'string' && c.device_name.trim() !== ''
    ? c.device_name
    : typeof params.device === 'string' && params.device.trim() !== '' ? params.device : APPAREIL_PAR_DEFAUT;
  return { appareil: brut.trim(), recepteurEteint: c.receiver_active === false };
}

/** La zone d'une route de lecture (`/zones/{id}/play`…), ou `null`. */
export function zoneDeLaRoute(url: string): number | null {
  const m = /\/zones\/(\d+)\//.exec(url);
  return m ? Number(m[1]) : null;
}

/**
 * Réglages › Spotify : l'étape unique de liaison (point 3 de web#2804).
 *
 * - `masquee` : rien à dire — statut illisible, lecture Spotify non activée
 *   (elle ne peut alors pas buter sur la liaison), ou serveur qui ne publie
 *   pas `librespot_linked` (seul `false` compte) ;
 * - `choisir` : le récepteur tourne, il reste à choisir l'appareil une fois ;
 * - `activer` : le récepteur est éteint, l'étape porte « Activer le récepteur ».
 */
export type EtapeLiaison = 'masquee' | 'choisir' | 'activer';

export function etapeLiaison(st: Record<string, unknown> | null | undefined): EtapeLiaison {
  if (!st || typeof st !== 'object') return 'masquee';
  if (st.librespot_linked !== false || st.lecture_experimentale !== true) return 'masquee';
  return st.active === false ? 'activer' : 'choisir';
}
