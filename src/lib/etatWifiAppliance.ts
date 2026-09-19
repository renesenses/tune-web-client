import type { ApplianceStatus, ApplianceWifiNetwork } from './api';

/**
 * Ce que l'écran WiFi d'une appliance Tune OS doit dire quand la liste des
 * réseaux est vide (#1260).
 *
 * Une liste vide n'est pas une réponse : `nmcli device wifi list` rend zéro
 * ligne, sans erreur, aussi bien quand aucune borne n'est à portée que quand
 * la machine n'a PAS de carte WiFi (matériel absent, firmware jamais installé)
 * ou que sa radio est coupée. « Aucun réseau détecté » pour les trois a fait
 * tourner un testeur en rond, câble Ethernet en main (forum-hifi.fr, 19/09).
 *
 * `/appliance/status` donne déjà l'état de chaque interface : on le lit avant
 * de conclure. Quand ce statut manque ou signale que `nmcli` a échoué, on ne
 * conclut rien sur la carte.
 */
export type EtatWifi =
  | 'liste'
  | 'recherche'
  | 'sans-carte'
  | 'carte-indisponible'
  | 'carte-non-geree'
  | 'rien-a-portee';

export function etatWifi(
  status: ApplianceStatus | null,
  reseaux: ApplianceWifiNetwork[],
  enRecherche: boolean,
): EtatWifi {
  if (reseaux.length > 0) return 'liste';
  if (status && !status.network_error) {
    const cartes = (status.devices ?? []).filter((d) => d.type === 'wifi');
    if (cartes.length === 0) return 'sans-carte';
    if (cartes.every((d) => d.state === 'unmanaged')) return 'carte-non-geree';
    if (cartes.every((d) => d.state === 'unavailable' || d.state === 'unmanaged')) {
      return 'carte-indisponible';
    }
  }
  if (enRecherche) return 'recherche';
  return 'rien-a-portee';
}

/** Clé i18n du message à afficher pour un état sans liste. */
export const MESSAGE_ETAT_WIFI: Record<Exclude<EtatWifi, 'liste'>, string> = {
  recherche: 'settings.wifiScanning',
  'sans-carte': 'settings.wifiNoAdapter',
  'carte-indisponible': 'settings.wifiAdapterUnavailable',
  'carte-non-geree': 'settings.wifiAdapterUnmanaged',
  'rien-a-portee': 'settings.wifiNoNetworks',
};
