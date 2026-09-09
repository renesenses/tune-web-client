/**
 * Appareils ignorés (#1280) — faire taire un appareil, et savoir le retrouver.
 *
 * # Ce que le serveur porte déjà (v0.9.127)
 *
 * Une table `ignored_devices` **sans clé étrangère**, avec un instantané
 * d'identité figé à l'insertion. Trois identités déjà en service y sont
 * réutilisées, dans cet ordre : l'identifiant annoncé, la MAC, puis
 * **hôte + nom annoncé** (le nom est EXIGÉ, sans quoi un appareil différent
 * héritant de l'adresse par le DHCP serait bloqué à tort). Un Sonos qui
 * s'annonce sous trois UUID au même hôte est donc ignoré **une fois**.
 *
 * * `GET    /devices/ignored`        — la liste de révision ;
 * * `POST   /devices/{id}/ignore`    — faire taire, durablement ;
 * * `DELETE /devices/{id}/ignore`    — débloquer, en libérant TOUTES les
 *   identités du même appareil.
 *
 * # Les deux exigences que ce module sert
 *
 * 1. **Appeler la route durable.** La croix des réglages appelait
 *    `DELETE /devices/{id}` — qui ne retire l'appareil que du registre en
 *    mémoire et des appareils manuels persistés. Rien n'empêchait la
 *    découverte de le ré-enregistrer : « ils disparaissent bien sur le coup
 *    mais réapparaissent rapidement » (Patatorz). Ce n'est pas la même route.
 * 2. **Un écran « appareils ignorés ».** Un appareil ignoré n'est plus annoncé
 *    NULLE PART : ni dans `GET /devices`, ni dans le sélecteur de zone. Sans
 *    liste de révision, l'utilisateur se piège lui-même — il masque un
 *    appareil et n'a plus aucun moyen de le retrouver. `GET /devices/ignored`
 *    est la seule vue depuis laquelle le geste est réversible.
 */

/** L'identité d'un appareil ignoré, FIGÉE au moment du geste — jamais
 *  l'appareil vivant, puisqu'il n'est plus annoncé. */
export interface AppareilIgnore {
  device_id: string;
  /** MAC normalisée `AA:BB:CC:DD:EE:FF`, ou vide si l'appareil n'en annonce
   *  aucune. */
  mac: string;
  host: string;
  /** Le nom ANNONCÉ, pas le nom de la zone : c'est lui que la découverte
   *  représenterait au prochain scan. */
  name: string;
  device_type: string;
  created_at: string | null;
}

/**
 * Le nom à afficher pour un appareil ignoré.
 *
 * L'instantané peut se réduire à l'identifiant : `instantane_d_identite`
 * interroge le scanner vivant, puis le registre des sorties, puis la zone
 * persistée, et si aucune ne répond il ne garde que le `device_id`. Une ligne
 * vide serait alors indébloquable en pratique — l'utilisateur ne saurait pas
 * ce qu'il libère. On retombe donc sur l'hôte, puis sur l'identifiant.
 */
export function libelleAppareilIgnore(d: AppareilIgnore): string {
  const nom = (d.name ?? '').trim();
  if (nom) return nom;
  const hote = (d.host ?? '').trim();
  if (hote) return hote;
  return (d.device_id ?? '').trim();
}

/**
 * La ligne de détail : ce qui distingue deux appareils au nom identique.
 *
 * L'hôte et la MAC sont les deux identités que le serveur teste après
 * l'identifiant ; les afficher, c'est dire à l'utilisateur POURQUOI ses trois
 * UUID de Sonos ne font qu'une seule ligne. Les champs vides sont écartés
 * plutôt que rendus par un tiret : le serveur les rend vides, pas absents.
 */
export function detailAppareilIgnore(d: AppareilIgnore): string {
  const morceaux = [d.host, d.mac].map((s) => (s ?? '').trim()).filter(Boolean);
  return morceaux.join(' · ');
}

/** L'étiquette de transport, telle que la liste des appareils l'affiche déjà.
 *  Vide si le serveur n'a rien pu figer — auquel cas on n'affiche pas de
 *  pastille plutôt qu'une pastille vide. */
export function transportAppareilIgnore(d: AppareilIgnore): string {
  return (d.device_type ?? '').trim().toUpperCase();
}

/**
 * Les appareils encore annoncés, une fois retirés ceux que l'utilisateur vient
 * d'ignorer.
 *
 * Le serveur retire déjà l'appareil de `GET /devices` (et ses identités
 * jumelles), mais la liste affichée a été chargée AVANT le geste : sans ce
 * filtre local, la ligne resterait à l'écran jusqu'au rechargement suivant, et
 * l'utilisateur croirait que rien ne s'est passé. On retire l'identifiant visé
 * ET ceux que le serveur dit avoir libérés/bloqués avec lui.
 */
export function sansAppareils<T extends { id: string }>(
  liste: readonly T[],
  identifiants: readonly string[],
): T[] {
  const retires = new Set(identifiants.filter(Boolean));
  return liste.filter((d) => !retires.has(d.id));
}
