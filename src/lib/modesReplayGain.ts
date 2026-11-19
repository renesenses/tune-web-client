// tune-server-rust#8968 — les choix ReplayGain à offrir, d'après le serveur.
//
// « Auto » n'est offert que si le serveur l'annonce dans `GET /config`
// (`replaygain_modes`). Un serveur plus ancien (rc12) lit `auto` comme `off` :
// l'écrire couperait le ReplayGain ET la campagne d'analyse, sans un mot.

export type ModeReplayGain = 'off' | 'track' | 'album' | 'auto';

const DE_BASE: ModeReplayGain[] = ['off', 'track', 'album'];

/** Les modes à afficher, dans l'ordre de l'interface. */
export function modesReplayGain(config: unknown): ModeReplayGain[] {
  const annonces = (config as { replaygain_modes?: unknown } | null | undefined)?.replaygain_modes;
  if (Array.isArray(annonces) && annonces.includes('auto')) {
    return [...DE_BASE, 'auto'];
  }
  return [...DE_BASE];
}
