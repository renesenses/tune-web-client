/**
 * LA LISTE DES SOURCES d'une règle « Source » — playlists et collections
 * intelligentes (renesenses/tune-server-rust#4299).
 *
 * FabienM, 17/09/2026 : « ajouter une règle dans les smartplaylists sur la
 * source (Locale, Upnp, Qobuz, Tidal, Youtube, Bandcamp). Le critère source
 * existe déjà mais il ne fonctionne pas ». Bertrand : « affiche la liste des
 * sources disponibles, dans la règle ».
 *
 * La règle était un champ TEXTE libre : il fallait deviner qu'on écrit
 * `local`, et « Qobuz » ne rendait rien (le serveur ignorait la règle, puis ne
 * connaissait que `local` et `upnp`). Le serveur ramène désormais les FAVORIS
 * d'un service nommé par la règle ; ce module dit quelles valeurs proposer.
 *
 * DISPONIBLES = la bibliothèque (`local`, `upnp`), puis les services dont la
 * session est OUVERTE — un service déconnecté n'a rien à rendre. Ordre des
 * services : celui de la page artiste commune (#4330), puis les autres.
 */
import type { StreamingServiceStatus } from './types';
import { servicesInterrogeables } from './albumsArtisteStreaming';

export const SOURCES_BIBLIOTHEQUE: readonly string[] = ['local', 'upnp'];
const ORDRE_SERVICES: readonly string[] = ['qobuz', 'tidal', 'youtube', 'bandcamp'];

const NOMS: Readonly<Record<string, string>> = {
  upnp: 'UPnP',
  qobuz: 'Qobuz',
  tidal: 'Tidal',
  youtube: 'YouTube',
  bandcamp: 'Bandcamp',
  deezer: 'Deezer',
  spotify: 'Spotify',
  amazon: 'Amazon Music',
};

/**
 * Les valeurs à proposer. `actuelle` : la valeur d'une règle déjà enregistrée,
 * gardée dans la liste même si sa source n'est plus disponible — sinon ouvrir
 * la règle pour la relire l'effacerait sans qu'on l'ait touchée.
 */
export function sourcesDisponibles(
  statuts: Record<string, StreamingServiceStatus> | null | undefined,
  actuelle?: string | null,
): string[] {
  const rang = (s: string) => {
    const i = ORDRE_SERVICES.indexOf(s);
    return i === -1 ? ORDRE_SERVICES.length : i;
  };
  const services = servicesInterrogeables(statuts)
    .map((s) => s.toLowerCase())
    .filter((s) => !SOURCES_BIBLIOTHEQUE.includes(s))
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));
  const liste = [...SOURCES_BIBLIOTHEQUE, ...services];
  const v = (actuelle ?? '').trim();
  if (v && !liste.some((s) => s.toLowerCase() === v.toLowerCase())) liste.push(v);
  return liste;
}

/** Le libellé d'une source ; `local` passe par la traduction de l'écran. */
export function libelleSource(source: string, local: string): string {
  const s = (source ?? '').toLowerCase();
  if (s === 'local') return local;
  return NOMS[s] ?? (source ? source.charAt(0).toUpperCase() + source.slice(1) : '');
}
