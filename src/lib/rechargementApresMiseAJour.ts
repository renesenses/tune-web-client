// Un onglet resté ouvert pendant une mise à jour du serveur demande des
// morceaux hachés qui n'existent plus (renesenses/tune-server-rust#4847).
// Vite signale l'échec de l'import dynamique par l'événement
// `vite:preloadError` : on recharge la page UNE fois, pour qu'elle reprenne
// l'`index.html` de la nouvelle version et ses nouveaux noms de morceaux.
//
// Le garde anti-boucle vit en sessionStorage avec un horodatage : si le
// rechargement ne suffit pas (morceau réellement absent), un second échec dans
// la fenêtre laisse l'erreur remonter au lieu de recharger sans fin. Sans
// stockage utilisable (navigation privée, accès refusé), on ne recharge PAS :
// mieux vaut une erreur visible qu'une boucle.

export const CLE_RECHARGEMENT_PRECHARGEMENT = 'tune-rechargement-preload-error';
export const FENETRE_ANTI_BOUCLE_MS = 60_000;

type StockageMinimal = Pick<Storage, 'getItem' | 'setItem'>;

/** Décide s'il faut recharger, et note l'horodatage si oui. */
export function doitRechargerApresEchecDePrechargement(
  stockage: StockageMinimal | null | undefined,
  maintenant: number,
): boolean {
  if (!stockage) return false;
  try {
    const precedent = Number(stockage.getItem(CLE_RECHARGEMENT_PRECHARGEMENT));
    if (Number.isFinite(precedent) && precedent > 0 && maintenant - precedent < FENETRE_ANTI_BOUCLE_MS) {
      return false;
    }
    stockage.setItem(CLE_RECHARGEMENT_PRECHARGEMENT, String(maintenant));
    return true;
  } catch {
    return false;
  }
}

function stockageDeSession(fenetre: Window): StockageMinimal | null {
  try {
    return fenetre.sessionStorage;
  } catch {
    return null;
  }
}

/** Branche le gestionnaire `vite:preloadError` sur la fenêtre. */
export function installerRechargementApresMiseAJour(fenetre: Window = window): void {
  fenetre.addEventListener('vite:preloadError', (evenement) => {
    if (doitRechargerApresEchecDePrechargement(stockageDeSession(fenetre), Date.now())) {
      evenement.preventDefault();
      fenetre.location.reload();
    }
  });
}
