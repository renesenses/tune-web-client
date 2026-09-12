/**
 * L'HISTORIQUE DU NAVIGATEUR POUR LA COQUILLE V2 — #828, #867.
 *
 * ## Ce qui manquait, mesuré avant d'écrire
 *
 * `src/main.ts` monte `ShellV2` **OU** `App.svelte`, jamais les deux. Or tout
 * ce qui touche à l'historique du navigateur vivait dans `App.svelte` :
 *
 *     $ grep -rn "pushState|replaceState|popstate" src/ | grep -v test
 *     src/App.svelte:691,693,729,735,756,758,816   ← l'ANCIENNE coquille
 *     src/components/LibraryView.svelte:1487-1488  ← un écran de l'ancienne
 *     src/lib/bridge.ts:65                         ← nettoyage d'un jeton d'URL
 *
 * Zéro occurrence dans les cinquante composants de `src/components/v2/`. La
 * coquille v2 n'écrivait donc **aucune** entrée : le bouton Précédent du
 * navigateur n'avait rien à dépiler et quittait Tune. C'est le motif « écrit
 * mais pas branché », ici sur le mécanisme le plus visible du client — un
 * bouton présent sur tous les écrans.
 *
 * ## Pourquoi un module, et pas une recopie dans `ShellV2`
 *
 * Recopier les deux cents lignes d'`App.svelte` aurait donné deux écrivains à
 * corriger deux fois. Ce module est le SEUL écrivain de la coquille v2, il
 * n'expose que des valeurs simples, et il se teste sans monter d'interface.
 *
 * `App.svelte` n'est volontairement PAS réécrit dessus : son bloc porte en
 * plus le rechargement des fiches album/artiste par `api.getAlbum` (stores
 * `selectedAlbum` / `selectedArtist`, que AUCUN composant `v2/` ne lit) et il
 * est gardé par quarante-trois cas de test. Le fusionner serait un second
 * chantier, à faire quand l'ancienne coquille sortira — pas au milieu d'un
 * correctif de terrain.
 *
 * ## 🔴 LE PIÈGE : `history.state` REFUSE LES PROXIES SVELTE
 *
 * `pushState` clone son argument par l'algorithme de clonage structuré. Un
 * `$state` de Svelte 5 est un `Proxy` : selon ce qu'il enveloppe, le clonage
 * lève `DataCloneError`… ou passe, et l'on range alors une coquille vide dont
 * on ne s'aperçoit qu'au retour, quand l'entrée ne rend plus rien.
 *
 * La parade n'est pas un `$state.snapshot` posé au bon endroit — il faudrait
 * se souvenir de le poser à chaque appel. C'est `etatCoquille()` ci-dessous :
 * l'état d'une entrée est CONSTRUIT champ par champ, et chaque champ passe par
 * `String()` ou `null`. Aucune référence d'objet ne traverse. Un proxy remis
 * par erreur ressort en chaîne de caractères, jamais en proxy.
 *
 * ## L'intention, et pourquoi elle est réutilisée telle quelle
 *
 * Fermer une fiche parce qu'on RECULE ne doit rien écrire ; la fermer
 * autrement doit réécrire l'entrée courante. Cette règle est déjà écrite,
 * tracée dans Chrome et testée : `lib/historiqueNavigation.ts`. On l'appelle,
 * on ne la réécrit pas.
 */
import { get, writable } from 'svelte/store';
import { activeView, type View } from './stores/navigation';
import {
  finDuRetourProgrammatique,
  opPourFiche,
  reculerAvecIntention,
} from './historiqueNavigation';

/**
 * Ce qu'une entrée d'historique de la coquille v2 transporte.
 *
 * Trois champs, tous primitifs. `tune` est le marqueur : l'entrée initiale du
 * navigateur (et celles posées par d'autres pages) a un `state` nul ou
 * étranger, et rétablir une vue depuis une entrée qui n'est pas la nôtre
 * poserait un écran que l'utilisateur n'a jamais ouvert.
 */
