/** Les réponses anciennes restent utilisables ; seul un refus explicite interdit. */
export interface CapacitesVolumeSortie {
  can_set_volume?: boolean;
  can_mute?: boolean;
}

export interface ZoneAvecCapacitesVolume {
  output_type?: string;
  output_capabilities?: CapacitesVolumeSortie | null;
}

export function volumeCommandable(zone: ZoneAvecCapacitesVolume | null | undefined): boolean {
  return !!zone && (zone.output_type === 'browser' || zone.output_capabilities?.can_set_volume !== false);
}

export function sourdineCommandable(zone: ZoneAvecCapacitesVolume | null | undefined): boolean {
  return !!zone && (zone.output_type === 'browser' || zone.output_capabilities?.can_mute !== false);
}
