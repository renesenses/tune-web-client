/**
 * La pastille d'un profil : une COULEUR, ou une PHOTO — chantier UI.
 *
 * Bertrand, 19/09/2026, capture à l'appui : « il manque l'avatar ». L'écran
 * Réglages ▸ Général ▸ Profils n'affichait qu'une initiale sur fond coloré,
 * alors que la bulle du coin haut-droit porte une vraie photo.
 *
 * # 🔴 Une seule case, deux formes — et rien à migrer
 *
 * La colonne en base s'appelle **`avatar_path TEXT`** : elle était prévue pour
 * une image. L'API l'a renommée `avatar_color` et y range une couleur
 * (`#6366f1` sur le .18), mais elle accepte toujours `avatar_path` en alias et
 * le type est resté du texte libre.
 *
 * On y range donc l'un OU l'autre, et [`estDataUrlImage`] — déjà écrite dans
 * `avatarLocal` pour la bulle — les distingue. Pas de colonne nouvelle, pas de
 * migration, pas de second réglage.
 *
 * # Ce qu'on ne réécrit pas
 *
 * `avatarLocal` sait déjà recadrer en carré, réduire à 192 px, encoder en data
 * URL sous 96 Ko avec une échelle de qualité dégressive, et NOMMER ses refus.
 * C'est éprouvé par la bulle depuis #893. On s'en sert tel quel — plafond
 * compris : Bertrand a tranché pour les mêmes 96 Ko que la bulle, afin qu'il
 * n'y ait qu'un seul réglage à connaître.
 *
 * ⚠️ Le coût, assumé : `GET /profiles` grossit d'autant par profil qui a une
 * photo. Ce n'est pas un chemin chaud — la liste se charge à l'ouverture de
 * l'écran et au changement de profil.
 */
import { estDataUrlImage } from './avatarLocal';

/** Ce qu'il faut DESSINER pour un profil. */
export type Pastille =
  | { sorte: 'photo'; url: string }
  | { sorte: 'couleur'; fond: string; initiale: string };

/**
 * La couleur de repli quand le profil n'en porte aucune.
 *
 * Un `background` vide rendait une pastille transparente sur laquelle
 * l'initiale flottait — c'est le cas du profil « Default » du .18, dont
 * `avatar_color` vaut `null`.
 */
export const FOND_PAR_DEFAUT = '#6366f1';

/** La première lettre, en capitale. Jamais `undefined.charAt`. */
export function initialeDe(nom: string | null | undefined): string {
  return ((nom ?? '').trim().charAt(0) || '?').toUpperCase();
}

/**
 * Quoi dessiner, d'après le champ du profil et son nom.
 *
 * 🔴 L'ordre compte : une data URL est une photo, TOUT le reste est une
 * couleur. Tester « est-ce que ça commence par `#` » laisserait passer une
 * valeur vide ou un nom de couleur CSS comme s'il s'agissait d'une image.
 */
export function pastilleDe(avatar: string | null | undefined, nom: string | null | undefined): Pastille {
  if (estDataUrlImage(avatar)) return { sorte: 'photo', url: avatar };
  const fond = (avatar ?? '').trim();
  return {
    sorte: 'couleur',
    fond: fond || FOND_PAR_DEFAUT,
    initiale: initialeDe(nom),
  };
}
