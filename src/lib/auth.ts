// Auth token management for Tune web client
import { writable } from 'svelte/store';
import { signalerSessionExpiree, reprendreLaSession } from './stores/sessionExpiree';

/**
 * rc14 — compteur qui change à chaque changement de session (jeton posé ou
 * retiré, authentification activée). Les écrans qui décident de droits
 * (boutons des actions de la machine, `droitActionsMachine`) le lisent pour
 * se relire sans recharger la page.
 */
export const versionSession = writable(0);
export function signalerChangementDeSession(): void {
  versionSession.update((n) => n + 1);
}


const TOKEN_KEY = 'tune_jwt_token';
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Une session qui reprend retire le calque — quel que soit le chemin qui l'a
  // reprise. Le retour du SSO ne passe pas par le formulaire de connexion ;
  // c'est ici, au seul endroit où un jeton neuf existe, que le drapeau tombe.
  reprendreLaSession();
  signalerChangementDeSession();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  signalerChangementDeSession();
  /*
   * 🔴 ICI VIVAIT `window.location.hash = '#login'`, ET PERSONNE NE LE LISAIT.
   *
   * renesenses/tune-web-client#1021, mesuré sur `origin/main` le 14/09/2026 :
   * `App.svelte` n'écoute le `hashchange` que pour `#tv` (`isTvHash`, l. 707)
   * et `ShellV2` ne lit aucun hash — la v2 navigue par `pushState`. Le jeton
   * partait donc en silence : plus rien ne chargeait, aucun message, aucun
   * écran de connexion. L'utilisateur concluait à une panne du serveur.
   *
   * Le hash est remplacé par un magasin que les DEUX coquilles observent, et
   * non doublé : le laisser aurait gardé une seconde navigation concurrente,
   * et un `#login` collé à l'URL que rien n'efface.
   */
  signalerSessionExpiree();
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}
