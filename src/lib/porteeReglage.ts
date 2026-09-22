/**
 * Le réglage d'égaliseur a-t-il atteint le son ? (tune-server-rust#4680)
 *
 * `applied_live: false` voulait dire trois choses : rien ne joue, la piste
 * suivante… ou une zone réseau dont le flux est relancé dans l'instant. Les
 * écrans traduisaient tout « prendra effet à la piste suivante » — faux sur
 * un Eversolo en DLNA, où l'effet s'entend aussitôt (recette v0.9.161).
 *
 * Le serveur dit désormais QUAND (`portee`). On le lit d'abord ; sans lui
 * (serveur antérieur), on retombe sur `applied_live` tel quel.
 *
 * Rend `true` (entendu, ou dans l'instant), `false` (piste suivante
 * seulement) ou `undefined` (rien à annoncer : rien ne joue, ou le serveur
 * ne dit rien).
 */
export type PorteeDuReglage = 'immediate' | 'restart' | 'next_track' | 'not_playing';

export function atteintLeSon(
  appliedLive: boolean | null | undefined,
  portee: string | null | undefined,
): boolean | undefined {
  if (portee === 'immediate' || portee === 'restart') return true;
  if (portee === 'next_track') return false;
  if (portee === 'not_playing') return undefined;
  return appliedLive ?? undefined;
}
