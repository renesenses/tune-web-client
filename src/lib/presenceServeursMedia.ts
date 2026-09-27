/**
 * Présence des serveurs multimédia sur l'écran Réseau › Serveurs multimédia.
 *
 * `GET /network/media-servers` rend le REGISTRE DURABLE des serveurs vus, pas
 * seulement ceux qui répondent : chaque élément porte `presence`
 * (`present` / `absent`) et `last_seen_secs`. L'écran dessinait tout le
 * registre en pastilles identiques. Sur le .18 (27/09/2026), 11 pastilles pour
 * 6 serveurs présents : un Sonos et « Asset UPnP » éteints depuis des jours,
 * et trois Tune de test sur les ports 8896/8898/8899 du .41, affichés
 * « 192.168.1.41 TUNE » quatre fois. Ce n'étaient pas des doublons, c'étaient
 * des ABSENTS peints comme des présents.
 *
 * Règles :
 *  - seul `presence === 'absent'` rend un serveur absent. Un serveur antérieur
 *    à 0.9.118 n'envoie pas le champ : tout y reste présent, comme avant ;
 *  - deux présents sur le même hôte se distinguent par leur port ;
 *  - l'onglet ouvert d'office est le premier PRÉSENT, jamais un absent.
 */
import type { MediaServer } from './types';

export function estAbsent(s: MediaServer): boolean {
  return s.presence === 'absent';
}

export function repartirParPresence(servers: MediaServer[]): {
  presents: MediaServer[];
  absents: MediaServer[];
} {
  const presents: MediaServer[] = [];
  const absents: MediaServer[] = [];
  for (const s of servers) (estAbsent(s) ? absents : presents).push(s);
  return { presents, absents };
}

/** L'étiquette d'une pastille : l'hôte, suivi du port dès qu'un autre serveur
 *  de `voisins` partage cet hôte — sinon « 192.168.1.41 » deux fois ne
 *  désigne rien. */
export function etiquetteServeur(s: MediaServer, voisins: MediaServer[]): string {
  const partage = voisins.some((v) => v.id !== s.id && v.host === s.host);
  return partage && s.port ? `${s.host}:${s.port}` : s.host;
}

/** L'onglet ouvert d'office : on garde un choix encore valable, sinon le
 *  premier présent. Jamais un absent — il se choisit, il ne s'impose pas. */
export function ongletParDefaut(actif: string | null, servers: MediaServer[]): string | null {
  if (actif != null && servers.some((s) => s.id === actif)) return actif;
  return servers.find((s) => !estAbsent(s))?.id ?? null;
}

/** « il y a X » à partir de `last_seen_secs`, avec les libellés de
 *  l'historique. `null` si le serveur ne dit pas quand il a été vu. */
export function depuisSecondes(
  secs: number | null | undefined,
  t: (cle: string) => string,
): string | null {
  if (typeof secs !== 'number' || !Number.isFinite(secs) || secs < 0) return null;
  const min = Math.floor(secs / 60);
  const n = (cle: string, v: number) => t(cle).replace('{n}', String(v));
  if (min < 1) return t('v2.hist.justNow');
  if (min < 60) return n('v2.hist.minutesAgo', min);
  const h = Math.floor(min / 60);
  if (h < 24) return n('v2.hist.hoursAgo', h);
  return n('v2.hist.daysAgo', Math.floor(h / 24));
}
