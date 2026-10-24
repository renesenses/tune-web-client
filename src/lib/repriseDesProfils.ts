/**
 * tune-server-rust#6454 — un `/profiles` en échec est RÉESSAYÉ.
 *
 * Le cas restant du fil 2304 (Jean Valjean, rc4 comme rc6) : à l'ouverture de
 * Tune, quand le serveur vient de démarrer, `GET /profiles` peut échouer
 * (réseau, délai, base occupée). `loadProfiles()` ne faisait qu'un
 * `console.error`, et `bootstrapV2()` ne passe qu'une fois : sans profil
 * retenu dans le navigateur, `currentProfileId` restait `null` pour de bon et
 * chaque widget de l'Accueil restait sur « Chargement… ». Seul un
 * rechargement de la page en sortait.
 *
 * Deux choses ici :
 *
 * 1. des essais espacés d'un délai croissant (1 s, 2 s, 4 s…) et plafonné
 *    (30 s) : la fenêtre de démarrage se compte en secondes, et un serveur
 *    réellement absent n'est pas martelé. On ne renonce pas : dès que le
 *    serveur répond, l'Accueil se débloque sans geste de l'utilisateur ;
 * 2. un état lisible, `etatDesProfils` : après quelques échecs il passe à
 *    `echec`, et l'Accueil le DIT au lieu d'un « Chargement… » sans fin, avec
 *    un bouton pour réessayer tout de suite (`reessayerLesProfils`).
 */
import { writable } from 'svelte/store';
import { loadProfiles } from './stores/profile';

export type EtatDesProfils = 'jamais' | 'chargement' | 'charges' | 'echec';

export const etatDesProfils = writable<EtatDesProfils>('jamais');

export const PREMIER_DELAI_MS = 1_000;
export const PLAFOND_DELAI_MS = 30_000;
/** Échecs consécutifs avant de montrer le message (≈ 3 s de démarrage). */
export const ECHECS_AVANT_MESSAGE = 3;

/** Délai avant l'essai suivant le n-ième échec (n ≥ 1) : double, plafonné. */
export function delaiApresEchec(
  n: number,
  premier: number = PREMIER_DELAI_MS,
  plafond: number = PLAFOND_DELAI_MS,
): number {
  return Math.min(premier * 2 ** Math.max(0, n - 1), plafond);
}

export interface OptionsReprise {
  charger?: () => Promise<boolean>;
  premierDelaiMs?: number;
  plafondDelaiMs?: number;
}

export interface Reprise {
  /** Résultat du PREMIER essai. */
  premier: Promise<boolean>;
  /** Se résout quand les profils sont enfin chargés. */
  fin: Promise<void>;
}

let enCours: Reprise | null = null;
/** Réveille l'attente en cours (bouton « Réessayer maintenant »). */
let reveiller: (() => void) | null = null;

/** Abrège l'attente courante : l'essai suivant part tout de suite. */
export function reessayerLesProfils(): void {
  reveiller?.();
}

/**
 * Charge les profils et réessaie jusqu'au succès. Un seul cycle à la fois :
 * un second appel pendant le cycle rend le cycle en cours.
 */
export function chargerLesProfilsAvecReprise(options: OptionsReprise = {}): Reprise {
  if (enCours) return enCours;
  const charger = options.charger ?? loadProfiles;
  const premierDelai = options.premierDelaiMs ?? PREMIER_DELAI_MS;
  const plafond = options.plafondDelaiMs ?? PLAFOND_DELAI_MS;
  let signalerPremier: (ok: boolean) => void = () => {};
  const premier = new Promise<boolean>((r) => (signalerPremier = r));

  const fin = (async () => {
    etatDesProfils.set('chargement');
    let echecs = 0;
    for (;;) {
      let ok = false;
      try { ok = await charger(); } catch { ok = false; }
      if (echecs === 0) signalerPremier(ok);
      if (ok) {
        etatDesProfils.set('charges');
        return;
      }
      echecs += 1;
      if (echecs >= ECHECS_AVANT_MESSAGE) etatDesProfils.set('echec');
      await new Promise<void>((r) => {
        const minuteur = setTimeout(r, delaiApresEchec(echecs, premierDelai, plafond));
        reveiller = () => { clearTimeout(minuteur); r(); };
      });
      reveiller = null;
    }
  })().finally(() => { enCours = null; });

  enCours = { premier, fin };
  return enCours;
}
