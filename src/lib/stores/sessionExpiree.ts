import { writable } from 'svelte/store';

/**
 * « La session a expiré » — le seul fait que les DEUX coquilles observent.
 *
 * 🔴 POURQUOI UN MAGASIN ET PAS LE HASH (renesenses/tune-web-client#1021).
 *
 * `clearToken()` posait `window.location.hash = '#login'` — et personne ne
 * lisait ce hash. `App.svelte` n'écoute le `hashchange` que pour `#tv`
 * (`isTvHash`), et `ShellV2` ne lit aucun hash : la v2 navigue par
 * `pushState` / `popstate`. Résultat mesuré le 14/09/2026 : un jeton expiré
 * effaçait la session en silence, l'application devenait muette, et
 * `LoginView` — 352 lignes — restait inatteignable dans les deux interfaces.
 *
 * Faire lire `#login` à la v2 aurait marché, mais aurait planté un SECOND
 * mécanisme de navigation dans une coquille qui en a déjà un : deux sources de
 * vérité pour « quel écran est devant », et une URL qui se salit d'un `#login`
 * que rien n'efface. Un booléen partagé n'a pas de position dans l'historique,
 * pas d'URL, et se lit à l'identique des deux côtés.
 *
 * Le drapeau ne dit PAS « déconnecté » : il dit « la session vient d'expirer,
 * redemande-la ». Une déconnexion volontaire n'existe pas encore dans ce
 * client — et le jour où elle existera, elle n'aura rien à faire ici.
 */
export const sessionExpiree = writable(false);

/**
 * Levé par `clearToken()`, c'est-à-dire par les huit sites de `api.ts` (et
 * celui de `api/_client.ts`) qui traitent un 401. Il n'y a pas d'autre
 * appelant : chercher l'origine d'un calque de connexion, c'est chercher un
 * 401.
 */
export function signalerSessionExpiree(): void {
  sessionExpiree.set(true);
}

/**
 * Rabaissé par `setToken()`, et par lui seul.
 *
 * 🔴 PAS PAR L'ÉCRAN DE CONNEXION. Le retour du SSO (`/cloud/sso/authorize`)
 * repose le jeton sans repasser par le formulaire : si c'était le formulaire
 * qui rabaissait le drapeau, ce chemin-là laisserait le calque en place
 * par-dessus une session parfaitement valide.
 */
export function reprendreLaSession(): void {
  sessionExpiree.set(false);
}
