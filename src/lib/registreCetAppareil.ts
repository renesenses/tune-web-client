/**
 * web#3314 — le registre de CET appareil (`localStorage`, durable) : un
 * identifiant tiré une fois et les zones navigateur que « Ce téléphone » a
 * créées ici. Voir `zoneDeCetAppareil.ts`. Il ne rend aucune zone jouable :
 * la prise reste à l'onglet (`zoneNavigateurProprietaire.ts`, #3180).
 *
 * Module à part : `zoneNavigateurProprietaire` le lit pour la migration
 * ci-dessous, et `zoneDeCetAppareil` importe déjà `zoneNavigateurProprietaire`.
 */

/** Jusqu'à rc12, « Ce téléphone » rangeait SA zone ici (`String(id)`). */
export const ANCIENNE_CLE_ZONE_DE_CET_APPAREIL = 'tune.zoneNavigateur.cetAppareil';

/** Clé du registre de cet appareil — distincte des clés oubliées par #3180. */
const CLE_APPAREIL = 'tune.cetAppareil';

interface Registre {
  /** Identifiant de cet appareil, tiré une fois. */
  appareil: string;
  /** Zones navigateur créées par « Ce téléphone » sur cet appareil. */
  zones: number[];
}

function tirerIdentifiant(): string {
  // `crypto.randomUUID` n'existe qu'en contexte sécurisé (HTTPS) : un serveur
  // du réseau local se sert en HTTP. `getRandomValues` est partout.
  const octets = new Uint8Array(16);
  try {
    crypto.getRandomValues(octets);
  } catch {
    for (let i = 0; i < octets.length; i++) octets[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

function lireRegistre(): Registre {
  migrerAncienneZoneDeCetAppareil();
  return lireRegistreSeul();
}

function lireRegistreSeul(): Registre {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_APPAREIL) ?? 'null');
    if (v && typeof v.appareil === 'string' && v.appareil) {
      const zones = Array.isArray(v.zones) ? v.zones.filter((x: unknown) => Number.isInteger(x)) : [];
      return { appareil: v.appareil, zones };
    }
  } catch {
    /* illisible : on repart d'un registre neuf */
  }
  const neuf = { appareil: tirerIdentifiant(), zones: [] };
  ecrireRegistre(neuf);
  return neuf;
}

function ecrireRegistre(r: Registre): void {
  try {
    localStorage.setItem(CLE_APPAREIL, JSON.stringify(r));
  } catch {
    /* stockage indisponible : le prochain onglet créera sa propre zone */
  }
}

/** L'identifiant durable de cet appareil (tiré au premier appel). */
export function identifiantDeCetAppareil(): string {
  return lireRegistre().appareil;
}

/** Les zones navigateur créées par « Ce téléphone » sur cet appareil. */
export function zonesNeesIci(): number[] {
  return lireRegistre().zones;
}

export function noterZoneNeeIci(id: number): void {
  const r = lireRegistre();
  if (r.zones.includes(id)) return;
  ecrireRegistre({ ...r, zones: [...r.zones, id] });
}

/**
 * web#3314 (relecture de #3317) — la zone que « Ce téléphone » gardait jusqu'à
 * rc12 sous `tune.zoneNavigateur.cetAppareil` est À LUI : elle entre au
 * registre avant que #3180 n'efface l'ancienne clé. Sans cela, chaque
 * utilisateur à un seul téléphone verrait naître « Ce téléphone (2) » à côté
 * de sa zone devenue orpheline. Idempotent ; ne supprime rien.
 */
export function migrerAncienneZoneDeCetAppareil(): void {
  let id: number;
  try {
    const brut = localStorage.getItem(ANCIENNE_CLE_ZONE_DE_CET_APPAREIL);
    if (brut == null) return;
    id = Number(brut);
  } catch {
    return;
  }
  if (!Number.isInteger(id) || id <= 0) return;
  const r = lireRegistreSeul();
  if (!r.zones.includes(id)) ecrireRegistre({ ...r, zones: [...r.zones, id] });
}
