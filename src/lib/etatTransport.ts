import type { RepeatMode } from './types';

/**
 * Règle d'affichage COMMUNE aux bascules de la barre de lecture —
 * `renesenses/tune-server-rust#2733`.
 *
 * Marco Polo (forum, fil 1601, 28/08/2026) :
 *
 *   « Actuellement, seul le mot "Aléatoire" s'affiche peu importe si ON ou
 *     OFF. J'éprouve de la difficulté à déterminer la valeur du réglage
 *     seulement par la couleur du pictogramme… »
 *
 * L'état existait déjà côté client (`class:active={$shuffleEnabled}`) : il ne
 * manquait que le TEXTE. Interrogé, il a précisé deux choses :
 *
 *   1. « combiner le nom de la fonction et son état serait encore mieux » —
 *      le libellé porte donc les DEUX, jamais l'état à la place du nom ;
 *   2. « le bouton Répéter gagnerait aussi à être bonifié de la même façon ».
 *
 * D'où ce module plutôt que quatre retouches de gabarit : le libellé se
 * calcule ICI, et les quatre points d'entrée (barre de lecture et panneau
 * « Lecture en cours », un bouton Aléatoire et un bouton Répéter chacun)
 * l'appellent. Ajouter une bascule à la barre, c'est ajouter sa règle ici —
 * c'est ce qui évite de refaire l'oubli sur la commande suivante.
 *
 * Le libellé n'est PAS assemblé par concaténation (« nom » + « : » + « état ») :
 * la ponctuation, l'ordre des mots et le genre varient d'une langue à l'autre.
 * Chaque état porte sa clé complète, traduite dans les onze langues.
 */

/** Le `t` de `$t`, réduit à ce dont ce module a besoin. */
export type Traduire = (cle: string) => string;

/** Clé du libellé du bouton Aléatoire — deux états. */
export function cleAleatoire(actif: boolean): string {
  return actif ? 'transport.shuffleOn' : 'transport.shuffleOff';
}

/**
 * Clé du libellé du bouton Répéter — TROIS états.
 *
 * `class:active={$repeatMode !== 'off'}` n'en distingue que deux : même en
 * voyant la couleur, on ne peut pas savoir si l'on répète la piste ou la file.
 * Le glyphe change bien entre `one` et `all`, mais aucun texte ne le disait.
 */
export function cleRepetition(mode: RepeatMode): string {
  if (mode === 'one') return 'transport.repeatOne';
  if (mode === 'all') return 'transport.repeatAll';
  return 'transport.repeatOff';
}

/** Libellé du bouton Aléatoire : nom de la fonction ET son état. */
export function libelleAleatoire(t: Traduire, actif: boolean): string {
  return t(cleAleatoire(actif));
}

/** Libellé du bouton Répéter : nom de la fonction ET lequel de ses trois états. */
export function libelleRepetition(t: Traduire, mode: RepeatMode): string {
  return t(cleRepetition(mode));
}

/*
 * Côté ARIA, les deux boutons ne relèvent PAS du même motif.
 *
 * Aléatoire est une bascule à deux états : `aria-pressed={actif}`, le cas
 * canonique du « toggle button ». Les gabarits l'écrivent directement, il n'y
 * a rien à calculer.
 *
 * Répéter n'en porte pas, et c'est délibéré. `aria-pressed` n'a que trois
 * valeurs — `true`, `false`, `mixed` — et `mixed` désigne un état PARTIEL (une
 * case qui commande des sous-cases inégales), pas un troisième mode de plein
 * droit : l'annoncer sur « répéter la piste » ferait dire au lecteur d'écran
 * « partiellement enfoncé », ce qui est faux. Et `aria-pressed="true"` pour
 * `one` comme pour `all` ramènerait exactement l'ambiguïté que ce correctif
 * supprime. Le bouton n'est d'ailleurs pas une bascule : `cycleRepeat()` fait
 * TOURNER trois valeurs.
 *
 * L'état y passe donc par le nom accessible — `aria-label`, qui porte le même
 * « nom + état » que l'infobulle, et que le lecteur d'écran relit après chaque
 * clic puisque le libellé du bouton focalisé change.
 *
 * Un `role="radiogroup"` de trois boutons rendrait la sémantique exacte, mais
 * il change la commande elle-même (trois cibles au lieu d'une, donc une autre
 * barre de lecture) : hors du périmètre de #2733, qui ne demande que le texte.
 */
