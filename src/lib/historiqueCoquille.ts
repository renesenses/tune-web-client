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
import { activeView, vueDeRetour, type View } from './stores/navigation';
import {
  finDuRetourProgrammatique,
  opPourFiche,
  reculerAvecIntention,
} from './historiqueNavigation';
import { nomDeRoute, vueAuChargement } from './routeAuChargement';

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
  /** Le niveau ouvert DANS la vue (`album:12`), ou `null` à la racine. */
  detail: string | null;
  /**
   * web#1790 — l'ONGLET de la vue (`playlists` dans les Favoris). Absent quand
   * la vue n'en déclare pas : les entrées des autres écrans gardent leur forme.
   */
  onglet?: string;
}

/**
 * Construire l'état d'une entrée. **Le seul endroit** où un `EtatCoquille`
 * naît.
 *
 * Champ par champ, et jamais par recopie (`{ ...quelquechose }`) : une recopie
 * de surface d'un proxy Svelte rend un objet dont les valeurs sont encore des
 * proxies dès qu'elles ne sont pas primitives. Ici rien ne survit à `String()`.
 */
export function etatCoquille(vue: unknown, detail: unknown, onglet: unknown = null): EtatCoquille {
  const etat: EtatCoquille = {
    tune: 'v2',
    vue: String(vue ?? ''),
    detail: detail == null ? null : String(detail),
  };
  if (onglet != null) etat.onglet = String(onglet);
  return etat;
}

/** Vrai si l'entrée atteinte est l'une des nôtres. */
export function estEtatCoquille(etat: unknown): etat is EtatCoquille {
  return !!etat && typeof etat === 'object' && (etat as EtatCoquille).tune === 'v2';
}

/**
 * L'adresse affichée pour un état. `#library`, `#library/album:12`.
 *
 * Il est là pour que la barre d'adresse dise où l'on est, et pour que
 * « précédent / suivant » soient sans ambiguïté dans le menu déroulant du
 * navigateur. En COURS DE SESSION l'aiguillage se fait sur `history.state`,
 * comme dans l'ancienne coquille, et pas sur ce fragment.
 *
 * ⚠️ « Rien ne LIT ce fragment au démarrage » — c'est ce que disait cette note,
 * et c'était le défaut : recharger `#library` retombait sur l'Accueil. Le
 * branchement lit désormais le fragment du CHARGEMENT, une fois, par
 * `routeAuChargement`. Rien de plus : pendant la session, `history.state` reste
 * seul maître.
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

/**
 * L'ONGLET DE LA VUE COURANTE, porté par l'entrée d'historique — web#1790.
 *
 * FabienM, fil 2037, point 9 : « dans le menu Favoris, on ouvre une playlist
 * favorite, on ne revient pas sur l'onglet playlists favoris. Pour les
 * artistes favoris, on ouvre et le BACK ne renvoie pas à l'onglet Artistes
 * favoris ». L'entrée `#favorites` était bien là ; c'est l'onglet qu'elle ne
 * portait pas, et l'écran remonté repartait sur son onglet par défaut.
 *
 * Changer d'onglet RÉÉCRIT l'entrée courante (jamais d'empilement : un onglet
 * n'est pas un niveau de plus). Changer de vue le remet à `null`. Revenir sur
 * une entrée le repose AVANT la vue, pour que l'écran remonté le lise dès son
 * montage.
 */
export const ongletCourant = writable<string | null>(null);

/**
 * L'ONGLET À REPOSER AU RETOUR D'UNE PAGE — web#1790.
 *
 * Le bouton Retour de la page artiste ne recule pas : il CHANGE de vue vers
 * `vueDeRetour` (#3824), ce qui empile une entrée neuve, sans onglet — les
 * Favoris rouvraient donc sur « Albums ». L'émetteur pose `vueDeRetour`
 * pendant qu'il est encore à l'écran : c'est à cet instant que l'onglet de la
 * vue de départ est retenu, et `revenirA` le repose sur l'entrée d'arrivée.
 */
let ongletRetenu: { vue: string; onglet: string } | null = null;

function retenirOngletPour(vue: string | null): void {
  if (vue == null) return;
  if (get(activeView) === vue) {
    const o = get(ongletCourant);
    ongletRetenu = o != null ? { vue, onglet: o } : null;
  } else if (ongletRetenu?.vue !== vue) {
    // Posé depuis un autre écran (fiche album de #1602, en chaîne) : on ne
    // garde que ce qui visait déjà cette vue.
    ongletRetenu = null;
  }
}

