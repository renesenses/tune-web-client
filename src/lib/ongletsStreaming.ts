/**
 * La rangée d'onglets de l'écran Streaming — et le dédoublonnage de Bandcamp
 * (#860).
 *
 * ## Ce qui n'allait pas
 *
 * Les onglets étaient la somme de DEUX listes qui ne se connaissaient pas :
 *
 *     const connected = services filtrés sur enabled && authenticated
 *     const tabs = [...connected, ...(bandcampLive ? ['__bandcamp__'] : [])]
 *
 * `bandcampLive` est une sonde FONCTIONNELLE : l'extension serveur peut être
 * installée sans être chargée, seule une réponse réelle de `/ext/bandcamp/tags`
 * prouve qu'elle est utilisable. L'hypothèse écrite en tête de `StreamingV2`
 * était que Bandcamp « n'est PAS authentifié comme les autres ».
 *
 * **Cette hypothèse n'est plus vraie depuis la liaison de compte**
 * (`tune-server-rust#2778`) : le greffon rend `authenticated: true` avec le
 * pseudo. Mesuré sur le .18 le 12/09/2026 :
 *
 *     GET /api/v1/streaming/services
 *     → "bandcamp": { "enabled": true, "authenticated": true, "username": "berthos" }
 *
 * Donc `connected` contient `bandcamp` ET `bandcampLive` ajoute
 * `__bandcamp__` : **deux onglets, deux clés, un seul service.** C'est le
 * signalement de FabienM (fil 1749, point 8).
 *
 * ## Quel onglet garde-t-on — et pourquoi ce n'est pas un goût
 *
 * L'arbitrage est MESURÉ, pas supposé. Sur le .18, compte lié, 12/09/2026,
 * les sept routes de l'onglet générique :
 *
 *     /streaming/bandcamp/playlists          → 502  « ne fournit pas de playlists »
 *     /streaming/bandcamp/favorites/albums   → 200  {"albums":[]}
 *     /streaming/bandcamp/favorites/tracks   → 200  {"tracks":[]}
 *     /streaming/bandcamp/favorites/artists  → 400  « pas de liste d'artistes suivis »
 *     /streaming/bandcamp/new-releases       → 200  []
 *     /streaming/bandcamp/featured           → 200  []
 *     /streaming/bandcamp/genres             → 200  []
 *
 * contre celles de l'extension, même serveur, même minute :
 *
 *     /ext/bandcamp/tags                     → 200  11 405 octets
 *     /ext/bandcamp/discover?tag=rock        → 200  23 217 octets
 *     /ext/bandcamp/collection               → 200     290 octets
 *
 * **L'onglet générique est vide de bout en bout.** Il n'y a rien à fusionner :
 * il n'apporte aucun contenu que l'extension n'apporte pas, et il apporte une
 * erreur. C'est lui qui part.
 *
 * ⚠️ Ce qui part avec lui, et qu'il faut dire : le widget « Mes playlists » de
 * Bandcamp — celui qui affiche « 502 Bad Gateway » — disparaît de l'écran.
 * **Ce n'est PAS le correctif de #859 et ce module ne le prétend pas.** Le 502
 * est une faute de SERVEUR (`svc_response` transforme tout `Err` de service en
 * `BAD_GATEWAY`, y compris un refus voulu) ; il reste entier sur la route, et
 * n'importe quel autre appelant le reverra. Il se corrige dans
 * `tune-server-rust`, pas ici. Le retrait de l'onglet se justifie seul : un
 * onglet en double dont les sept routes sont vides.
 *
 * Le pseudo, lui, ne se perd pas : il passe sur l'onglet qui survit
 * (`pseudoOnglet`), sans quoi la liaison de compte redeviendrait invisible —
 * la régression que `tune-server-rust#2778` avait justement réparée.
 */

/** La clé LOCALE au client de l'onglet servi par l'extension serveur. */
export const BANDCAMP_EXT = '__bandcamp__';

/** La clé que le SERVEUR emploie dans `GET /streaming/services`. */
export const BANDCAMP_SVC = 'bandcamp';

/** Ce que ce module lit d'un service — rien de plus. */
export interface EtatService {
  enabled?: boolean;
  authenticated?: boolean;
  username?: string | null;
}

/**
 * Un service n'entre dans les onglets que s'il est ACTIVÉ ET CONNECTÉ.
 *
 * Inchangé : c'est la règle d'origine, elle est juste. Ce qui change est
 * seulement ce qu'on en fait quand l'extension Bandcamp répond.
 */
export function servicesConnectes(
  services: Record<string, EtatService> | null | undefined,
): string[] {
  return Object.entries(services ?? {})
    .filter(([, v]) => !!v?.enabled && !!v?.authenticated)
    .map(([k]) => k);
}

/**
 * Les onglets de l'écran, dédoublonnés.
 *
 * 🔴 L'ordre compte : le dédoublonnage garde la PLACE du service générique
 * quand il en avait une. Sans cela, lier son compte Bandcamp ferait sauter
 * l'onglet de la première à la dernière position sous le curseur de
 * l'utilisateur, pour une raison qu'aucun écran n'explique.
 */
export function ongletsStreaming(
  services: Record<string, EtatService> | null | undefined,
  bandcampLive: boolean,
): string[] {
  const connectes = servicesConnectes(services);
  if (!bandcampLive) return connectes;
  // L'extension répond : elle ABSORBE le service générique, à sa place.
  const i = connectes.indexOf(BANDCAMP_SVC);
  if (i >= 0) {
    const onglets = [...connectes];
    onglets[i] = BANDCAMP_EXT;
    return onglets;
  }
  return [...connectes, BANDCAMP_EXT];
}

/**
 * Le pseudo à afficher sur un onglet, ou `null`.
 *
 * L'onglet de l'extension porte le pseudo du service GÉNÉRIQUE : c'est le même
 * compte Bandcamp, et c'est la seule des deux clés que le serveur renseigne.
 */
export function pseudoOnglet(
  cle: string,
  services: Record<string, EtatService> | null | undefined,
): string | null {
  const svc = cle === BANDCAMP_EXT ? BANDCAMP_SVC : cle;
  return (services ?? {})[svc]?.username || null;
}

/**
 * L'onglet ouvert au montage : le PREMIER de la rangée réellement affichée.
 *
 * 🔴 Il se déduit de `ongletsStreaming`, jamais de `services` directement.
 * Le calcul d'origine cherchait le premier service connecté — c'est-à-dire
 * `bandcamp`, la clé que le dédoublonnage vient justement de retirer : l'écran
 * se serait ouvert sur un onglet absent de sa propre rangée, aucun bouton
 * allumé et le panneau vide de l'onglet générique en dessous.
 */
export function ongletInitial(
  services: Record<string, EtatService> | null | undefined,
  bandcampLive: boolean,
): string | null {
  return ongletsStreaming(services, bandcampLive)[0] ?? null;
}
