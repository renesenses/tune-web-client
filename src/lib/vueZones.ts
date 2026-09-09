/**
 * La vue des Zones : grille ou liste, et ce qu'une carte a le droit de dire.
 *
 * Chantier demandé par Bertrand le 08/09/2026 : « vue grille avec des grosses
 * cards présentant aussi l'appareil de la zone et le badge Tune tested. grille
 * du genre 4 colonnes ».
 *
 * 🔴 MESURE AVANT DE DESSINER (`GET /zones` sur le .18, 08/09/2026, 14 zones) :
 * cinq zones seulement portent une identité d'appareil, et une seule est
 * CHOISIE — l'Eversolo (« Eversolo / DMP-A8 »). Les quatre autres sont
 * DÉTECTÉES : « Sonos, Inc. / Sonos Play:1 », « SoftAtHome / SoftAtHome Media
 * Renderer », « MozAIk Labs / Tune », « EVERSOLO / AV Renderer Device ». Les
 * neuf restantes — les AirPlay, le navigateur, la sortie locale, Lindemann,
 * Chambre — n'ont NI marque NI modèle.
 *
 * Autrement dit : sur les cartes de Bertrand, deux sur trois n'auront aucun
 * appareil à montrer. La carte doit donc être belle SANS, pas seulement avec ;
 * elle retombe sur le type de sortie, qui, lui, est toujours là. Dessiner la
 * grille en supposant l'identité présente aurait donné neuf cartes trouées.
 */

/** Ce que l'écran Zones affiche. Choix rangé dans le navigateur. */
export type VueZones = 'grille' | 'liste';

export const CLE_VUE_ZONES = 'tune.v2.vueZones';

/** La vue par défaut est la GRILLE : c'est celle qui a été demandée. */
export function lireVueZones(store?: Pick<Storage, 'getItem'>): VueZones {
  try {
    const s = store ?? localStorage;
    return s.getItem(CLE_VUE_ZONES) === 'liste' ? 'liste' : 'grille';
  } catch {
    // Stockage refusé (navigation privée) : on retombe sur le défaut.
    return 'grille';
  }
}

export function ecrireVueZones(vue: VueZones, store?: Pick<Storage, 'setItem'>): void {
  try {
    (store ?? localStorage).setItem(CLE_VUE_ZONES, vue);
  } catch {
    /* tant pis, le choix ne survivra pas au rechargement */
  }
}

export interface ZoneIdentifiable {
  brand?: string | null;
  model?: string | null;
  detected_manufacturer?: string | null;
  detected_model?: string | null;
}

/**
 * L'appareil de la zone, en une ligne — ou `null` s'il n'y en a pas.
 *
 * 🔴 L'identité CHOISIE d'abord, la DÉTECTÉE ensuite, et JAMAIS un mélange des
 * deux : c'est la même règle que `appareilTuneTeste`, pour la même raison.
 * Croiser la marque choisie « Eversolo » avec le modèle détecté « AV Renderer
 * Device » fabriquerait « Eversolo AV Renderer Device », qui ne désigne aucun
 * appareil au monde.
 *
 * Une marque sans modèle (ou l'inverse) est rendue seule — c'est incomplet,
 * pas faux.
 */
export function appareilDeLaZone(zone: ZoneIdentifiable): string | null {
  const plier = (v: string | null | undefined) => (v ?? '').trim();
  for (const [marque, modele] of [
    [zone.brand, zone.model],
    [zone.detected_manufacturer, zone.detected_model],
  ] as const) {
    const m = plier(marque);
    const d = plier(modele);
    if (!m && !d) continue;
    // « Sonos, Inc. Sonos Play:1 » : le modèle répète déjà la marque chez
    // plusieurs constructeurs. On ne l'écrit pas deux fois.
    if (m && d && d.toLowerCase().startsWith(m.replace(/,?\s*(inc|ltd|llc|gmbh|corp|co)\.?$/i, '').trim().toLowerCase())) {
      return d;
    }
    return [m, d].filter(Boolean).join(' ');
  }
  return null;
}
