/**
 * tune-server-rust#8445 (Jon, fil 2760) — « le volume n'est pas diffusé à tout
 * le groupe, il ne vaut que pour la zone sélectionnée ».
 *
 * Le serveur a un volume MAÎTRE de groupe (`POST /zone-manager/groups/{id}/
 * volume`) : il pose `maître + décalage du membre` sur chaque zone du groupe
 * et laisse les zones en volume fixe à 100 %. `api.setGroupVolume` existait,
 * mais aucun curseur ne l'appelait : ils envoyaient tous `api.setVolume` à la
 * seule zone sélectionnée.
 *
 * Ici, une seule règle pour tous les curseurs et boutons + / − de la zone
 * sélectionnée : si elle fait partie d'un groupe, la consigne part en volume
 * maître ; sinon, rien ne change. Le maître est le gain du curseur MOINS le
 * décalage de la zone sélectionnée : elle arrive ainsi exactement où le
 * curseur la montre, et les autres membres gardent leur écart.
 */
import { get, writable } from 'svelte/store';
import * as api from './api';
import { gainDeLaZone, zonePourLeCurseur } from './courbeDeVolume';
import { lineaireDepuisDb } from './volumeDb';
import type { WSEvent, ZoneGroupResponse } from './types';

/** Les groupes de zones tels que le serveur les garde (`/zones/groups/list`). */
export const groupesDeZones = writable<ZoneGroupResponse[]>([]);

/** Le groupe (d'au moins deux zones) dont `zoneId` fait partie, sinon `null`. */
export function groupeDeLaZone(
  zoneId: number | null | undefined,
  groupes: readonly ZoneGroupResponse[],
): ZoneGroupResponse | null {
  if (zoneId == null) return null;
  return (
    groupes.find(
      (g) => Array.isArray(g?.zone_ids) && g.zone_ids.length > 1 && g.zone_ids.includes(zoneId),
    ) ?? null
  );
}

/** L'identifiant que prend la route du volume maître. */
export function idDuGroupe(groupe: ZoneGroupResponse): string {
  return groupe.group_id != null ? String(groupe.group_id) : String(groupe.id);
}

/** Le volume maître qui pose `gain` sur `zoneId`, compte tenu de son décalage. */
export function maitrePourLaZone(groupe: ZoneGroupResponse, zoneId: number, gain: number): number {
  const brut = Number(groupe.offsets?.[String(zoneId)] ?? 0);
  const decalage = Number.isFinite(brut) ? brut : 0;
  const maitre = gain - decalage;
  if (!Number.isFinite(maitre)) return 0;
  return Math.max(0, Math.min(1, maitre));
}

export async function chargerGroupesDeZones(
  lister: () => Promise<ZoneGroupResponse[]> = api.listGroups,
): Promise<void> {
  try {
    const groupes = await lister();
    groupesDeZones.set(Array.isArray(groupes) ? groupes : []);
  } catch {
    /* le prochain événement de groupe rechargera ; on garde l'état connu */
  }
}

let suivi = false;
/** Charge les groupes une fois, puis les relit à chaque événement `group.*`.
 *  Idempotent : plusieurs curseurs montés ne doublent ni la lecture ni
 *  l'abonnement. */
export function suivreGroupesDeZones(
  abonner: (h: (e: WSEvent) => void) => () => void,
  lister?: () => Promise<ZoneGroupResponse[]>,
): void {
  if (suivi) return;
  suivi = true;
  void chargerGroupesDeZones(lister);
  abonner((e) => {
    if (typeof e?.type === 'string' && e.type.startsWith('group.')) void chargerGroupesDeZones(lister);
  });
}

/** Pour les tests : oublie l'abonnement. */
export function _reinitialiserSuivi() {
  suivi = false;
}

/** Règle le volume du CURSEUR (0..1) de `zoneId` : maître du groupe si elle
 *  est groupée, volume de la zone sinon. Même contrat que `api.setVolume`. */
export function reglerVolume(zoneId: number, curseur: number): Promise<unknown> {
  const groupe = groupeDeLaZone(zoneId, get(groupesDeZones));
  if (!groupe) return api.setVolume(zoneId, curseur);
  const gain = gainDeLaZone(zonePourLeCurseur(zoneId), curseur);
  return envoyerAuGroupe(groupe, zoneId, gain);
}

/** Le serveur sert tous les membres et répond 200 dès qu'un seul accepte ;
 *  si c'est la zone SÉLECTIONNÉE qui a refusé (verrou PURE, appareil
 *  injoignable), le curseur doit le savoir comme pour une zone seule : on
 *  rejette, et `envoyerVolumeOuReverrouiller` relit le verrou. */
async function envoyerAuGroupe(groupe: ZoneGroupResponse, zoneId: number, gain: number): Promise<unknown> {
  const reponse = await api.setGroupVolume(idDuGroupe(groupe), maitrePourLaZone(groupe, zoneId, gain));
  const refusees: unknown = reponse?.zones_refusees;
  if (Array.isArray(refusees) && refusees.includes(zoneId)) {
    throw new Error('zone_volume_refused');
  }
  return reponse;
}

/** La saisie en dB (#1274) : même règle que `reglerVolume`. */
export function reglerVolumeDb(zoneId: number, db: number): Promise<unknown> {
  const groupe = groupeDeLaZone(zoneId, get(groupesDeZones));
  if (!groupe) return api.setVolumeDb(zoneId, db);
  const gain = lineaireDepuisDb(db) ?? 0;
  return envoyerAuGroupe(groupe, zoneId, gain);
}

/** La zone pilote-t-elle un groupe ? (les boutons + / − prennent alors le
 *  chemin du curseur, le pas serveur `volume/step` ne valant que pour une zone) */
export function zoneGroupee(zoneId: number | null | undefined): boolean {
  return groupeDeLaZone(zoneId, get(groupesDeZones)) !== null;
}
