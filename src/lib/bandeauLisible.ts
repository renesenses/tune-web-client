/**
 * Combien de temps le bandeau « le son de cette zone ne va nulle part » reste
 * à l'écran (renesenses/tune-server-rust#2588).
 *
 * ## Le défaut
 *
 * La visibilité du bandeau était dérivée **directement** du champ serveur
 * `output_reach`, sans aucune mémoire :
 *
 * ```svelte
 * let visible = $derived(reach === 'no_output' || reach === 'browser_unattended');
 * ```
 *
 * Or `output_reach` décrit l'instant présent, et rien d'autre : côté serveur
 * (`tune-server/src/routes/zones.rs:739-741`) il retombe à `"ok"` **dès que la
 * zone n'est plus en lecture**. Le bandeau s'effaçait donc à la seconde même
 * où l'utilisateur appuyait sur Pause ou Arrêt — c'est-à-dire exactement au
 * geste par lequel il réagit à l'absence de son.
 *
 * Pierre M (fil forum 1572, réponse 5885) a rapporté de mémoire « une erreur
 * type *zone inactive* » alors que sa capture montrait tout autre chose :
 * « comme il s'efface très vite et qu'il est long, difficile à retenir ». Ce
 * contresens a orienté l'instruction de #2571 pendant plusieurs échanges.
 *
 * Ce bandeau est le **seul** endroit où Tune explique pourquoi une zone
 * navigateur ne fait pas de son. Un message de diagnostic qu'on ne peut pas
 * lire ne diagnostique rien.
 *
 * ## La règle
 *
 * Une **durée minimale d'affichage**, et rien de plus :
 *
 * - il apparaît **sans délai** dès que le serveur le signale — aucune
 *   temporisation n'est ajoutée à l'apparition, y compris au premier état reçu
 *   après un rechargement de page ;
 * - une fois affiché, il **tient au moins {@link BANDEAU_DUREE_MIN_MS}** ;
 * - passé ce délai, il disparaît **immédiatement** quand le serveur repasse à
 *   `"ok"`. Un bandeau qui survit au retour du son serait un mensonge de plus.
 *
 * Rien n'est conservé d'une session à l'autre : après un F5, une instance
 * neuve n'affiche que ce que le serveur vient de dire.
 *
 * ## Changer de zone efface tout
 *
 * Le composant est monté une seule fois et reçoit une zone qui change quand
 * l'utilisateur bascule. Faire traîner l'avertissement de la zone qu'on vient
 * de quitter au-dessus de celle qu'on vient d'ouvrir serait faux : le maintien
 * est donc **abandonné sur-le-champ** dès que l'identité de la zone change.
 */

import { writable, type Readable } from 'svelte/store';

/** Les deux valeurs de `output_reach` qui méritent un bandeau. */
export type AvertissementBandeau = 'no_output' | 'browser_unattended';

/**
 * Durée minimale d'affichage du bandeau, en millisecondes.
 *
 * **Pourquoi 8 000 ms.**
 *
 * 1. *La longueur du message.* La plus longue des onze traductions de
 *    `zone.browserUnattendedBanner` est la hongroise : 139 caractères,
 *    25 mots. À 200 mots/minute — l'allure admise pour la lecture attentive
 *    d'un texte court à l'écran — cela fait 7,5 s. Huit secondes couvrent la
 *    plus longue des onze, avec la marge du coup d'œil qui précède la lecture.
 * 2. *Le dépôt a déjà ce budget.* `notifications.error(zone.error, 8000)`
 *    (`src/lib/stores/zones.ts:125`) donne exactement 8 000 ms à l'autre
 *    message de diagnostic long de l'application, quand une confirmation
 *    ordinaire en reçoit 5 000 (`src/lib/stores/notifications.ts:29`). On
 *    reprend le même chiffre plutôt que d'en inventer un second.
 * 3. *Le mensonge résiduel est borné, et petit devant ce qui le précède.* Le
 *    bandeau ne peut apparaître qu'après le délai de grâce de douze secondes
 *    du serveur (`BROWSER_UNATTENDED_GRACE`, `zones.rs:654`) : quand il
 *    s'affiche, le silence qu'il annonce dure déjà depuis au moins douze
 *    secondes. Huit secondes de traîne après le retour du son sont courtes à
 *    cette échelle — et plus courtes que le temps de revenir vers l'écran.
 */
export const BANDEAU_DUREE_MIN_MS = 8000;

/**
 * Le champ serveur mérite-t-il un bandeau, et lequel ?
 *
 * Un serveur antérieur à 0.9.70 n'envoie pas `output_reach` du tout. Pas de
 * champ, pas de bandeau : on ne devine rien à partir de `online`.
 */
export function avertissementDe(reach: string | null | undefined): AvertissementBandeau | null {
  return reach === 'no_output' || reach === 'browser_unattended' ? reach : null;
}

export interface BandeauLisible {
  /** L'avertissement à afficher, ou `null` pour ne rien afficher. */
  readonly affiche: Readable<AvertissementBandeau | null>;
  /** Ce que le serveur vient de dire de cette zone. Idempotent. */
  signaler(zoneId: number | null, reach: string | null | undefined): void;
  /** Annule une extinction en attente (démontage du composant). */
  detruire(): void;
}

/**
 * Fabrique l'état affiché du bandeau à partir du flux de `output_reach`.
 *
 * `dureeMinMs` n'est paramétrable que pour les tests ; l'application emploie
 * toujours {@link BANDEAU_DUREE_MIN_MS}.
 */
export function creerBandeauLisible(dureeMinMs: number = BANDEAU_DUREE_MIN_MS): BandeauLisible {
  const etat = writable<AvertissementBandeau | null>(null);

  let courant: AvertissementBandeau | null = null;
  let zoneCourante: number | null = null;
  let afficheDepuis = 0;
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  function annulerMinuterie(): void {
    if (minuterie !== null) {
      clearTimeout(minuterie);
      minuterie = null;
    }
  }

  function poser(valeur: AvertissementBandeau | null): void {
    courant = valeur;
    etat.set(valeur);
  }

  function signaler(zoneId: number | null, reach: string | null | undefined): void {
    // Changement de zone : ce qu'on maintenait parlait d'une autre zone. On
    // n'en garde rien, pas même le reste de sa durée minimale.
    if (zoneId !== zoneCourante) {
      zoneCourante = zoneId;
      annulerMinuterie();
      poser(null);
    }

    const avertissement = avertissementDe(reach);

    if (avertissement !== null) {
      // Une extinction programmée est annulée : le bandeau n'a pas quitté
      // l'écran, son horloge ne repart donc pas non plus.
      annulerMinuterie();
      if (courant !== avertissement) {
        // Nouveau motif — y compris un motif qui en remplace un autre : le
        // texte change, l'utilisateur a droit au même temps pour le lire.
        afficheDepuis = Date.now();
        poser(avertissement);
      }
      return;
    }

    if (courant === null) return; // rien à l'écran, rien à éteindre
    if (minuterie !== null) return; // extinction déjà programmée

    const reste = afficheDepuis + dureeMinMs - Date.now();
    if (reste <= 0) {
      // Lu depuis longtemps : le son est revenu, le bandeau part tout de suite.
      poser(null);
      return;
    }
    minuterie = setTimeout(() => {
      minuterie = null;
      poser(null);
    }, reste);
  }

  return {
    affiche: { subscribe: etat.subscribe },
    signaler,
    detruire: annulerMinuterie,
  };
}
