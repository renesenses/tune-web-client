/**
 * Forum, fil 2694 (Ilan) ; décision de Bertrand du 13/11/2026 — « Continuer
 * avec des titres similaires à la fin de la file », comme Roon. Activé par
 * défaut côté serveur (tune-server-rust, migration 152 / PG 118).
 *
 * rc14 (retours de Rémi, go de Bertrand du 25/11/2026) — le réglage QUITTE la
 * fenêtre de configuration de la zone : c'est une option de la FILE
 * D'ATTENTE (`QueueV2`, `FileMini`), là où l'on voit la file se vider. La
 * logique de la fenêtre est reprise ici à l'identique :
 *
 *   - couper écrit `autoplay_enabled: false` ;
 *   - remettre rend le MODE NOMMÉ d'avant la coupure (album au hasard…,
 *     #2271) plutôt que de le ramener à « titres similaires » ;
 *   - la zone rendue par le serveur est reposée dans le magasin (`syncZone`) :
 *     toutes les vues suivent.
 */
import * as api from './api';
import { syncZone } from './stores/zones';
import type { Zone } from './types';

/** Un mode NOMMÉ (`similar`, `random_album`…), `null` pour « coupé » ou absent. */
export function modeNomme(mode: string | undefined | null): string | null {
  return mode && mode !== 'off' ? mode : null;
}

/** Le dernier mode nommé vu pour chaque zone, pour le rendre à la remise. */
const memoire = new Map<number, string>();

/** Retenir le mode nommé courant d'une zone (appelé à chaque lecture). */
export function retenirModeNomme(zone: Pick<Zone, 'id' | 'autoplay_mode'> | null | undefined): void {
  if (zone?.id == null) return;
  const m = modeNomme(zone.autoplay_mode);
  if (m) memoire.set(zone.id, m);
}

/** Pour les tests. */
export function _oublierModes(): void {
  memoire.clear();
}

/**
 * Active ou coupe la radio de fin de file d'une zone. Rend la zone à jour
 * (déjà reposée dans le magasin) ; une panne remonte à l'appelant.
 */
export async function reglerRadioFinDeFile(zone: Pick<Zone, 'id' | 'autoplay_mode'>, actif: boolean): Promise<Zone | null> {
  if (zone.id == null) return null;
  retenirModeNomme(zone);
  const avant = memoire.get(zone.id) ?? null;
  const maj = actif && avant && avant !== 'similar'
    ? await api.updateZoneAutoplayMode(zone.id, avant)
    : await api.updateZoneAutoplay(zone.id, actif);
  if (maj) syncZone(maj);
  return maj ?? null;
}