export interface EtatCoquille {
  tune: 'v2';
  vue: string;
  /** Le niveau ouvert DANS la vue (`artiste:12`), ou `null` à la racine. */
  detail: string | null;
}

/**
 * Construire l'état d'une entrée. **Le seul endroit** où un `EtatCoquille`
 * naît.
 *
 * Champ par champ, et jamais par recopie (`{ ...quelquechose }`) : une recopie
 * de surface d'un proxy Svelte rend un objet dont les valeurs sont encore des
 * proxies dès qu'elles ne sont pas primitives. Ici rien ne survit à `String()`.
 */
export function etatCoquille(vue: unknown, detail: unknown): EtatCoquille {
  return {
    tune: 'v2',
    vue: String(vue ?? ''),
    detail: detail == null ? null : String(detail),
  };
}

/** Vrai si l'entrée atteinte est l'une des nôtres. */
export function estEtatCoquille(etat: unknown): etat is EtatCoquille {
  return !!etat && typeof etat === 'object' && (etat as EtatCoquille).tune === 'v2';
}

/**
 * L'adresse affichée pour un état. `#library`, `#library/artiste:12`.
 *
 * Rien ne LIT ce fragment au démarrage — l'aiguillage se fait sur
 * `history.state`, comme dans l'ancienne coquille. Il est là pour que la barre
 * d'adresse dise où l'on est, et pour que « précédent / suivant » soient sans
 * ambiguïté dans le menu déroulant du navigateur.
 */
export function adressePour(etat: EtatCoquille): string {
  return etat.detail ? `#${etat.vue}/${etat.detail}` : `#${etat.vue}`;
}

/**
 * LE NIVEAU DE DÉTAIL OUVERT DANS LA VUE COURANTE.
 *
 * Les écrans v2 ouvrent leur fiche en basculant un `$state` local
 * (`let ouvert = $state<Artist | null>(null)` dans `ArtistesV2`). Ce `$state`
 * est un proxy, il est local au composant, et il est démonté avec lui : il ne
 * peut ni être rangé dans une entrée d'historique, ni être relu par la
 * coquille.
 *
 * Cet aiguillage est son pendant PARTAGEABLE : une CLÉ, une chaîne, posée par
 * l'écran qui ouvre et relue par l'écran qui doit se refermer. C'est un
 * identifiant, pas l'objet — rouvrir la fiche depuis la clé demanderait de
 * recharger l'artiste, ce que ce lot ne fait pas (voir la note de fin).
 */
export const detailOuvert = writable<string | null>(null);

/** Ouvrir un niveau de détail : l'entrée d'historique est empilée. */
export function ouvrirDetail(cle: string): void {
  detailOuvert.set(String(cle));
}

/**
 * Refermer le niveau de détail EN RECULANT.
 *
 * C'est le geste du bouton « Retour » d'un écran. Il ne se contente pas de
 * refermer : il dépile aussi l'entrée d'historique, sans quoi la pile du
 * navigateur aurait un cran de plus que le chemin réellement parcouru et le
 * Précédent suivant ne ferait « rien » une fois de trop.
 *
 * `reculerAvecIntention` lève le drapeau qui dit à l'abonnement ci-dessous de
 * NE PAS réécrire l'entrée qu'on est en train de quitter.
 */
export function fermerDetailEnReculant(
  mutations: () => void = () => {},
  options: Parameters<typeof reculerAvecIntention>[1] = {},
): void {
  reculerAvecIntention(() => {
    detailOuvert.set(null);
    mutations();
  }, options);
}

/** Refermer sans reculer (clic ailleurs, changement d'onglet). */
export function fermerDetail(): void {
  detailOuvert.set(null);
}

export interface OptionsBranchement {
  /** Injectable pour les tests ; `window` par défaut. */
  fenetre?: Pick<Window, 'addEventListener' | 'removeEventListener'> & { history: History };
}

/**
 * Brancher la coquille sur l'historique du navigateur.
 *
 * Rend la fonction de débranchement : une coquille remontée (bascule
 * d'interface) en laisserait sinon un second derrière elle, et chaque
 * changement de vue écrirait deux entrées.
 */
