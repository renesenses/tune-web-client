/**
 * Aperçu d'une restauration de configuration (fil forum 2110, ticket 221).
 *
 * `POST /system/config/import/preview` rend ce que l'import ferait, SANS rien
 * écrire : les réglages ajoutés, modifiés ou inchangés, et pour chaque zone du
 * fichier son sort — ajoutée (hors ligne si son appareil n'est pas sur cette
 * machine), modifiée ou inchangée. Ce module lit cette réponse et la résume
 * pour l'écran Réglages › Système › Configuration.
 *
 * `lireApercu` est volontairement STRICT : une réponse qui n'a pas la forme
 * d'un aperçu (serveur antérieur qui répond 404 avec un corps quelconque, page
 * HTML d'un relais…) rend `null`, et l'écran dit qu'il n'y a pas d'aperçu au
 * lieu d'annoncer « rien ne change ».
 */

export type StatutApercu = 'added' | 'modified' | 'unchanged';

export interface ZoneApercu {
  name: string;
  outputDeviceId: string | null;
  status: StatutApercu;
  /** Créée hors ligne : son appareil n'a aucune zone sur cette machine. */
  offline: boolean;
  /** La zone d'arrivée est masquée ici ; elle le reste. */
  hidden: boolean;
  changes: string[];
}

export interface ApercuRestauration {
  formatVersion: number;
  reglages: { added: string[]; modified: string[]; unchanged: string[] };
  zones: ZoneApercu[];
  avertissements: string[];
}

export interface Compte {
  added: number;
  modified: number;
  unchanged: number;
}

const STATUTS: readonly StatutApercu[] = ['added', 'modified', 'unchanged'];

function chaines(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

/** La réponse du serveur, ou `null` si ce n'est pas un aperçu. */
export function lireApercu(rep: unknown): ApercuRestauration | null {
  if (!rep || typeof rep !== 'object') return null;
  const r = rep as Record<string, any>;
  if (typeof r.format_version !== 'number') return null;
  const s = r.settings;
  if (!s || typeof s !== 'object') return null;
  const added = chaines(s.added);
  const modified = chaines(s.modified);
  const unchanged = chaines(s.unchanged);
  if (!added || !modified || !unchanged) return null;
  if (!Array.isArray(r.zones)) return null;
  const zones: ZoneApercu[] = [];
  for (const z of r.zones) {
    if (!z || typeof z !== 'object') return null;
    if (typeof z.name !== 'string' || !STATUTS.includes(z.status)) return null;
    zones.push({
      name: z.name,
      outputDeviceId: typeof z.output_device_id === 'string' ? z.output_device_id : null,
      status: z.status,
      offline: z.offline === true,
      hidden: z.hidden === true,
      changes: chaines(z.changes) ?? [],
    });
  }
  return {
    formatVersion: r.format_version,
    reglages: { added, modified, unchanged },
    zones,
    avertissements: chaines(r.warnings) ?? [],
  };
}

export function compterReglages(a: ApercuRestauration): Compte {
  return {
    added: a.reglages.added.length,
    modified: a.reglages.modified.length,
    unchanged: a.reglages.unchanged.length,
  };
}

export function compterZones(a: ApercuRestauration): Compte {
  const n = (s: StatutApercu) => a.zones.filter((z) => z.status === s).length;
  return { added: n('added'), modified: n('modified'), unchanged: n('unchanged') };
}

/** Le fichier ne change rien : ni réglage ni zone ajouté ou modifié. */
export function rienNeChange(a: ApercuRestauration): boolean {
  const r = compterReglages(a);
  const z = compterZones(a);
  return r.added + r.modified + z.added + z.modified === 0;
}

/** Les réglages qui changent, ajoutés d'abord, pour le détail repliable. */
export function reglagesQuiChangent(a: ApercuRestauration): string[] {
  return [...a.reglages.added, ...a.reglages.modified];
}

/** Clé de traduction du statut d'une zone. */
export function cleStatutZone(s: StatutApercu): string {
  return s === 'added'
    ? 'settings.restorePreviewZoneAdded'
    : s === 'modified'
      ? 'settings.restorePreviewZoneModified'
      : 'settings.restorePreviewZoneUnchanged';
}

/** Remplit `{added}`, `{modified}`, `{unchanged}` d'une phrase traduite. */
export function remplir(modele: string, c: Compte): string {
  return modele
    .replace('{added}', String(c.added))
    .replace('{modified}', String(c.modified))
    .replace('{unchanged}', String(c.unchanged));
}
