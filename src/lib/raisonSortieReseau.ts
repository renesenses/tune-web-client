/**
 * Pourquoi un appareil RÉSEAU vu sur le réseau ne peut pas jouer —
 * tune-server-rust#7838 (reprise de #7279 : Innuos Zenith, fil 2495).
 *
 * Le serveur le publie depuis tune-server-rust#7831 (lot rc11), sur
 * `GET /api/v1/zones` et `GET /api/v1/zones/{id}`, pour une zone `dlna` ou
 * `openhome` (`routes/zones/sortie_reseau_absente_7279.rs`) :
 *
 *  - `sortie_reseau_absente` : aucune sortie de lecture n'est enregistrée ;
 *  - si, EN PLUS, la découverte voit l'appareil : `raison_sortie_absente`
 *    (`services_de_rendu_manquants` ou `sortie_non_enregistree`) et
 *    `services_manquants` (parmi `avtransport`, `renderingcontrol`).
 *
 * 🔴 Sans `raison_sortie_absente`, l'appareil n'est pas vu : c'est le « hors
 * ligne » ordinaire (`online`), et l'écran n'invente AUCUNE raison.
 *
 * Ce n'est volontairement pas `sortie_absente` (#6120) : celui-là ouvre
 * « Rattacher » à une sortie ASIO, que le serveur refuse pour une zone réseau.
 *
 * `GET /api/v1/devices` publie de son côté `registered: false` pour un
 * appareil trouvé dont aucune identité n'est une sortie de lecture : il ne
 * doit être ni proposé comme sortie, ni montré comme un appareil ordinaire.
 */
import type { DiscoveredDevice, Zone } from './types';

export type CleRaisonSortie =
  | 'v2.zone.raisonSansLecture'
  | 'v2.zone.raisonSansVolume'
  | 'v2.zone.raisonSansLectureNiVolume'
  | 'v2.zone.raisonSortieNonCreee';

/**
 * La clé de la phrase qui dit pourquoi la zone ne peut pas jouer, ou `null`
 * quand il n'y a rien à dire (sortie présente, appareil hors ligne, serveur
 * antérieur à #7831).
 */
export function cleRaisonSortieReseau(z: Pick<Zone, 'raison_sortie_absente' | 'services_manquants'>): CleRaisonSortie | null {
  const raison = z.raison_sortie_absente;
  if (raison === 'services_de_rendu_manquants') {
    const s = new Set(z.services_manquants ?? []);
    const lecture = s.has('avtransport');
    const volume = s.has('renderingcontrol');
    if (lecture && volume) return 'v2.zone.raisonSansLectureNiVolume';
    if (lecture) return 'v2.zone.raisonSansLecture';
    if (volume) return 'v2.zone.raisonSansVolume';
    // Un service que ce client ne connaît pas encore : la raison générale,
    // plutôt qu'un nom technique ou rien du tout.
    return 'v2.zone.raisonSortieNonCreee';
  }
  if (raison === 'sortie_non_enregistree') return 'v2.zone.raisonSortieNonCreee';
  return null;
}

/** L'appareil est trouvé, mais n'est pas une sortie de lecture. */
export function appareilSansSortie(d: Pick<DiscoveredDevice, 'registered'>): boolean {
  return d.registered === false;
}
