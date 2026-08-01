/**
 * Anonymisation du rapport avant publication.
 *
 * Le rapport local garde tout : c'est un fichier sur la machine de celui qui
 * lance l'automate, et le detail sert au diagnostic. Une issue publique, elle,
 * emporte tout ce qui traine dans les libelles — et l'automate explore une
 * application qui decouvre le reseau local. Un passage ordinaire ramasse le
 * modele du televiseur du salon, le nom des AirPods (prenom compris), l'adresse
 * IP de la machine et le chemin du dossier personnel.
 *
 * Rien de tout cela n'aide a corriger un bug. Tout sort avant publication.
 */
import { homedir, hostname, userInfo } from 'node:os';

/**
 * @param {object} opts
 * @param {string[]} opts.deviceNames  zones et sorties vues par le serveur
 * @param {string[]} opts.extraNames   termes supplementaires a masquer
 * @returns {(text: string) => string}
 */
export function createScrubber({ deviceNames = [], extraNames = [] } = {}) {
  const rules = [];

  // 1. Appareils du reseau, tels que le serveur les nomme. C'est la source la
  //    plus fiable : inutile de deviner ce qui ressemble a un nom d'enceinte.
  //    Les plus longs d'abord, sinon « MacBook » masquerait la moitie de
  //    « MacBook Pro de … » en laissant le reste.
  const devices = [...new Set(deviceNames.filter((n) => n && n.length > 2))]
    .sort((a, b) => b.length - a.length);
  for (const name of devices) rules.push([literal(name), '<appareil>']);

  // 2. Identite de la machine et de son proprietaire.
  const user = safe(() => userInfo().username);
  const host = safe(() => hostname());
  const home = safe(() => homedir());
  if (home) rules.push([literal(home), '~']);
  if (host) rules.push([literal(host.replace(/\.local$/, '')), '<machine>']);
  // Un nom de compte peut ne faire que deux lettres (« jp ») : le seuil doit
  // descendre jusque-la. Les limites de mot evitent les faux positifs — « jp »
  // ne masque pas le « jp » de « jpeg ».
  if (user && user.length >= 2) rules.push([new RegExp(`\\b${escape(user)}\\b`, 'gi'), '<utilisateur>']);
  for (const name of extraNames) if (name && name.length > 2) rules.push([literal(name), '<nom>']);

  // 3. Adresses du reseau local. La boucle locale reste lisible : elle ne
  //    designe personne et rend les traces comprehensibles.
  rules.push([/\b(?!127\.0\.0\.1)(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip-locale>']);
  // Le port de la boucle locale change a chaque passage (serveur jetable sur un
  // port libre) : le figer evite des titres d'issue differents pour un meme
  // defaut, avec ou sans schema devant l'adresse.
  rules.push([/\bhttps?:\/\/127\.0\.0\.1:\d+/g, 'http://localhost:8888']);
  rules.push([/\b127\.0\.0\.1:\d+/g, 'localhost:8888']);
  rules.push([/\b[\w-]+\.local\b/g, '<machine>.local']);

  // 4. Identifiants de sortie construits sur une IP (« airplay-192.168.1.20-7000 »).
  rules.push([/\b(airplay|chromecast|upnp|dlna|sonos)-[\w.-]+/gi, '$1-<appareil>']);

  return function scrub(value) {
    if (typeof value !== 'string') return value;
    let out = value;
    for (const [pattern, replacement] of rules) out = out.replace(pattern, replacement);
    return out;
  };
}

/** Applique l'anonymisation a toutes les chaines d'une structure. */
export function scrubDeep(value, scrub) {
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, scrub));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = scrubDeep(v, scrub);
    return out;
  }
  return value;
}

/**
 * Demande au serveur les noms qu'il connait : zones, sorties, appareils.
 * Sans reponse, l'anonymisation se rabat sur ses regles generiques.
 */
export async function discoverDeviceNames(baseUrl) {
  const names = [];
  for (const path of ['/api/v1/zones', '/api/v1/outputs', '/api/v1/devices']) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) continue;
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items || data.zones || data.outputs || data.devices || [];
      for (const item of items) {
        for (const key of ['name', 'display_name', 'friendly_name', 'zone_name', 'id']) {
          if (typeof item?.[key] === 'string') names.push(item[key]);
        }
      }
    } catch { /* endpoint absent : on continue */ }
  }
  return names;
}

function literal(text) {
  return new RegExp(escape(text), 'g');
}

function escape(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safe(fn) {
  try { return fn(); } catch { return null; }
}
