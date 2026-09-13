/**
 * Changer de profil sur cet appareil.
 *
 * # Pourquoi un module, et pas un appel à `selectProfile`
 *
 * `selectProfile(id)` se contente de poser `currentProfileId`, qui persiste
 * dans `localStorage['tune-profile-id']`. C'est suffisant pour que les
 * REQUÊTES SUIVANTES portent le bon `X-Profile-Id` — mais rien de ce qui est
 * déjà chargé ne bouge. Après une bascule, l'écran continuerait donc d'afficher
 * les favoris, les préférences et le thème de la personne précédente.
 *
 * # Pourquoi un rechargement, et pas une invalidation ciblée
 *
 * Six modules portent de l'état lié au profil — `stores/profile`,
 * `favorisLocaux`, `streamingFavorites`, `accueilWidgets`, `v2Bootstrap` et le
 * magasin de préférences. Les vider un par un demanderait de n'en oublier
 * aucun, aujourd'hui et à chaque module ajouté ensuite ; c'est exactement le
 * genre d'inventaire qui se désynchronise en silence.
 *
 * Un rechargement est franc : l'utilisateur vient de demander à changer de
 * personne. Même raisonnement — et même geste — que `choisirInterface`, qui
 * recharge parce que le choix se joue au montage.
 *
 * # 🔴 Le blob de préférences doit être EFFACÉ avant
 *
 * `syncPreferencesFromServer` fait gagner le LOCAL sur le serveur dès qu'un
 * blob local existe :
 *
 *     preferences.update((local) => ({ ...defaults, ...server, ...local }))
 *
 * C'est le bon arbitrage au démarrage — ce que l'appareil a de plus frais prime
 * — mais après une bascule, le blob local est celui de QUELQU'UN D'AUTRE. Sans
 * cet effacement, le nouveau profil hériterait du thème, des colonnes et de la
 * photo du précédent, et la moitié serveur du chantier (tune-server-rust#3991)
 * n'aurait aucun effet visible.
 *
 * Mesuré dans Chrome le 12/09/2026 : sans l'effacement, le père ne retrouvait
 * pas son thème après le passage du fils.
 */

/** Clé du blob de préférences, la même que `stores/preferences`. */
const CLE_PREFERENCES = 'tune-preferences';

/** Clé du profil retenu sur cet appareil, la même que `stores/profile`. */
const CLE_PROFIL = 'tune-profile-id';

/**
 * Ce qu'une bascule doit effacer du stockage local, et rien d'autre.
 *
 * Isolé pour être vérifiable sans navigateur. On n'efface PAS le choix
 * d'interface (`tune-interface`) : il appartient à l'appareil, pas à la
 * personne — la tablette du salon reste sur l'interface qu'on lui a donnée,
 * quel que soit celui qui l'utilise.
 */
export const A_EFFACER: readonly string[] = [CLE_PREFERENCES];

/**
 * Faut-il basculer ?
 *
 * Rebasculer sur le profil déjà actif ne doit RIEN faire : c'est un clic sans
 * intention, et il coûterait un rechargement complet plus la perte de la file
 * d'attente affichée.
 */
export function basculeNecessaire(actuel: number | null, demande: number): boolean {
  return Number.isFinite(demande) && demande > 0 && actuel !== demande;
}

/**
 * Pose le profil demandé et recharge, ou ne fait rien si c'est déjà le sien.
 *
 * Rend `true` si la bascule a été engagée — utile pour fermer le panneau
 * seulement quand quelque chose se passe.
 */
export function basculerVers(
  actuel: number | null,
  demande: number,
  fenetre: { location: { reload: () => void } } = window,
): boolean {
  if (!basculeNecessaire(actuel, demande)) return false;

  try {
    localStorage.setItem(CLE_PROFIL, String(demande));
    for (const cle of A_EFFACER) localStorage.removeItem(cle);
  } catch {
    // Stockage refusé (navigation privée cloisonnée) : on recharge quand même.
    // Le profil ne sera pas retenu, mais l'écran ne restera pas menteur.
  }

  fenetre.location.reload();
  return true;
}
