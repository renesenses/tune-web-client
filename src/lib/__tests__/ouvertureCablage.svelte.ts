/**
 * Banc d'essai du câblage de `suiviOuverture` (#2267).
 *
 * Les runes ne se compilent que dans `.svelte` et `.svelte.ts` — ce fichier
 * existe pour ça, et rien d'autre ; le test qui s'en sert est un `.test.ts`
 * ordinaire, comme `effectScope.svelte.ts` avant lui.
 *
 * ⚠️ Il n'y a AUCUNE copie de l'implémentation ici : le banc appelle le vrai
 * `suiviOuverture` de `lib/ouvertureFlux.svelte`. Un banc qui réécrirait la
 * forme fautive à côté ne prouverait rien sur le code livré.
 */
import { flushSync } from 'svelte';
import { suiviOuverture, type SuiviOuverture } from '../ouvertureFlux.svelte';
import type { ZoneOuverture } from '../ouvertureFlux';

export interface BancOuverture {
  /** Ce que le composant afficherait en ce moment. */
  readonly visible: boolean;
  /**
   * Nombre de lectures de la zone depuis la dernière remise à zéro.
   *
   * C'est la sonde de la dépendance : tant que les minuteurs n'avancent pas,
   * chaque lecture est une exécution du corps de l'effet.
   */
  readonly lectures: number;
  remettreCompteur(): void;
  /** Remplace la zone et laisse Svelte traiter les effets. */
  poserZone(zone: ZoneOuverture | null): void;
  /** Démonte, comme le ferait la destruction du composant. */
  stop(): void;
}

export function bancOuverture(zoneInitiale: ZoneOuverture | null): BancOuverture {
  let zone = $state<ZoneOuverture | null>(zoneInitiale);
  const compteur = { n: 0 };
  let suivi: SuiviOuverture | undefined;

  const stop = $effect.root(() => {
    suivi = suiviOuverture(() => {
      compteur.n++;
      return zone;
    });
  });
  flushSync();

  return {
    get visible() {
      return suivi!.visible;
    },
    get lectures() {
      return compteur.n;
    },
    remettreCompteur() {
      compteur.n = 0;
    },
    poserZone(nouvelle) {
      zone = nouvelle;
      flushSync();
    },
    stop,
  };
}

/** Force le traitement des effets en attente depuis un test ordinaire. */
export function vider(): void {
  flushSync();
}