/** Le Retour d'une page : aller à `vue` et y reposer l'onglet retenu. */
export function revenirA(vue: View): void {
  const r = ongletRetenu;
  ongletRetenu = null;
  activeView.set(vue);
  // Après le changement de vue, qui remet l'onglet à `null` : l'entrée neuve
  // est réécrite avec lui, et l'écran le lit à son montage.
  if (r && r.vue === vue) ongletCourant.set(r.onglet);
}

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

/* ------------------------------------------------------------------ */
/* ALLER D'UN COUP au DÉTAIL d'une AUTRE vue — #1142                   */
/* ------------------------------------------------------------------ */

/**
 * 🔴 LE GESTE QUI TRAVERSE UN ÉCRAN QUE PERSONNE NE VOIT.
 *
 * FabienM, fil 1774, point 1 : « le bouton "BACK" du navigateur retourne à la
 * page d'accueil et non à la page de résultats » — et, au fil 1778 : « ça
 * revient à l'avant-dernière page consultée ».
 *
 * MESURÉ (`historiqueRechercheArtiste1142.test.ts`, avant correctif) sur le
 * parcours « résultats de recherche → clic sur un artiste » :
 *
 *     clic     : push #search → push #library        (la GRILLE, jamais vue)
 *     montage  : push #library/artiste:42            (la fiche demandée)
 *     Précédent: #library                            ← la Bibliothèque, pas les résultats
 *
 * UN geste, DEUX entrées : l'écran d'arrivée n'est pas la vue, c'est un détail
 * DANS la vue, et la coquille écrit l'un puis l'autre. La grille de la
 * Bibliothèque n'a jamais été à l'écran, et elle occupe pourtant un cran de la
 * pile — le premier Précédent l'y ramène, et il faut en appuyer un second pour
 * retrouver les résultats. C'est le symptôme, vu de l'autre côté : ce n'est pas
 * une entrée qui manque, c'en est une de trop.
 *
 * Cette fonction écrit l'entrée COMPOSÉE, une seule, qui porte déjà le détail.
 *
 * ⚠️ Et elle tient l'intention jusqu'à ce que l'écran d'arrivée reprenne la
 * main. Un écran v2 est démonté et remonté à chaque changement de vue
 * (`ShellV2` : `{#if $activeView === …}`), et plusieurs remettent `detailOuvert`
 * à `null` au montage — par exemple `ArtistesV2`, sur `listResetNonce`. Sans le
 * drapeau, cette remise à zéro RÉÉCRIRAIT l'entrée composée en `#library`, et
 * l'ouverture qui suit empilerait la seconde entrée qu'on vient d'éviter : le
 * correctif serait annulé par le remontage.
 *
 * Le filet — la même parade que `reculerAvecIntention`, à laquelle ce drapeau
 * est emprunté : si l'écran d'arrivée n'ouvre jamais rien (artiste introuvable,
 * appel en échec), l'intention resterait levée et ferait taire la fermeture
 * suivante, légitime celle-là.
 */
/** Ce que le PROCHAIN changement de vue doit écrire dans son entrée. */
let cleVisee: string | null = null;
/** Ce que l'écran d'arrivée va reposer, et qu'il ne faut donc pas réécrire. */
let cleEnAttente: string | null = null;

/** Le délai du filet, aligné sur celui de `reculerAvecIntention`. */
const DELAI_FILET_VISE = 1000;

function leverIntention(cle: string, programmerFilet: (cb: () => void, ms: number) => void): void {
  cleVisee = cle;
  cleEnAttente = null;
  programmerFilet(() => { cleVisee = null; cleEnAttente = null; }, DELAI_FILET_VISE);
}

/**
 * Aller à un détail d'une autre vue en UNE entrée d'historique.
 *
 * `cle` est la clé que l'écran d'arrivée posera lui-même dans `detailOuvert`
 * (`album:42`) : elle doit être la MÊME, sans quoi l'écran empilerait sa
 * propre entrée par-dessus. C'est pourquoi elle se construit par une fonction
 * partagée (`cleDetailAlbum`) et jamais à la main.
 *
 * ⚠️ #1501 — plus AUCUN écran n'y passe aujourd'hui : l'entrée composée
 * `#library/artiste:42` (#1142) a disparu avec la fiche d'artiste de la
 * Bibliothèque, la page commune étant une VUE et non un détail dans une vue.
 * Le mécanisme reste, éprouvé par ses témoins, pour le prochain détail qu'un
 * écran voudra viser d'un coup depuis un autre.
 */
