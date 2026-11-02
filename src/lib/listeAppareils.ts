/**
 * Liste compacte des appareils (Réglages ▸ Appareils ▸ Réglages par zone) —
 * web#2451 (alec_eiffel, fil 2424) : « l'onglet liste tous les appareils à la
 * suite, avec leurs détails, sur des pages et des pages ».
 *
 * Ce module ne porte QUE la logique pure : tri stable, filtre texte, filtre
 * par type de sortie, état lisible. Le rendu vit dans `ListeAppareils.svelte`,
 * les détails (inchangés) dans la carte de zone de `SettingsV2`.
 */
import type { Zone } from './types';
import { zoneTypeLabel, zoneDeviceName } from './zoneIdentity';

/** Valeur du filtre de type qui ne filtre rien. */
export const TOUS_LES_TYPES = '';
/** Valeur du filtre pour les sorties locales (leur `zoneTypeLabel` est vide). */
export const TYPE_LOCAL = '__local__';

/** Clé stable d'une zone dans la liste (une zone non encore créée n'a pas d'id). */
export function cleZone(z: Pick<Zone, 'id' | 'name'>): string {
  return z.id == null ? `n:${z.name}` : `i:${z.id}`;
}

/** Les sorties `local` et `browser` n'ont pas de protocole réseau à afficher. */
export function typeDeFiltre(z: Pick<Zone, 'output_type'>): string {
  const proto = zoneTypeLabel(z.output_type);
  if (proto && z.output_type !== 'browser') return proto;
  return TYPE_LOCAL;
}

/** Ordre alphabétique insensible à la casse et aux accents, puis par id : le
 *  même jeu de zones donne toujours le même ordre, quel que soit l'ordre dans
 *  lequel le serveur les envoie. */
export function trierZones<T extends Pick<Zone, 'id' | 'name'>>(zones: readonly T[]): T[] {
  return [...zones].sort((a, b) => {
    const c = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base', numeric: true });
    if (c !== 0) return c;
    return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Types présents dans le jeu de zones (pour les options du filtre), triés. */
export function typesPresents(zones: readonly Pick<Zone, 'output_type'>[]): string[] {
  const s = new Set(zones.map(typeDeFiltre));
  const reseau = [...s].filter((x) => x !== TYPE_LOCAL).sort((a, b) => a.localeCompare(b));
  return s.has(TYPE_LOCAL) ? [TYPE_LOCAL, ...reseau] : reseau;
}

function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Filtre texte (nom de zone, nom de l'appareil, protocole) ET type. */
export function filtrerZones<T extends Zone>(zones: readonly T[], texte: string, type: string): T[] {
  const q = normaliser(texte.trim());
  return zones.filter((z) => {
    if (type !== TOUS_LES_TYPES && typeDeFiltre(z) !== type) return false;
    if (!q) return true;
    const meule = normaliser([z.name, zoneDeviceName(z) ?? '', zoneTypeLabel(z.output_type)].join(' '));
    return meule.includes(q);
  });
}

export type EtatAppareil = 'offline' | 'playing' | 'paused' | 'stopped';

/** État lisible d'un coup d'œil. Hors ligne l'emporte : une zone hors ligne ne
 *  « joue » pas, même si le dernier état connu l'affirme. */
export function etatAppareil(z: Pick<Zone, 'online' | 'state'>): EtatAppareil {
  if (z.online === false) return 'offline';
  if (z.state === 'playing' || z.state === 'buffering') return 'playing';
  if (z.state === 'paused') return 'paused';
  return 'stopped';
}
