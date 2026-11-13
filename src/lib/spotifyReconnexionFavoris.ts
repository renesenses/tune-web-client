/**
 * tune-server-rust#8579 — gérer ses favoris Spotify demande une autorisation
 * que les comptes reliés avant ce changement n'ont pas (`user-library-modify`,
 * `user-follow-modify`). Le serveur refuse alors l'ajout ou le retrait d'un
 * favori par un 409 au code stable `spotify_reconnexion_favoris`.
 *
 * Décision de Bertrand (12/11/2026) : la reconnexion est acceptée, AVEC un
 * message qui la demande et le bouton qui y mène : « Reconnectez Spotify une
 * fois pour gérer vos favoris ».
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { notifications } from './stores/notifications';
import { activeView } from './stores/navigation';
import { v2SettingsTarget } from './stores/v2SettingsNav';

export const CODE_RECONNEXION_FAVORIS_SPOTIFY = 'spotify_reconnexion_favoris';
export const CLE_MESSAGE = 'favorites.spotifyReconnect';
export const CLE_BOUTON = 'favorites.spotifyReconnectAction';

/** Ouvre l'endroit où Spotify se (re)connecte : Réglages › Accès et jetons ›
 *  streaming (même cible que « Accéder aux réglages » de l'écran Streaming). */
export function ouvrirReconnexionSpotify(): void {
  v2SettingsTarget.set({ tab: 'access', section: 'streaming' } as any);
  activeView.set('settings' as any);
}

/** Le message et son bouton. */
export function annoncerReconnexionFavoris(): void {
  const tr = get(t);
  notifications.withAction(tr(CLE_MESSAGE as any), tr(CLE_BOUTON as any), ouvrirReconnexionSpotify, 15000);
}
