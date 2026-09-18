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
