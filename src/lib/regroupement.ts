/**
 * REGROUPER des signaux qui arrivent en rafale — fil forum 2134.
 *
 * Pendant une réécriture massive de fichiers (par exemple la gravure des DR
 * depuis l'écran Métadonnées), le surveillant du serveur émet
 * `library.updated` à chaque lot : mesuré dans le diagnostic du fil, une fois
 * toutes les 0,96 s. Chaque événement invalidait la bibliothèque, et l'écran
 * monté rechargeait tout : la vue « clignotait » sans fin.
 *
 * `regrouper` ne laisse passer qu'UN appel pour une rafale :
 *
 *  - `calmeMs` après le DERNIER signal (la rafale est finie) ;
 *  - mais jamais plus tard que `intervalleMs` après le PREMIER signal en
 *    attente (une rafale qui ne finit pas rafraîchit quand même, de loin en
 *    loin) ;
 *  - et jamais moins de `intervalleMs` après l'appel précédent.
 *
 * Page masquée (onglet en arrière-plan) : l'appel attend que la page
 * redevienne visible, et part alors une seule fois.
 */

export interface OptionsRegroupement {
  /** Le silence qui clôt une rafale. */
  calmeMs: number;
  /** L'écart minimal entre deux appels, et l'attente maximale d'un signal. */
  intervalleMs: number;
}

export interface Regroupeur {
  /** Un signal de plus. */
  signaler(): void;
  /** Coupe tout : minuteur et écoute de la visibilité. Rien ne part plus. */
  arreter(): void;
}

function pageMasquee(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function regrouper(appel: () => void, options: OptionsRegroupement): Regroupeur {
  const { calmeMs, intervalleMs } = options;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let enAttente = false;
  let premierSignal = 0;
  let dernierSignal = 0;
  let dernierAppel = Number.NEGATIVE_INFINITY;
  let ecouteVisibilite = false;

  function planifier(): void {
    if (minuteur) clearTimeout(minuteur);
    const echeance = Math.max(
      Math.min(dernierSignal + calmeMs, premierSignal + intervalleMs),
      dernierAppel + intervalleMs,
    );
    minuteur = setTimeout(tirer, Math.max(0, echeance - Date.now()));
  }

  function surVisibilite(): void {
    if (pageMasquee() || !enAttente) return;
    document.removeEventListener('visibilitychange', surVisibilite);
    ecouteVisibilite = false;
    planifier();
  }

  function tirer(): void {
    minuteur = null;
    if (!enAttente) return;
    if (pageMasquee()) {
      if (!ecouteVisibilite) {
        document.addEventListener('visibilitychange', surVisibilite);
        ecouteVisibilite = true;
      }
      return;
    }
    enAttente = false;
    dernierAppel = Date.now();
    appel();
  }

  return {
    signaler() {
      const maintenant = Date.now();
      if (!enAttente) { enAttente = true; premierSignal = maintenant; }
      dernierSignal = maintenant;
      // Page masquée et déjà en écoute : le retour au premier plan planifiera.
      if (ecouteVisibilite) return;
      planifier();
    },
    arreter() {
      if (minuteur) clearTimeout(minuteur);
      minuteur = null;
      enAttente = false;
      if (ecouteVisibilite) {
        document.removeEventListener('visibilitychange', surVisibilite);
        ecouteVisibilite = false;
      }
    },
  };
}
