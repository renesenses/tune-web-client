/**
 * LES APPAREILS PROPOSÉS À LA CRÉATION D'UNE ZONE — nouveau client.
 *
 * Bug du .18, 17/09/2026 : « impossible de créer une nouvelle zone ! Comment
 * sélectionner un appareil ?? » — bandeau « zone_sans_appareil : La zone
 * « Test » n'aurait aucune sortie : choisissez un appareil découvert avant de
 * la créer ».
 *
 * Depuis tune-server-rust #3835 / #3838, `POST /zones` refuse un corps qui
 * annonce une sortie sans la nommer. Or `ZonesV2` ne demandait qu'un NOM et
 * appelait `createZone(name)` — soit `output_type: 'local'` sans appareil :
 * toute création était refusée, et l'écran n'offrait aucun moyen d'en choisir
 * un. L'ancienne interface (`ZoneManagerView`) propose ce choix depuis
 * longtemps ; on reprend ses trois sources, sans sa « sortie par défaut » que
 * le serveur refuse désormais elle aussi.
 */
import type { DiscoveredDevice, LocalAudioDevice, OutputType, Zone } from './types';
import { zoneTypeLabel } from './zoneIdentity';
import { deviceHasBoundZone, deviceZoneTargetId } from './hiddenZoneRecovery';

export type GroupeAppareil = 'navigateur' | 'local' | 'reseau';

export interface CandidatZone {
  /** Clé stable pour le sélecteur. */
  cle: string;
  groupe: GroupeAppareil;
  nom: string;
  outputType: OutputType;
  /** `undefined` pour le navigateur, dont la sortie est l'onglet. */
  deviceId?: string;
}

/**
 * Tout ce qu'on peut choisir : ce navigateur, les cartes son du serveur, puis
 * les appareils du réseau DISPONIBLES et pas déjà tenus par une zone.
 */
export function candidatsNouvelleZone(
  locaux: readonly LocalAudioDevice[] | null | undefined,
  decouverts: readonly DiscoveredDevice[] | null | undefined,
  zones: readonly Zone[] | null | undefined,
  nomNavigateur: string,
): CandidatZone[] {
  const liees = new Set(
    (zones ?? []).map((z) => z.output_device_id).filter((x): x is string => !!x),
  );
  const out: CandidatZone[] = [
    { cle: 'browser', groupe: 'navigateur', nom: nomNavigateur, outputType: 'browser' },
  ];
  for (const d of locaux ?? []) {
    if (!d?.id) continue;
    out.push({ cle: `local|${d.id}`, groupe: 'local', nom: d.name, outputType: 'local', deviceId: d.id });
  }
  for (const d of decouverts ?? []) {
    if (!d?.id || d.available === false || d.type === 'local' || d.type === 'browser') continue;
    if (deviceHasBoundZone(d, liees)) continue;
    const id = deviceZoneTargetId(d);
    out.push({ cle: `${d.type}|${id}`, groupe: 'reseau', nom: d.name, outputType: d.type, deviceId: id });
  }
  return out;
}

/**
 * Le libellé d'un appareil proposé — SON NOM, ET SON PROTOCOLE — #1234.
 *
 * Bertrand, présentation du 18/09/2026 : « Créer zone — manque le protocole ».
 * Un même appareil s'annonce souvent plusieurs fois, une par protocole qu'il
 * parle, et la liste montrait alors deux entrées qu'aucun signe ne
 * distinguait. On en prend une au hasard, et on découvre la différence à
 * l'usage : qualité, gestion du volume et reprise après coupure ne se valent
 * pas d'un protocole à l'autre.
 *
 * Mesuré sur le .18 le 19/09/2026, `GET /devices` — dix appareils, dont :
 *
 *     dlna      DMP-A8
 *     dlna      DMP-A8 (Tune)
 *     airplay   eversolo,1
 *     airplay   Chambre
 *     oaat      Tune Endpoint
 *
 * 🔴 `zoneTypeLabel` est RÉUTILISÉ, pas réécrit. Il vit dans `zoneIdentity` et
 * sert déjà les cartes de zone des Réglages (#1065) ; une seconde table de
 * protocoles divergerait au premier ajout, et l'écran de création nommerait
 * un protocole autrement que l'écran des zones.
 *
 * ⚠️ Il rend la CHAÎNE VIDE pour `local` — délibérément : « Local répète le
 * nom ». Le groupe « Sorties du serveur » le dit déjà dans son en-tête, on
 * n'ajoute donc rien. Idem pour le navigateur.
 */
export function libelleCandidat(c: CandidatZone | null | undefined): string {
  const nom = (c?.nom ?? '').trim();
  const proto = zoneTypeLabel(c?.outputType).trim();
  if (!proto) return nom;
  return nom ? `${nom} · ${proto}` : proto;
}