export function allerAuDetail(
  vue: View,
  cle: string,
  options: { programmerFilet?: (cb: () => void, ms: number) => void } = {},
): void {
  viserDetail(cle, options);
  // Le changement de vue fait le reste : l'abonnement du branchement lit
  // l'intention et écrit l'entrée composée.
  activeView.set(vue);
}

/**
 * La moitié « intention » d'`allerAuDetail`, pour l'émetteur qui change de vue
 * LUI-MÊME, juste après — web#1619.
 *
 * « Localiser sur le disque » (fiche album, Convertisseur) pose le dossier
 * dans `repertoireCible` PUIS fait `activeView.set('browse')` ; deux gardes de
 * texte (#854, `localiserSurLeDisque`) tiennent cet ordre. Le dossier d'arrivée
 * doit être la clé de l'entrée `#browse` elle-même, sans cran de plus : sans
 * cela, remonter depuis un sous-dossier retomberait sur la liste des
 * emplacements, et un Précédent de plus serait nécessaire pour revenir à
 * l'album. C'est exactement l'entrée COMPOSÉE de #1142.
 *
 * ⚠️ Le changement de vue doit suivre dans le même tour : l'intention est
 * consommée par le PROCHAIN changement de vue, quel qu'il soit. Le filet la
 * baisse si aucun ne vient.
 */
export function viserDetail(
  cle: string,
  options: { programmerFilet?: (cb: () => void, ms: number) => void } = {},
): void {
  const programmerFilet = options.programmerFilet ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  leverIntention(String(cle), programmerFilet);
}

/**
 * Vrai si l'entrée d'historique COURANTE est l'une des nôtres et porte `cle`.
 *
 * C'est la garde d'un bouton « Retour » d'écran qui veut reculer au lieu
 * d'empiler (web#1619) : `history.back()` n'est sûr que si l'entrée qu'on
 * quitte est bien celle que l'écran a écrite. Sinon — coquille non branchée,
 * entrée étrangère — reculer pourrait faire sortir de Tune.
 */
export function entreeCourantePorte(cle: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const etat = window.history.state;
  return estEtatCoquille(etat) && etat.detail === cle;
}

/**
 * Ce que l'abonnement au DÉTAIL doit faire pendant une transition composée.
 *
 * - `null` reçu → le remontage de l'écran d'arrivée ; on n'écrit rien et on
 *   GARDE l'intention : l'ouverture qu'on attend n'a pas encore eu lieu.
 * - la clé visée → l'écran a repris la main ; l'entrée la porte déjà, rien à
 *   écrire, et l'intention est consommée.
 * - autre chose → on n'attend plus rien de cette transition : elle est
 *   consommée et l'écriture suit son cours normal.
 */
function transitionAbsorbe(detail: string | null): boolean {
  if (cleEnAttente === null) return false;
  // `null` : le remontage de l'écran d'arrivée, qui vide le magasin avant de le
  // regarnir. La clé visée : l'écho du `set` de la transition elle-même, PUIS
  // l'ouverture par l'écran — indiscernables, et tous deux sans écriture à
  // faire, puisque l'entrée porte déjà la clé. Dans les deux cas on se tait, et
  // on GARDE l'intention : c'est le filet qui la baisse.
  if (detail === null || detail === cleEnAttente) return true;
  // Autre chose : on n'attend plus rien de cette transition.
  cleEnAttente = null;
  return false;
}

/**
 * Lire et CONSOMMER l'intention au moment d'écrire l'entrée de la vue.
 *
 * Consommée ici, et pas plus tard : un second changement de vue qui suivrait
 * de près ne doit surtout pas repeindre la même clé sur une autre entrée
 * (`#radios/artiste:42`). Ce qui SURVIT à cette consommation, c'est la seule
 * attente de l'écran d'arrivée (`cleEnAttente`), et elle ne fait que TAIRE des
 * écritures, jamais en produire.
 */
function consommerVuePourEntree(): string | null {
  const vise = cleVisee;
  cleVisee = null;
  if (vise !== null) cleEnAttente = vise;
  return vise;
}

