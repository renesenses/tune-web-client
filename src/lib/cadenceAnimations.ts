/**
 * La cadence des animations de « Lecture en cours », RÉGLABLE — #1256.
 *
 * ## Pourquoi un réglage, et pas un correctif
 *
 * Levente Toth (fil 1848, 0.9.155, MacBook) mesure un navigateur nettement plus
 * chargé sur « Lecture en cours » que sur l'Accueil. Deux relevés successifs
 * ont cherché une économie qui ne se voie pas à l'écran, et ont trouvé le
 * contraire (`docs/mesures/1256-cout-des-boucles-de-dessin.md`, PR #1480 et
 * #1499) :
 *
 * - une minuterie par boucle (`setTimeout` hors de la chaîne `requestAnimation­Frame`)
 *   coûte PLUS cher : elle perd la coalescence, quatre minuteries indépendantes
 *   produisent jusqu'à quatre images composées là où rAF n'en produisait qu'une ;
 * - une horloge unique partagée par les quatre boucles ne rapporte RIEN :
 *   0,429 contre 0,423 CPU s/s, soit +1,4 % dans une dispersion de 11 à 17 %.
 *
 * Le seul levier mesuré qui rapporte est la cadence elle-même, et il est
 * linéaire, sans palier :
 *
 * | cadence | dessins/s | CPU net | gain |
 * |---|---|---|---|
 * | 30 i/s (celle d'aujourd'hui) | 120 | 0,423 | — |
 * | 20 i/s | 80 | 0,304 | −28 % |
 * | 15 i/s | 60 | 0,242 | −43 % |
 *
 * Ce n'est donc pas une décision technique : un crête-mètre à 15 i/s SE VOIT.
 * Bertrand tranche le 23/09/2026 en OFFRANT le choix, à trois crans, **sans
 * déplacer le défaut**.
 *
 * ## 🔴 Le défaut est la moitié de la décision
 *
 * `CRAN_CADENCE_DEFAUT` vaut `fluide`, et `fluide` rend EXACTEMENT la règle
 * d'aujourd'hui — 1000/30 ms, tolérance d'une milliseconde
 * (`cadenceCreteMetre.tempsDeDessiner`). Depuis le ticket 150 (`lib/boucleImages`)
 * c'est la règle UNIQUE des boucles de « Lecture en cours » : le crête-mètre ET
 * le visualiseur (l'ancien `FRAME_INTERVAL = 33` entier de `AudioVisualizer`
 * est parti avec lui). Personne ne doit voir son affichage changer sans l'avoir
 * demandé, pas même d'une image.
 *
 * Un test le mesure dans les deux sens (`__tests__/cadenceAnimations1256.test.ts`
 * et `__tests__/cadenceReglable1256.svelte.test.ts`), y compris pour une
 * installation EXISTANTE : le client écrit TOUS ses réglages dès la première
 * ouverture (`stores/preferences` : l'abonnement sérialise le blob entier), donc
 * « aucune valeur enregistrée » n'existe presque jamais. Le cas réel n'est pas
 * un `localStorage` vide, c'est un blob COMPLET à qui il manque la seule clé
 * neuve — et un blob relu du SERVEUR, qui peut porter n'importe quoi.
 *
 * ## 🔴 Affichage seulement
 *
 * Rien ici ne touche à l'audio. Ces boucles LISENT `audio_levels` et le
 * dessinent ; ralentir le dessin ne ralentit, n'échantillonne ni ne limite quoi
 * que ce soit du son. Le dire compte — un réglage nommé « cadence » posé au
 * milieu des Réglages d'un lecteur audiophile peut se lire comme un
 * rééchantillonnage.
 */

/**
 * Les trois crans, nommés pour un auditeur.
 *
 * `fluide` est le comportement livré depuis la 0.9.158, mot pour mot.
 */
export type CranCadence = 'fluide' | 'econome' | 'minimal';

/** Le comportement d'avant : 30 images par seconde, intact. */
export const CRAN_CADENCE_DEFAUT: CranCadence = 'fluide';

/**
 * Garde de relecture. Le blob de préférences est relu depuis `ui_preferences`,
 * donc depuis le SERVEUR : une valeur inconnue (version ultérieure, blob abîmé)
 * doit retomber sur le défaut plutôt que de laisser les animations sur une
 * cadence qui n'existe pas — c'est la leçon de tune-server-rust#4368.
 */
export function estCranCadence(v: unknown): v is CranCadence {
  return v === 'fluide' || v === 'econome' || v === 'minimal';
}

/** L'ordre d'affichage dans les Réglages : du plus fluide au plus économe. */
export const CRANS_CADENCE: readonly CranCadence[] = ['fluide', 'econome', 'minimal'];

/** Images par seconde de chaque cran. Mesurées, pas choisies au jugé. */
export const CADENCE_HZ: Record<CranCadence, number> = {
  fluide: 30,
  econome: 20,
  minimal: 15,
};

/**
 * Le cran d'une valeur quelconque : la garde et le repli, en un seul geste.
 * Les composants l'appellent sur `$preferences.cadenceAnimations`, qui peut
 * être `undefined` sur une installation existante.
 */
export function cranOuDefaut(v: unknown): CranCadence {
  return estCranCadence(v) ? v : CRAN_CADENCE_DEFAUT;
}

/**
 * Intervalle du CRÊTE-MÈTRE, en millisecondes.
 *
 * 🔴 Non arrondi : au cran `fluide` il vaut `1000 / 30 = 33,333…`, la valeur
 * exacte de l'`INTERVALLE_CRETE_MS` livré. Arrondir ici à 33 déplacerait le
 * défaut d'un tiers de milliseconde — invisible à l'œil, mais c'est justement
 * ce qu'on s'interdit de faire sans que personne l'ait demandé.
 */
export function intervalleCreteMs(cran: CranCadence): number {
  return 1000 / CADENCE_HZ[cran];
}

/**
 * Tolérance d'une milliseconde : à 60 Hz, deux images font 33,3 ms — sans elle,
 * l'arrondi des horodatages ferait sauter une image sur deux de trop. Reprise
 * telle quelle de `cadenceCreteMetre.tempsDeDessiner`, à qui elle appartenait.
 */
export function tempsDeDessinerA(maintenant: number, dernier: number, cran: CranCadence): boolean {
  return maintenant - dernier >= intervalleCreteMs(cran) - 1;
}

/**
 * Clés i18n du libellé de chaque cran. Le gain est DANS le libellé de l'option :
 * un cran qui ne dit pas ce qu'il rapporte ne se choisit pas.
 */
export const CLE_I18N_CRAN: Record<CranCadence, string> = {
  fluide: 'settings.animationRateSmooth',
  econome: 'settings.animationRateSaving',
  minimal: 'settings.animationRateMinimal',
};
