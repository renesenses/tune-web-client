/**
 * Ce que le serveur dit de la répétition et de la lecture aléatoire d'une zone.
 *
 * Ces deux réglages appartiennent à la zone, pas à l'écran : le serveur les
 * persiste à chaque changement et les restaure au démarrage. Le client, lui,
 * n'en tenait qu'un miroir local repartant de « off » à chaque chargement de
 * page — d'où une zone qui bouclait sur une piste pendant que le bouton
 * affichait « désactivé », et un premier clic qui renvoyait « one » au lieu de
 * l'éteindre (Dominique Comet, #1810).
 *
 * Ces champs ne voyagent que dans les instantanés WebSocket : ni `/zones` ni
 * `/zones/{id}` ne les portent. Une charge utile qui ne les contient pas ne
 * dit donc pas « c'est éteint », elle ne dit rien — et ne doit rien écraser.
 */
export type RepeatMode = 'off' | 'one' | 'all';

export type TransportState = { repeat?: RepeatMode; shuffle?: boolean };

function isRepeatMode(v: unknown): v is RepeatMode {
  return v === 'off' || v === 'one' || v === 'all';
}

/**
 * La part « transport » d'un instantané de zone, réduite à ce qui est
 * réellement présent. Renvoie un objet vide quand la charge utile est muette.
 */
export function transportOf(zone: unknown): TransportState {
  if (!zone || typeof zone !== 'object') return {};
  const z = zone as Record<string, unknown>;
  const out: TransportState = {};
  if (isRepeatMode(z.repeat)) out.repeat = z.repeat;
  if (typeof z.shuffle === 'boolean') out.shuffle = z.shuffle;
  return out;
}

/**
 * Fusionne un nouvel instantané sur ce qu'on savait déjà de la zone : un champ
 * absent laisse la valeur précédente en place.
 */
export function mergeTransport(previous: TransportState | undefined, zone: unknown): TransportState {
  return { ...(previous ?? {}), ...transportOf(zone) };
}
