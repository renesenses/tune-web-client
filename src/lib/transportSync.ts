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
 * Une charge utile qui ne les contient pas ne dit pas « c'est éteint », elle ne
 * dit rien — et ne doit rien écraser. C'est la règle que tient `transportOf`.
 *
 * ## Où ils voyagent (contrat vérifié, pas supposé)
 *
 * Longtemps, seul l'instantané WebSocket les portait. Ce n'est plus vrai :
 * renesenses/tune-server-rust#2153 (22/08, livré à partir de v0.9.100) les a
 * ajoutés aux deux charges utiles REST. Les quatre sources sont donc :
 *
 * | source | serveur |
 * |---|---|
 * | instantané WebSocket | `routes/ws.rs:130-131` |
 * | `GET /zones` | `routes/zones.rs:1534-1535` |
 * | `GET /zones/{id}` | `routes/zones.rs:1718-1719` |
 * | `playback.shuffle` / `playback.repeat` en direct | `routes/ws.rs:181` |
 *
 * Le client ne lisait que la première. Un aléatoire déjà actif restait donc
 * invisible tant que l'instantané n'arrivait pas, et une bascule faite depuis
 * une AUTRE télécommande n'atteignait jamais l'écran (#2092).
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

/**
 * La bascule que le serveur vient d'annoncer EN DIRECT, traduite en état de
 * transport — ou `null` si l'événement ne dit rien du transport.
 *
 * C'est le seul chemin par lequel un changement fait AILLEURS (application
 * mobile, seconde fenêtre du navigateur, Siri, widget, appel d'API) atteint
 * cet écran sans rechargement. `PlaybackManager::set_shuffle` émet
 * `{ event: "shuffle", data: { enabled } }`
 * (`tune-core/src/playback/mod.rs:698-725`) et `routes/ws.rs:181` le publie en
 * `playback.shuffle` après y avoir injecté `zone_id`.
 *
 * ⚠️ La forme n'est PAS celle d'une zone : l'événement dit `enabled` / `mode`,
 * la charge utile de zone dit `shuffle` / `repeat`. Passer l'événement brut à
 * `transportOf()` rendrait un objet VIDE — le recalage ne ferait rien, en
 * silence, et le défaut reviendrait sans qu'aucun test ne rougisse. D'où cette
 * traduction explicite, isolée ici pour être vérifiable.
 */
export function transportDeLEvenement(
  type: string,
  data: unknown,
): { zoneId: number; transport: TransportState } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.zone_id !== 'number') return null;

  // Un champ absent ou du mauvais type veut dire « je ne sais pas », jamais
  // « éteint » : écrire `false` par défaut remettrait le mensonge en place.
  if (type === 'playback.shuffle') {
    return typeof d.enabled === 'boolean'
      ? { zoneId: d.zone_id, transport: { shuffle: d.enabled } }
      : null;
  }
  if (type === 'playback.repeat') {
    return isRepeatMode(d.mode) ? { zoneId: d.zone_id, transport: { repeat: d.mode } } : null;
  }
  return null;
}