export function brancherHistoriqueCoquille(options: OptionsBranchement = {}): () => void {
  const fenetre = options.fenetre ?? (typeof window !== 'undefined' ? window : undefined);
  if (!fenetre) return () => {};
  const historique = fenetre.history;

  /**
   * Vrai pendant qu'on REPOSE l'état d'une entrée atteinte. Sans ce drapeau,
   * `activeView.set(...)` déclencherait l'abonnement ci-dessous, qui empilerait
   * une entrée neuve : chaque retour en avancerait d'un, et le Précédent ne
   * reculerait jamais.
   */
  let enRestauration = false;

  const ecrire = (pousser: boolean, vue: unknown, detail: unknown) => {
    const etat = etatCoquille(vue, detail);
    if (pousser) historique.pushState(etat, '', adressePour(etat));
    else historique.replaceState(etat, '', adressePour(etat));
  };

  // L'entrée COURANTE est ancrée, pas empilée : au chargement, la page a déjà
  // son entrée. En empiler une ici ferait qu'un premier Précédent ne bougerait
  // pas de l'écran — l'utilisateur croirait le bouton mort.
  ecrire(false, get(activeView), get(detailOuvert));

  // `subscribe` appelle TOUT DE SUITE avec la valeur courante : sans ces deux
  // drapeaux, le branchement lui-même empilerait deux entrées de plus.
  let premiereVue = true;
  let premierDetail = true;

  const arretVue = activeView.subscribe((vue) => {
    if (premiereVue) { premiereVue = false; return; }
    if (enRestauration) return;
    // Changer de vue quitte le niveau de détail de la vue qu'on laisse : la
    // nouvelle entrée est une racine. Le magasin est remis à `null` EN
    // SILENCE, sinon son abonnement réécrirait l'entrée qu'on vient d'empiler.
    enRestauration = true;
    detailOuvert.set(null);
    enRestauration = false;
    ecrire(true, vue, null);
  });

  const arretDetail = detailOuvert.subscribe((detail) => {
    if (premierDetail) { premierDetail = false; return; }
    if (enRestauration) return;
    // `opPourFiche` porte la règle d'intention, tracée dans Chrome sur .18 et
    // gardée par `retourHistoriqueFiche.test.ts` : ouverture → empiler ;
    // fermeture à la main → réécrire l'entrée courante ; fermeture PAR UN
    // RETOUR → ne rien écrire, le `popstate` qui suit repose l'état.
    const op = opPourFiche(detail !== null);
    if (op === 'push') ecrire(true, get(activeView), detail);
    else if (op === 'replace') ecrire(false, get(activeView), null);
  });

  const surRetour = (e: PopStateEvent) => {
    // Le retour annoncé par `reculerAvecIntention` est consommé : les
    // fermetures suivantes redeviennent des réécritures.
    finDuRetourProgrammatique();
    const etat = e.state;
    if (!estEtatCoquille(etat)) return;
    enRestauration = true;
    try {
      activeView.set(etat.vue as View);
      detailOuvert.set(etat.detail);
    } finally {
      enRestauration = false;
    }
  };
  fenetre.addEventListener('popstate', surRetour as EventListener);

  return () => {
    arretVue();
    arretDetail();
    fenetre.removeEventListener('popstate', surRetour as EventListener);
  };
}

/**
 * ⚠️ CE QUE CE MODULE NE FAIT PAS, ET QUI SE VERRAIT.
 *
 * Revenir sur une entrée qui portait un détail (`#library/artiste:12`) repose
 * la VUE et la clé, mais ne ROUVRE pas la fiche : il faudrait recharger
 * l'artiste par l'API, comme `rechercherFicheDepuisHistorique` le fait dans
 * l'ancienne coquille. Concrètement, « suivant » après un retour rend la
 * liste, pas la fiche. Le cas qui gêne les testeurs — le Précédent qui QUITTE
 * Tune — est couvert ; celui-ci reste ouvert et n'est pas maquillé.
 */
