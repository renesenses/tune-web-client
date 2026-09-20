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

/** Le préfixe d'une source « catalogue », partagé avec le serveur (#4473). */
export const PREFIXE_CATALOGUE = 'catalogue:';
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
  avecCatalogue = false,
): string[] {
  const rang = (s: string) => {
    const i = ORDRE_SERVICES.indexOf(s);
    return i === -1 ? ORDRE_SERVICES.length : i;
  };
  const services = servicesInterrogeables(statuts)
    .map((s) => s.toLowerCase())
    .filter((s) => !SOURCES_BIBLIOTHEQUE.includes(s))
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));
  // #4473 — un service peut offrir DEUX choix, et ils ne veulent pas dire la
  // même chose : ses favoris (gratuit, hors ligne) et son catalogue (une
  // recherche, bornée à l'artiste ou l'album que la règle nomme). Le catalogue
  // suit son service dans la liste, pour qu'on voie les deux côte à côte.
  //
  // 🔴 `avecCatalogue` n'est PAS une préférence d'affichage : il dit que le
  // moteur SAIT honorer la valeur. Les deux chemins le savent désormais —
  // `smart_collections::avec_albums_de_catalogue` pour les albums (v0.9.158)
  // et `smart_playlists::avec_pistes_de_catalogue` pour les pistes (second
  // volet de #4473). Le jour où un troisième écran réutilise cette liste sans
  // que son moteur suive, il doit laisser le drapeau à `false` : proposer une
  // case que le moteur ignore, c'est refaire #1231.
  const liste = [
    ...SOURCES_BIBLIOTHEQUE,
    ...services.flatMap((s) => (avecCatalogue ? [s, `${PREFIXE_CATALOGUE}${s}`] : [s])),
  ];
  const v = (actuelle ?? '').trim();
  if (v && !liste.some((s) => s.toLowerCase() === v.toLowerCase())) liste.push(v);
  return liste;
}

/**
 * Le service désigné par une valeur `catalogue:<service>`, s'il y en a un.
 *
 * 🔴 La MÊME convention que le serveur (`tune-smart-http/src/catalogue.rs`,
 * `PREFIXE_CATALOGUE`). Deux graphies divergentes rendraient une règle que
 * l'écran écrit et que le moteur ignore — exactement le défaut de #4469.
 */
export function serviceDuCatalogue(source: string): string | null {
  const s = (source ?? '').trim().toLowerCase();
  if (!s.startsWith(PREFIXE_CATALOGUE)) return null;
  const nom = s.slice(PREFIXE_CATALOGUE.length).trim();
  return nom || null;
}

/** Le libellé d'une source ; `local` passe par la traduction de l'écran. */
export function libelleSource(source: string, local: string, catalogue?: string): string {
  const s = (source ?? '').toLowerCase();
  if (s === 'local') return local;
  // #4473 — « Catalogue Qobuz », pas « Catalogue:qobuz ». Sans le gabarit
  // traduit, la valeur brute se montrerait telle quelle à l'utilisateur.
  const cat = serviceDuCatalogue(s);
  if (cat) {
    const nom = NOMS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
    return (catalogue ?? 'Catalogue {service}').replace('{service}', nom);
  }
  return NOMS[s] ?? (source ? source.charAt(0).toUpperCase() + source.slice(1) : '');
}

/**
 * Une source de SERVICE ne désigne pas tout le catalogue, mais ce que Tune en
 * connaît durablement pour ce profil : ses **favoris**.
 *
 * 🔴 #1231 — Bertrand, 18/09/2026 : « Smart Collection, source qobuz retourne
 * 0 album ». Sa playlist d'essai `Test Qobuz Coltrane` — `artist = John
 * Coltrane` ET `source = qobuz` — rendait **0 piste**, et c'était la BONNE
 * réponse : ses 21 favoris de pistes Qobuz ne contiennent aucun Coltrane. La
 * règle porte sur les favoris, pas sur le catalogue Qobuz.
 *
 * Le comportement est celui décidé le 17/09 et documenté côté serveur
 * (`source_streaming.rs`). Mais rien à l'écran ne le disait, et « Source :
 * Qobuz » se lit naturellement comme « tout ce qui vient de Qobuz ». L'écran
 * doit nommer ce qu'il fait.
 *
 * `local` et `upnp` sont la bibliothèque elle-même : rien à préciser pour
 * elles.
 */
export function estSourceDeService(source: string): boolean {
  const s = (source ?? '').trim().toLowerCase();
  return s !== '' && !SOURCES_BIBLIOTHEQUE.includes(s) && !s.startsWith('upnp:');
}
