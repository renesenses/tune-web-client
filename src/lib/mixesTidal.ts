/**
 * tune-server-rust#7822 — les mixes personnels du compte TIDAL (My Daily
 * Discovery, My Mix 1 à 8, My New Arrivals…), pour la rangée « Vos mixes »
 * de Streaming › TIDAL.
 *
 * Le serveur les sert sous `/streaming/{service}/mixes`, sous la forme d'une
 * playlist de service : `source_id` vaut `mix:<id>`, et la lecture comme
 * l'ajout à la file passent par `streaming_playlist_id`, comme une playlist.
 *
 * La rangée n'existe que pour TIDAL, et seulement si le compte a des mixes :
 * un compte sans mix, un serveur qui ne connaît pas encore la route (404) ou
 * une panne passagère n'affichent rien, sans message d'erreur.
 */
import type { StreamingPlaylist } from './types';

/** Les services dont l'écran montre la rangée des mixes. */
export const SERVICES_AVEC_MIXES: readonly string[] = ['tidal'];

export function proposeDesMixes(service: string | null | undefined): boolean {
  return !!service && SERVICES_AVEC_MIXES.includes(service);
}

/**
 * Les mixes à afficher : la liste du serveur, sans les entrées qu'on ne
 * saurait ni lire ni ouvrir (sans identifiant). `[]` pour un service sans
 * mixes, sans appeler le serveur.
 */
export async function chargerMixes(
  service: string | null | undefined,
  lire: (service: string) => Promise<StreamingPlaylist[] | null | undefined>,
): Promise<StreamingPlaylist[]> {
  if (!proposeDesMixes(service)) return [];
  try {
    const rendus = await lire(service as string);
    return (Array.isArray(rendus) ? rendus : []).filter(
      (m) => typeof m?.source_id === 'string' && m.source_id !== '',
    );
  } catch {
    return [];
  }
}

/** Un mix de service : `source_id` en `mix:<id>`, attribué par le serveur. */
export function estUnMix(p: { source_id?: unknown } | null | undefined): boolean {
  return typeof p?.source_id === 'string' && p.source_id.startsWith('mix:');
}

/**
 * La deuxième ligne de la tuile d'un mix : ses artistes (le `subTitle` de
 * TIDAL, servi en `description`), ou rien. Jamais un nombre de titres : la
 * liste des mixes de TIDAL ne le donne pas, le serveur rend `track_count: 0`,
 * et la tuile de playlist écrivait alors « 0 titres » sur chaque mix.
 */
export function sousTitreDeMix(p: { description?: unknown } | null | undefined): string {
  return typeof p?.description === 'string' ? p.description.trim() : '';
}