export interface OptionsBranchement {
  /**
   * Injectable pour les tests ; `window` par défaut.
   *
   * `location` est FACULTATIF : une fenêtre de test qui n'en donne pas n'a pas
   * d'adresse, donc aucune route à reposer — le branchement se comporte alors
   * exactement comme avant ce lot.
   */
  fenetre?: Pick<Window, 'addEventListener' | 'removeEventListener'> & {
    history: History;
    location?: { hash: string };
  };
  /**
   * La vue de démarrage choisie dans Réglages › Général
   * (`preferences.startupView`) — fil 2166. Posée seulement quand l'adresse
   * ne porte AUCUNE route : un lien profond passe avant. Absente : l'Accueil,
   * comme avant.
   */
  vueDeDemarrage?: unknown;
  /**
   * La vue de démarrage telle que la rend la RELECTURE du serveur — fils 2166
   * et 2168 (Bilou, rc3). `vueDeDemarrage` est lue au montage, dans la copie
   * locale ; celle-ci est la vue du PROFIL, qui arrive après. Elle ne remplace
   * l'écran que si personne n'a encore bougé et que l'adresse ne demandait
   * rien.
   */
  vueDeDemarrageRelue?: PromiseLike<unknown>;
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
    const etat = etatCoquille(vue, detail, get(ongletCourant));
    if (pousser) historique.pushState(etat, '', adressePour(etat));
    else historique.replaceState(etat, '', adressePour(etat));
  };

  /**
   * 🔴 LIRE L'ADRESSE AVANT DE L'ÉCRASER — le rechargement d'une route profonde.
   *
   * Bertrand, .18, v0.9.153 : `#library` puis F5 ramenait à l'Accueil ET
   * réécrivait l'adresse en `#home`. Le coupable est la ligne d'ancrage
   * ci-dessous, pas un routeur manquant : elle écrivait `get(activeView)`, qui
   * vaut `'home'` au démarrage, par-dessus le fragment que l'utilisateur venait
   * de demander. L'en-tête de ce module l'annonçait — « Rien ne LIT ce fragment
   * au démarrage ».
   *
   * On pose donc la vue AVANT l'ancrage, et l'ancrage réécrit ensuite la même
   * adresse. Trois raisons de le faire ICI et pas dans `ShellV2` :
   *
   *   • c'est le SEUL écrivain d'historique de cette coquille — y ajouter la
   *     lecture garde un mécanisme unique, celui que #1133 vient de compléter ;
   *   • l'écriture se fait par `replaceState`, jamais `pushState` : la pile ne
   *     grandit pas d'un cran, et le premier Précédent reste utile ;
   *   • le `set` a lieu AVANT les deux `subscribe` ci-dessous, donc leur premier
   *     appel — celui que `premiereVue` / `premierDetail` avalent — porte déjà
   *     la bonne valeur. Aucun effet réactif n'est en jeu, aucune boucle
   *     possible : `brancherHistoriqueCoquille` s'exécute une fois par montage.
   */
  // Fil 2166 — sans route dans l'adresse, la vue de démarrage choisie dans
  // les Réglages : elle n'avait plus de lecteur depuis le retrait d'`App.svelte`.
  // Elle remplace la vue de NAISSANCE (`'home'`), jamais une vue qu'un
  // écrivain a déjà posée avant le montage de la coquille.
  // Une vue posée par un écrivain AVANT le montage n'est jamais recouverte,
  // ni maintenant ni par la relecture tardive du profil.
  const vueDeNaissance = get(activeView) === 'home';
  const vueDemandee = vueAuChargement(
    fenetre.location?.hash ?? '',
    get(activeView) === 'home' ? options.vueDeDemarrage : null,
  );
  if (vueDemandee && vueDemandee !== get(activeView)) activeView.set(vueDemandee);
  const adresseDemandait = nomDeRoute(fenetre.location?.hash ?? '') !== '';
  const vueDuMontage = get(activeView);
  /** Vrai dès que l'écran a changé APRÈS le montage : la relecture tardive
   *  de la vue de démarrage ne déplace alors plus rien. */
  let aBouge = false;
  let debranche = false;

  // L'entrée COURANTE est ancrée, pas empilée : au chargement, la page a déjà
  // son entrée. En empiler une ici ferait qu'un premier Précédent ne bougerait
  // pas de l'écran — l'utilisateur croirait le bouton mort.
  //
  // C'est aussi ce qui NORMALISE l'adresse : un fragment inconnu, ou un détail
  // qu'on ne sait pas rouvrir, laisse l'adresse dire ce que l'écran montre
  // vraiment.
  ecrire(false, get(activeView), get(detailOuvert));

  // `subscribe` appelle TOUT DE SUITE avec la valeur courante : sans ces deux
  // drapeaux, le branchement lui-même empilerait deux entrées de plus.
  let premiereVue = true;
  let premierDetail = true;

  const arretVue = activeView.subscribe((vue) => {
    if (premiereVue) { premiereVue = false; return; }
    if (enRestauration) return;
    aBouge = true;
    // Changer de vue quitte le niveau de détail de la vue qu'on laisse : la
    // nouvelle entrée est une racine. Le magasin est remis à `null` EN
    // SILENCE, sinon son abonnement réécrirait l'entrée qu'on vient d'empiler.
    //
    // 🔴 SAUF si le geste VISE un détail de la vue d'arrivée (#1142) : l'entrée
    // est alors COMPOSÉE, elle porte la clé dès sa naissance, et le parcours ne
    // coûte qu'un cran au lieu de deux. Voir `allerAuDetail`.
    const vise = consommerVuePourEntree();
    enRestauration = true;
    detailOuvert.set(vise);
    // web#1790 — l'onglet appartient à la vue qu'on quitte.
    ongletCourant.set(null);
    enRestauration = false;
    ecrire(true, vue, vise);
  });

  const arretDetail = detailOuvert.subscribe((detail) => {
    if (premierDetail) { premierDetail = false; return; }
    if (enRestauration) return;
    // Une transition composée est en cours : l'entrée porte déjà ce que
    // l'écran d'arrivée est en train de reposer. Ni push, ni replace.
    if (transitionAbsorbe(detail)) return;
    // `opPourFiche` porte la règle d'intention, tracée dans Chrome sur .18 et
    // gardée par `retourHistoriqueFiche.test.ts` : ouverture → empiler ;
    // fermeture à la main → réécrire l'entrée courante ; fermeture PAR UN
    // RETOUR → ne rien écrire, le `popstate` qui suit repose l'état.
    const op = opPourFiche(detail !== null);
    if (op === 'push') ecrire(true, get(activeView), detail);
    else if (op === 'replace') ecrire(false, get(activeView), null);
  });

  // web#1790 — changer d'onglet réécrit l'entrée courante, sans empiler.
  let premierOnglet = true;
  const arretRetour = vueDeRetour.subscribe((v) => retenirOngletPour(v as string | null));
  const arretOnglet = ongletCourant.subscribe(() => {
    if (premierOnglet) { premierOnglet = false; return; }
    if (enRestauration) return;
    ecrire(false, get(activeView), get(detailOuvert));
  });

  const surRetour = (e: PopStateEvent) => {
    // Le retour annoncé par `reculerAvecIntention` est consommé : les
    // fermetures suivantes redeviennent des réécritures.
    finDuRetourProgrammatique();
    const etat = e.state;
    if (!estEtatCoquille(etat)) return;
    enRestauration = true;
    try {
      // L'onglet d'abord : l'écran que la vue remonte le lit à son montage.
      ongletCourant.set(etat.onglet ?? null);
      activeView.set(etat.vue as View);
      detailOuvert.set(etat.detail);
    } finally {
      enRestauration = false;
    }
  };
  fenetre.addEventListener('popstate', surRetour as EventListener);

  // Fils 2166 et 2168 — la vue du PROFIL, une fois relue du serveur. Posée
  // comme l'ancrage du montage : l'entrée courante est RÉÉCRITE, rien n'est
  // empilé, et le premier Précédent garde son sens.
  options.vueDeDemarrageRelue?.then((relue) => {
    if (debranche || aBouge || adresseDemandait || !vueDeNaissance) return;
    if (get(activeView) !== vueDuMontage || get(detailOuvert) !== null) return;
    const vue = vueAuChargement('', relue);
    if (!vue || vue === vueDuMontage) return;
    enRestauration = true;
    try {
      activeView.set(vue);
    } finally {
      enRestauration = false;
    }
    ecrire(false, vue, null);
  }, () => {});

  return () => {
    debranche = true;
    arretVue();
    arretDetail();
    arretOnglet();
    arretRetour();
    fenetre.removeEventListener('popstate', surRetour as EventListener);
  };
}

/**
 * ⚠️ CE QUE CE MODULE NE FAIT PAS, ET QUI SE VERRAIT.
 *
 * Revenir sur une entrée qui portait un détail repose la VUE et la clé ; ce
 * module ne ROUVRE rien lui-même. C'est à l'écran de lire la clé : la
 * Bibliothèque rouvre désormais sa fiche d'album LOCAL (`#library/album:12`)
 * au Suivant (`LibraryV2`, `suivantRouvreFicheAlbum.test.ts`). Un écran qui ne
 * lit pas sa clé rend encore la liste, pas la fiche.
 */
