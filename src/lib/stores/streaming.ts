import { writable } from 'svelte/store';
import type { Album, Artist, Source, StreamingPlaylist, StreamingServiceStatus } from '../types';

export const activeStreamingService = writable<string | null>(null);

/** A service whose session the server has just reported as gone. */
export interface ExpiredSession {
  service: string;
  /** Account the session belonged to, when the server still knows it. */
  username: string | null;
}

export const expiredStreamingSession = writable<ExpiredSession | null>(null);

/**
 * Streaming service status, watched for sessions that drop out underneath us.
 *
 * The server clears a token once the provider rejects it, so `authenticated`
 * flips to false on its own — no user action involved. Every screen reads this
 * store through the same `set`, so the transition is detected here once rather
 * than in each of the eight call sites that refresh the status.
 */
function createStreamingServices() {
  const inner = writable<Record<string, StreamingServiceStatus>>({});
  let previous: Record<string, StreamingServiceStatus> = {};

  function apply(next: Record<string, StreamingServiceStatus>) {
    for (const [service, now] of Object.entries(next)) {
      const before = previous[service];
      if (!before) continue;
      if (before.authenticated && !now.authenticated && now.enabled) {
        expiredStreamingSession.set({
          service,
          // The server keeps the account name through an expiry precisely so
          // the prompt can address it; fall back to what we last saw.
          username: now.username ?? before.username ?? null,
        });
      } else if (!before.authenticated && now.authenticated) {
        // Reconnected — from this prompt or from Settings, either way it's over.
        expiredStreamingSession.update((e) => (e?.service === service ? null : e));
      }
    }
    previous = next;
    inner.set(next);
  }

  return {
    subscribe: inner.subscribe,
    set: apply,
    update: (fn: (v: Record<string, StreamingServiceStatus>) => Record<string, StreamingServiceStatus>) =>
      apply(fn(previous)),
  };
}

export const streamingServices = createStreamingServices();

export const pendingStreamingAlbum = writable<Album | null>(null);

/// D'où l'album en attente a été ouvert (`'home'`, …). Consommé par le
/// PREMIER retour de StreamingView : fermer une fiche ouverte depuis
/// l'accueil doit ramener à l'accueil, pas au service de streaming
/// (Bertrand, 25/08 : « le bouton retour renvoie sur Qobuz »). Toute
/// navigation interne au service (artiste, playlist, changement de
/// service) efface la provenance.
export const streamingAlbumOrigin = writable<string | null>(null);
export const pendingStreamingArtist = writable<Artist | null>(null);

/**
 * La cible de la FICHE ARTISTE DE SERVICE de la coquille v2 — #3825.
 *
 * ⚠️ Pourquoi pas `pendingStreamingArtist`, juste au-dessus. Celui-ci porte un
 * `Artist`, et son consommateur unique est `StreamingView` (v1), qui ouvre la
 * fiche DANS son propre écran avec ses états à lui. La v2 n'a pas cet écran :
 * elle route sur une vue. Deux contrats différents sous un même nom finiraient
 * par se marcher dessus le jour où les deux coquilles cohabiteraient.
 *
 * Le contenu est le strict nécessaire pour appeler les trois routes et
 * afficher un nom pendant le chargement — surtout pas un `Artist`, dont
 * l'`id` numérique n'a aucun sens pour un artiste de service.
 */
export const ficheArtisteService =
  writable<{ service: Source; id: string; nom: string } | null>(null);

/**
 * La cible de la FICHE ALBUM DE SERVICE de la coquille v2 — #1361, #3626.
 *
 * Même contrat que [`ficheArtisteService`] juste au-dessus, et pour la même
 * raison : `pendingStreamingAlbum` porte un `Album` et son consommateur unique
 * est `StreamingView` (v1), qui ouvre l'album DANS son écran.
 *
 * 🔴 `service` ET `id` ensemble, toujours : `AlbumDetailV2` n'apparie un album
 * distant que sur la PAIRE, et l'ouvrir sans son service le laisserait sur
 * « Chargement… » pour toujours.
 */
export const ficheAlbumService =
  writable<{ service: Source; id: string; titre: string } | null>(null);

/// Playlist de service à rouvrir en arrivant sur StreamingView (#2370).
///
/// Même plomberie que `pendingStreamingAlbum` : l'écran Favoris ne peut pas
/// ouvrir une playlist Qobuz par `playlists.id` — elle n'existe pas dans notre
/// base — il la désigne donc par son identifiant de service et laisse
/// StreamingView la charger.
export const pendingStreamingPlaylist = writable<StreamingPlaylist | null>(null);

export interface GenreBreadcrumbItem {
  id: string | null;
  name: string;
}

export const streamingGenreBreadcrumb = writable<GenreBreadcrumbItem[]>([]);
