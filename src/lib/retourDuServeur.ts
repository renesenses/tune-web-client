/**
 * Recharger la page UNE FOIS que le serveur répond — jamais sur un minuteur.
 *
 * ## 🔴 `renesenses/tune-web-client#900`
 *
 * Lulu, fil forum du 04/09/2026 :
 *
 *   « À chaque mise à jour, le fichier reste bloqué sur la page "Tune
 *     Redémarre", et nécessite alors la fermeture de toutes les pages, et une
 *     réouverture de Tune. »
 *
 * Le dépôt portait DEUX chemins pour le même besoin — attendre qu'un serveur
 * qui redémarre revienne — et un seul était durci :
 *
 *  · `restartServerAndReload()` (le bouton « Redémarrer le serveur ») sonde
 *    `/system/health` jusqu'à ce que le serveur réponde, puis recharge. Il a
 *    été écrit comme ça pour #1209 (Mika, Windows) : le rechargement à
 *    six secondes fixes tombait sur un serveur pas encore prêt, d'où
 *    « Network error: server unreachable ».
 *
 *  · `installUpdate()`, lui, pose `updateDone = true` — c'est l'écran
 *    « Mise à jour installée, le serveur redémarre » — puis recharge au bout
 *    de 1 500 ms, **sans rien vérifier**. Si le serveur n'est pas debout à cet
 *    instant, le navigateur atterrit sur rien. C'est la leçon de #1209, jamais
 *    reportée sur le chemin d'à côté.
 *
 * Et le même `installUpdate()` pouvait se terminer EN SILENCE : budget épuisé,
 * dernière vérification sans réponse, `updateInstalling = false` — aucun
 * message, aucun rechargement, l'écran retombe sur le bouton sans un mot.
 *
 * ## Ce que ce module NE prétend pas
 *
 * Que ce soit exactement le cas de Lulu. Son signalement n'a ni journal ni
 * capture, et rien n'a été reproduit. Ce qui est établi, c'est qu'un des deux
 * chemins recharge à l'aveugle là où l'autre vérifie, et qu'il existe une
 * sortie muette. Les deux sont vrais en lisant le code, et les deux produisent
 * ce qu'il décrit.
 */

export interface AttenteRetour {
  /** Sonde le serveur. Résout s'il répond, rejette sinon. */
  sonder: () => Promise<unknown>;
  /** Ce qu'on fait quand il est revenu. */
  recharger: () => void;
  /** Prévenir l'utilisateur quand on renonce. Jamais de sortie muette. */
  renoncer: (raison: 'budget') => void;
  /** Horloge injectable, pour que le test ne dorme pas. */
  maintenant?: () => number;
  /** Minuterie injectable, même raison. */
  planifier?: (fn: () => void, ms: number) => void;
  /** Délai entre deux sondes. */
  pas?: number;
  /** Au-delà, on renonce — en le DISANT. */
  budget?: number;
}

/** Intervalle entre deux sondes, repris de `restartServerAndReload`. */
export const PAS_DE_SONDE_MS = 700;

/**
 * Butoir. `restartServerAndReload` rechargeait au bout de 45 s quoi qu'il
 * arrive ; ici on ne recharge PAS dans le vide — on le dit, ce qui laisse à
 * l'utilisateur une page qui fonctionne encore plutôt qu'un écran mort.
 */
export const BUDGET_RETOUR_MS = 90_000;

export function attendreRetourEtRecharger(opts: AttenteRetour): void {
  const maintenant = opts.maintenant ?? (() => Date.now());
  const planifier = opts.planifier ?? ((fn, ms) => void setTimeout(fn, ms));
  const pas = opts.pas ?? PAS_DE_SONDE_MS;
  const budget = opts.budget ?? BUDGET_RETOUR_MS;
  const depart = maintenant();

  const essai = async () => {
    try {
      await opts.sonder();
      opts.recharger();
      return;
    } catch {
      // Le serveur est encore à terre : c'est attendu, on repasse.
    }
    if (maintenant() - depart >= budget) {
      opts.renoncer('budget');
      return;
    }
    planifier(() => void essai(), pas);
  };
  planifier(() => void essai(), pas);
}
