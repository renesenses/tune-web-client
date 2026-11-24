/**
 * tune-server-rust#8797 — « Connexion à mozaiklabs.fr expirée ».
 *
 * Après un refus du renouvellement de la session par le site (#8238,
 * `invalid_grant`), le serveur garde les jetons mais cesse tout appel au site
 * au nom du compte. `GET /cloud/sso/status` le dit déjà :
 * `{ connected: false, reconnect_required: true, reconnect_required_since }`.
 *
 * Sans bandeau, l'utilisateur ne voyait rien : Tune Circle, la copie en ligne
 * et les envois au compte s'arrêtaient en silence, et le seul geste à portée
 * (« Se déconnecter » puis « Se connecter ») efface la copie en ligne et les
 * partages Tune Circle. Le bandeau dit l'état, hors des Réglages, et propose
 * de SE RECONNECTER, chemin qui n'efface rien.
 *
 * Pas de route nouvelle : on relit le statut existant.
 */
import { derived, writable } from 'svelte/store';

/** Ce que le bandeau doit savoir, ou `null` : rien à afficher. */
export interface EtatReconnexion {
  /** Instant du refus (RFC 3339), quand le serveur le connaît. */
  depuis: string | null;
}

/**
 * Lit la réponse de `GET /cloud/sso/status`.
 *
 * - `reconnect_required` faux ou absent (serveur plus ancien) : rien.
 * - `details_hidden` : le serveur ne montre pas son compte à cet appareil, et
 *   ce n'est pas d'ici qu'on relie le serveur ; rien à proposer.
 * - Un profil qui a relié SON compte (`scope: "profile"`) : le serveur rend
 *   toujours `reconnect_required: false`, donc rien non plus.
 */
export function etatReconnexion(sso: unknown): EtatReconnexion | null {
  const s = sso as Record<string, unknown> | null | undefined;
  if (!s || s.reconnect_required !== true || s.details_hidden === true) return null;
  const depuis = typeof s.reconnect_required_since === 'string' && s.reconnect_required_since.trim()
    ? s.reconnect_required_since.trim()
    : null;
  return { depuis };
}

/** Date lisible du refus, dans la langue de l'interface ; `null` si illisible. */
export function dateDuRefus(depuis: string | null, langue: string): string | null {
  if (!depuis) return null;
  const d = new Date(depuis);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString(langue, { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return d.toLocaleString();
  }
}

/** Dernier état lu. Écrit par `BandeauReconnexionCloud`. */
export const reconnexionCloud = writable<EtatReconnexion | null>(null);

/**
 * Masqué par la croix, pour cet onglet seulement : au prochain chargement de
 * l'interface, le bandeau revient tant que la reconnexion reste requise.
 */
export const reconnexionMasquee = writable(false);

/** Le bandeau est-il à l'écran ? La coquille en a besoin pour sa mise en page. */
export const bandeauReconnexionVisible = derived(
  [reconnexionCloud, reconnexionMasquee],
  ([$etat, $masque]) => $etat !== null && !$masque,
);
