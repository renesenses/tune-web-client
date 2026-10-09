/**
 * LA DISPOSITION DE CANAUX DE LA PISTE EN COURS — demande de Bertrand,
 * 28/09/2026 : « ajouter un libellé de canal (surtout pour le multicanal) dans
 * la vue Lecture en cours sous la pochette ».
 *
 * ## Où la valeur se trouve, et où elle ne se trouve PAS
 *
 * 🔴 L'état de zone ne la porte pas. Relevé sur le .18 le 28/09, le
 * `current_track` d'une zone qui joue contient `format`, `sample_rate`,
 * `bit_depth`, `bitrate_kbps` — et rien sur les canaux. `NowPlaying.svelte` le
 * dit déjà de son côté : « ni album_id, ni artist_id, ni channels, ni
 * file_path — le serveur ne les envoie pas ».
 *
 * `GET /library/tracks/{id}` les porte, lui : `channels` ET un `channel_badge`
 * déjà calculé. C'est l'appel que la fiche fait DÉJÀ pour le Dynamic Range
 * (#1388, 17/09) — le libellé sort de la même réponse, sans une requête de
 * plus.
 *
 * Conséquence assumée : sur un titre Qobuz/TIDAL ou une radio, il n'y a aucune
 * source. Pas de pastille — on ne l'invente pas (arbitrage de Bertrand,
 * 28/09). Les lettres `L`/`R` du crête-mètre, elles, restent : elles décrivent
 * l'INSTRUMENT, qui mesure bien deux voies quelle que soit la source.
 *
 * ## Pourquoi on lit le badge du serveur au lieu de le recalculer
 *
 * 🔴 « Deux règles pour un même fait finissent par diverger » — c'est écrit
 * dans `SettingsV2.svelte` à propos de `channel_layout_status`, et ça vaut
 * ici. Le serveur possède la règle (`ChannelLayout::from_channel_count` et
 * `badge()`, `tune-core/src/audio/channels.rs`), y compris la décision de ne
 * RIEN badger en mono et en stéréo. Redériver « 6 canaux ⇒ 5.1 » dans le
 * client, c'est s'engager à suivre chaque évolution de cette table.
 *
 * Ce module ne fait donc qu'une chose : traduire le badge du serveur, qui est
 * un libellé d'écran anglophone pour ses valeurs hautes (`7.1.4 Atmos / Auro-3D`,
 * `Immersive 24ch`), dans le vocabulaire que le client possède DÉJÀ en onze
 * langues — les clés `zoneConfig.channels_*` du sélecteur de canaux.
 */

/**
 * Le badge du serveur → la clé du vocabulaire client.
 *
 * Les valeurs sont celles de `ChannelLayout::badge()`. Mono et stéréo n'y
 * figurent pas : le serveur rend `null` pour elles, et c'est voulu — un disque
 * stéréo n'a pas de pastille à porter.
 */
const CLES_PAR_BADGE: Readonly<Record<string, string>> = {
  '5.1': 'zoneConfig.channels_surround51',
  '7.1': 'zoneConfig.channels_surround71',
  '5.1.4': 'zoneConfig.channels_surround514',
  // tune-server-rust#5576 — 7.1.4 et 9.1.6 existent en Atmos comme en
  // Auro-3D : le serveur nomme désormais les deux. L'ancien badge reste
  // reconnu, pour un serveur antérieur.
  '7.1.4 Atmos / Auro-3D': 'zoneConfig.channels_surround714',
  '9.1.6 Atmos / Auro-3D': 'zoneConfig.channels_surround916',
  '7.1.4 Atmos': 'zoneConfig.channels_surround714',
  '9.1.6 Auro-3D': 'zoneConfig.channels_surround916',
  'Immersive 24ch': 'zoneConfig.channels_immersive24',
  'Immersive 32ch': 'zoneConfig.channels_immersive32',
};

/**
 * Ce qu'il faut écrire dans la pastille, ou `null` s'il n'y a rien à écrire.
 *
 * @param badge `channel_badge` tel que le serveur l'envoie. `null` /
 *   `undefined` / chaîne vide ⇒ pas de pastille : mono, stéréo, ou piste dont
 *   on ne sait rien.
 * @param traduire la fonction de traduction (`$t`).
 *
 * Un badge INCONNU — serveur plus récent que ce client — est rendu tel quel
 * plutôt qu'avalé. C'est déjà le parti pris de la ligne « Sortie réelle » des
 * Réglages : mieux vaut un libellé anglais qu'aucun libellé.
 */
export function libelleCanaux(
  badge: string | null | undefined,
  traduire: (cle: string) => string,
): string | null {
  if (!badge) return null;
  const cle = CLES_PAR_BADGE[badge];
  if (!cle) return badge;
  // `$t` rend la CLÉ quand elle manque : dans ce cas le badge brut reste plus
  // lisible que `zoneConfig.channels_surround51` affiché en toutes lettres.
  const traduit = traduire(cle);
  return traduit === cle ? badge : traduit;
}
