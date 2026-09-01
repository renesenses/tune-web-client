/**
 * Le CÂBLAGE de `suivreOuverture`, écrit une seule fois.
 *
 * `renesenses/tune-server-rust#2267`. La *décision* — quand montrer, et surtout
 * quand cesser de montrer — vit dans `ouvertureFlux.ts`, pure et testable sans
 * rendu. Ce que ce fichier ajoute est l'autre moitié, celle qui touche à
 * Svelte : tenir l'état entre deux appels, le relire sans se rendre dépendant
 * de soi-même, et battre la seconde tant qu'une ouverture court.
 *
 * ## Pourquoi ce câblage n'a PAS le droit d'être recopié
 *
 * Il tient deux pièges dont chacun a déjà coûté une régression, et la première
 * a été payée DEUX FOIS le même jour, dans deux composants qui portaient la
 * même dizaine de lignes copiées :
 *
 *  1. **Lire son propre état dans un `$effect` qui l'écrit** (#2555). L'effet
 *     inscrit `etat` dans ses dépendances, puis l'écrit : il s'invalide
 *     lui-même, se replanifie, et Svelte finit par lever
 *     `effect_update_depth_exceeded`. Cette erreur ARRÊTE son ordonnanceur de
 *     rendu — l'interface entière cesse de se rafraîchir alors que la musique
 *     continue et que les clics sont bien reçus. C'était « il faut faire F5
 *     pour quitter Lecture en cours », vu chez cinq testeurs sur trois
 *     systèmes. La parade est `untrack` autour de la lecture, ici, une fois.
 *
 *  2. **Faire dépendre le minuteur d'autre chose que du booléen « une ouverture
 *     court-elle ? »** — de la zone, typiquement. Pendant une ouverture, la
 *     WebSocket pousse des `zone.updated` et `App.svelte` remplace le store EN
 *     BLOC : la zone est un objet NEUF plusieurs fois par seconde. Un minuteur
 *     qui en dépend est détruit et réarmé avant d'avoir jamais battu, et le
 *     plafond ne tombe donc JAMAIS tant que le serveur parle — précisément le
 *     cas d'un drapeau bloqué sur une WebSocket vivante. D'où `untrack` aussi
 *     dans le rappel du minuteur : il lit la zone, il ne s'y abonne pas.
 *
 * Le premier appelant (`SeekBar.svelte`, v0.9.114) portait ce câblage à la
 * main. Le second (`MiniPlayer.svelte`, second volet de la demande de DEvir)
 * aurait dû le recopier, pièges compris. C'est exactement la manière dont
 * #2555 est né : une bonne dizaine de lignes recopiée d'un composant à
 * l'autre, corrigée dans l'un, oubliée dans l'autre. On l'extrait donc au
 * moment où il y a un deuxième appelant — pas avant, pas après.
 *
 * Les runes ne se compilent que dans `.svelte` et `.svelte.ts` : d'où
 * l'extension. Le fichier ne fait que du câblage, et aucune décision.
 */
import { untrack } from 'svelte';
import {
  ETAT_OUVERTURE_INITIAL,
  suivreOuverture,
  type EtatOuverture,
  type ZoneOuverture,
} from './ouvertureFlux';

/** Cadence du battement. Une seconde suffit : le plafond est à la minute. */
export const PAS_OUVERTURE_MS = 1_000;

export interface SuiviOuverture {
  /** Faut-il annoncer une ouverture en ce moment ? */
  readonly visible: boolean;
}

/**
 * Suit l'ouverture du flux de la zone rendue par `lireZone`.
 *
 * À appeler à l'initialisation d'un composant (il pose des `$effect`), en lui
 * passant un ACCESSEUR et non une valeur — sans quoi la zone serait figée à sa
 * valeur du premier rendu.
 *
 * ```svelte
 * let zone = $derived($currentZone);
 * const ouvertureFlux = suiviOuverture(() => zone);
 * let ouverture = $derived(ouvertureFlux.visible);
 * ```
 */
export function suiviOuverture(
  lireZone: () => ZoneOuverture | null | undefined,
): SuiviOuverture {
  let etat = $state<EtatOuverture>(ETAT_OUVERTURE_INITIAL);

  /** `untrack` est ici la CORRECTION de #2555, pas une optimisation : voir
   *  l'en-tête. L'état précédent est lu hors de tout suivi, donc l'effet
   *  appelant ne devient jamais sa propre dépendance. */
  function appliquer(zone: ZoneOuverture | null | undefined) {
    etat = suivreOuverture(
      untrack(() => etat),
      zone,
      Date.now(),
    );
  }

  // Premier déclencheur : la zone, pour réagir sans attendre le battement.
  // Seuls ces deux champs décident quoi que ce soit ; les nommer explicitement
  // évite de se réveiller sur une position qui avance.
  $effect(() => {
    const zone = lireZone();
    void zone?.resolving;
    void zone?.state;
    appliquer(zone);
  });

  // Second déclencheur, et il faut les deux : l'horloge. Le plafond doit tomber
  // même si plus AUCUNE mise à jour n'arrive — WebSocket coupée, serveur parti.
  // C'est précisément le cas où le drapeau serveur reste levé pour toujours.
  const enCours = $derived(etat.depuisMs !== null);

  $effect(() => {
    if (!enCours) return;
    const minuteur = setInterval(() => appliquer(untrack(lireZone)), PAS_OUVERTURE_MS);
    return () => clearInterval(minuteur);
  });

  return {
    get visible() {
      return etat.visible;
    },
  };
}
