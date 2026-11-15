/**
 * web#2099 (FabienM, fil forum 2236, point 11, 1.0.0-rc4) — « j'ai créé une
 * playlist locale et en effaçant mon cache du navigateur, elle a disparu ».
 *
 * Les playlists locales sont en base, mais PAR PROFIL. Le profil actif du
 * navigateur vit dans `localStorage['tune-profile-id']` : cache vidé, le
 * client choisit un profil (le premier visible, ou celui que le serveur a
 * retenu — tune-server-rust#5916) SANS RIEN DIRE. Quand plusieurs profils
 * existent, l'utilisateur doit le savoir : on annonce « Profil : X ».
 *
 * Module à part, pour ne pas toucher au choix lui-même (`loadProfiles`), que
 * #5916 reprend côté serveur : on n'annonce que le RÉSULTAT.
 */
import { get } from 'svelte/store';
import { notifications } from './stores/notifications';
import { notifierTraduit } from './notificationTraduite';
import {
  currentProfileId,
  defaultPorteDesDonnees,
  profiles,
  profilMemoriseAuChargement,
  profilsVisibles,
  type Profile,
} from './stores/profile';

/**
 * Le profil à annoncer, ou `null` :
 *  - le navigateur avait retenu un profil qui existe encore → rien à dire ;
 *  - un seul profil visible → aucune ambiguïté, rien à dire ;
 *  - sinon (rien de retenu, ou un profil disparu) → le profil choisi à sa place.
 */
export function profilDeRepli(
  memorise: number | null,
  liste: readonly Profile[],
  actuel: number | null,
): Profile | null {
  if (actuel == null) return null;
  if (memorise != null && liste.some((p) => p.id === memorise)) return null;
  if (profilsVisibles([...liste], get(defaultPorteDesDonnees)).length < 2) return null;
  return liste.find((p) => p.id === actuel) ?? null;
}

export function nomDuProfil(p: Pick<Profile, 'name' | 'display_name'>): string {
  return (p.display_name ?? '').trim() || p.name;
}

let dejaAnnonce = false;

/** À appeler une fois les profils chargés. N'annonce qu'une fois par page. */
export function annoncerProfilDeRepli(): void {
  if (dejaAnnonce) return;
  const p = profilDeRepli(profilMemoriseAuChargement, get(profiles), get(currentProfileId));
  if (!p) return;
  dejaAnnonce = true;
  // Retraduite au changement de langue : au démarrage, la langue choisie
  // (préférence relue du serveur) n'est pas encore posée — voir `notificationTraduite`.
  const nom = nomDuProfil(p);
  notifierTraduit(
    (m) => notifications.info(m, 12000),
    (tr) => tr('profiles.fallbackNotice').replace('{name}', nom),
  );
}

/** Pour les tests. */
export function _reinitialiserAnnonce(): void {
  dejaAnnonce = false;
}
