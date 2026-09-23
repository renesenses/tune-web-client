<script module lang="ts">
  /**
   * 🔴 LA LARGEUR DE LA COLONNE D'ACTIONS — une seule fois, pour tout l'écran.
   *
   * Elle vivait dans le script d'instance, donc invisible du dehors. L'écran
   * Historique rend, dans le MÊME écran, des lignes de ce tableau et des
   * lignes d'objet (album, playlist) qui ne passent pas par ici : pour que les
   * deux tombent en face, la ligne d'objet doit composer sa grille avec cette
   * largeur-ci — pas avec une copie (#1149).
   *
   * 238 px = HUIT boutons de 28 px + sept gouttières de 2 px, la barre pleine
   * de `PisteActions`. Le chiffre a déjà changé deux fois (178 → 208 le
   * 16/09/2026, quand le menu « … » a porté la barre à sept ; 208 → 238 le
   * 20/09/2026, quand « Lire à partir d'ici » a cessé d'être optionnel) : un
   * témoin le recalcule en comptant les boutons,
   * `largeurActionsSuitLaBarre.test.ts`.
   *
   * 🔴 IL N'Y A PLUS DEUX LARGEURS. Elles ont existé tant que « Lire à partir
   * d'ici » était opt-in (#1061) : l'élargir partout aurait volé 30 px à la
   * dernière colonne de données des écrans qui ne le posaient pas. Bertrand,
   * 20/09/2026 : « Sur toutes les lignes où il y a une piste, ajoute le bouton
   * lire à partir de après celui de Lire ». Le bouton est désormais sur
   * TOUTES les lignes de cette liste, donc la colonne n'a qu'une largeur — et
   * deux constantes pour une seule valeur seraient la prochaine divergence.
   */
  export const LARGEUR_ACTIONS = '238px';
  /** La même largeur en NOMBRE, pour le calcul du plancher (#853). */
  export const LARGEUR_ACTIONS_PX = 238;
  /** La colonne de la POIGNÉE de réordonnancement : un bouton de 28 px. */
  export const LARGEUR_POIGNEE_PX = 28;
  /** Numérote les instances : la poignée à refocaliser après un déplacement
   *  au clavier se cherche dans le document, et deux listes peuvent y vivre. */
  let compteurListes = 0;
</script>

<script lang="ts">
  /**
   * Une liste de pistes — en TABLEAU au mode Essentiel, en lignes ailleurs.
   *
   * Chantier ouvert par Bertrand le 07/09/2026 sur la maquette de Levente.
   *
   * ## Pourquoi un conteneur, et pas une ligne enrichie
   *
   * Un tableau a un EN-TÊTE et des colonnes alignées. L'en-tête et les lignes
   * doivent partager le même `grid-template-columns`, sinon ils divergent — la
   * leçon de la vue Liste de la Bibliothèque, où un gabarit par ligne faisait
   * que les colonnes ne s'alignaient d'aucune ligne à l'autre (Bertrand,
   * 05/09/2026). Un seul gabarit, calculé ici, passé en variable CSS.
   *
   * ## Les deux autres modes ne bougent pas
   *
   * « Pour le moment les deux autres modes restent inchangés » (Bertrand). Au
   * dessus d'Essentiel, ce composant rend exactement ce qu'il rendait avant :
   * des `LignePisteV2`, mêmes props, même apparence. Le tableau n'est pas un
   * remplacement, c'est une seconde forme.
   *
   * ## Les actions restent celles de la v1
   *
   * « 3 actions est limitatif, on garde les actions de la v1 » (Bertrand). La
   * maquette en montre trois ; `PisteActions` en porte six — lire, lire
   * ensuite, file, playlist, étiquettes, favori — avec ses propres règles
   * (certaines réservées aux pistes locales). On le pose tel quel plutôt que
   * de réécrire une barre d'actions qui divergerait de l'autre.
   */
  import { tick, type Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { currentTrack, currentTrackId, playbackState, etatDeLaLigne }
    from '../../lib/stores/nowPlaying';
  import IndicateurLecture from './IndicateurLecture.svelte';
  import {
    cleInfobulleColonne, colonnesRetenues, gabaritGrille, largeurMinimale, modeEnTableau,
    valeurColonne, type CleColonne,
  } from '../../lib/colonnesPistes';
  import type { Track } from '../../lib/types';
  import DisponibiliteUpnp from './DisponibiliteUpnp.svelte';
  import LignePisteV2 from './LignePisteV2.svelte';
  import PisteActions from './PisteActions.svelte';
  import QualityBadge from '../partages/QualityBadge.svelte';
  import { pisteIndisponible } from '../../lib/albumAParaitre';
  import { ouvrirArtisteDepuis, artisteDePiste } from '../../lib/ouvrirArtisteDepuis';
  import { activeView } from '../../lib/stores/navigation';
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { zoneRequise } from '../../lib/zoneRequise';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ServiceBadge from '../partages/ServiceBadge.svelte';
  import { enTetesDisque as calculerEnTetes } from '../../lib/enTetesDisque';

  interface Props {
    pistes: Track[];
    /** Ce que fait un clic sur la ligne. Reçoit le rang, comme les boucles
     *  qu'il remplace : plusieurs écrans lisent « à partir d'ici ». */
    onLire: (piste: Track, index: number) => void;
    /**
     * « Lire à partir d'ici » sur CHAQUE ligne — #1061, FabienM, fil 1812,
     * point 9, puis Bertrand le 20/09/2026 : « Sur toutes les lignes où il y a
     * une piste, ajoute le bouton lire à partir de après celui de Lire ».
     *
     * 🔴 CE N'EST PLUS UN OPT-IN, C'EST UN REMPLACEMENT. Le motif d'avant
     * disait « seul l'ÉCRAN sait ce que la suite veut dire — son ordre
     * d'affichage et sa source par défaut pour une liste mixte », et six
     * écrans sur douze ne le passaient pas : le bouton manquait sur les
     * titres phares d'un artiste, l'Historique, les titres voisins de la
     * Recherche, les résultats et les favoris d'un service.
     *
     * Or l'argument ne tenait pas : `pistes` EST l'ordre d'affichage — c'est
     * ce que l'écran a remis à ce composant — et `lectureEnMasse.planDeLecture`
     * tranche déjà la source, liste mixte comprise. Le défaut ci-dessous fait
     * donc exactement ce que les cinq écrans qui passaient la prop écrivaient
     * à la main : `lireListeDepuis(pistes, rang, gestesDeZone(zone))`.
     *
     * La prop reste, pour les listes dont la suite n'est PAS la liste rendue :
     * l'Historique rejoue une entrée de journal, la file saute à un rang.
     */
    onLireDepuis?: ((piste: Track, index: number) => void) | null;
    /**
     * D'où vient le numéro affiché.
     *  - `piste` : `track_number` de l'album, replié sur le rang s'il manque ;
     *  - `rang`  : la position dans la liste ;
     *  - `aucune`: pas de numéro, même si la colonne est cochée.
     */
    numerotation?: 'piste' | 'rang' | 'aucune';
    /** Transmis tel quel au rendu en LIGNES (modes Avancé et Expert). */
    avecAlbum?: boolean;
    pochette?: boolean;
    /**
     * 🔴 La vignette en tête de ligne AU MODE TABLEAU — #3823.
     *
     * « Menu historique : régression par rapport à la v0.9.44 : manque
     * vignette du titre en début de ligne » (FabienM, fil 1749, v0.9.145), et
     * le même manque relevé le même jour par Pierre M, indépendamment, au
     * niveau Expert : « On peut avoir le "cover" ? ».
     *
     * L'écran de l'ANCIEN client porte cette vignette depuis toujours et à
     * tous les niveaux — `HistoryView.svelte:142`, un `AlbumArt` de 44 px en
     * tête de chaque ligne. Le portage vers la liste partagée l'a perdue aux
     * niveaux Essentiel et Expert, les deux qui rendent le TABLEAU
     * (`MODES_BRANCHES`) ; seul le rendu en lignes (Avancé) la garde.
     *
     * ⚠️ OPT-IN, et volontairement. Le même tableau sert la Bibliothèque
     * (onglet Titres), les playlists et la Recherche : y ajouter une pochette
     * partout serait un choix de design, pas la réparation d'une régression.
     * Seul l'Historique la demande ici, parce que c'est le seul écran dont
     * l'équivalent actuel la montre. Si le design tranche un jour pour tous,
     * le défaut de cette propriété change, et rien d'autre.
     *
     * ⚠️ La vignette vit DANS la cellule du titre, pas dans une colonne à
     * elle. C'est la règle du composant, écrite trois fois dans ce fichier :
     * l'en-tête et les lignes sont deux grilles séparées qui partagent un seul
     * `grid-template-columns`, et une colonne de plus dans les lignes seules
     * ferait dériver tous les en-têtes vers la droite. C'est exactement ce que
     * fait déjà `IndicateurLecture`, juste à côté.
     */
    pochetteEnTableau?: boolean;
    /**
     * 🔴 LA PROVENANCE DE CHAQUE LIGNE, au mode tableau — #1113.
     *
     * « Menu Recherche: il manque les vignettes des titres trouvés et leur
     * source (Bibliothèque, Qobuz, Bandcamp, Tidal, Youtube) » — FabienM, fil
     * 1829, 17/09/2026, v0.9.152. Sa capture montre la rangée de périmètre
     * « OÙ : Bibliothèque 10 · Qobuz 205 · Bandcamp 53 · Youtube 1 » au-dessus
     * d'UNE liste de titres : quatre provenances dans le même tableau, et pas
     * une ligne qui dise laquelle. `fusionnerParType` estampille pourtant
     * `source` sur chaque piste — la Recherche ne s'en servait que pour
     * fabriquer la clé de sa boucle.
     *
     * ⚠️ OPT-IN, pour la même raison que la vignette juste au-dessus. Ce
     * tableau sert aussi la Bibliothèque, les playlists et l'Historique, où
     * toutes les lignes ont la MÊME provenance : y répéter la pastille serait
     * du bruit. Seule la Recherche mêle les sources.
     *
     * ⚠️ La pastille vit DANS la cellule du titre, pas dans une colonne à
     * elle : la règle du composant, écrite trois fois dans ce fichier.
     *
     * ⚠️ Elle EXCLUT l'incrustation de `AlbumArt`, qui est l'autre moitié de
     * la même information. Deux pastilles pour une source, ce serait du volume
     * et non de la qualité ; et l'incrustation ne convient pas ici de toute
     * façon — `.tvig` fait 36 px en `overflow:hidden`, une pastille
     * « BANDCAMP » y est plus large que son support, et cette incrustation
     * écarte volontairement `local` (renesenses/tune-server-rust#3900), ce qui
     * laisserait muette la ligne de bibliothèque au milieu de trois qui
     * parlent.
     *
     * 🔴 AUCUN repli `?? 'local'` : c'est `source` telle qu'elle est. Une
     * source inconnue ne rend AUCUNE pastille — `ServiceBadge` est une table
     * fixe — plutôt qu'un « LOCAL » menteur sur une piste distante (règle
     * tenue par `badgeUpnp.test.ts`).
     */
    sourceEnTableau?: boolean;
    /**
     * 🔴 Une FABRIQUE, pas un gestionnaire.
     *
     * Seul l'appelant sait si l'album de CETTE piste est chargé : la
     * Bibliothèque n'ouvre la fiche que pour un album présent dans son
     * magasin. Un gestionnaire unique montrerait la loupe sur toutes les
     * lignes, y compris celles qu'elle ne peut pas ouvrir — un bouton qui ne
     * fait rien est pire qu'un bouton absent.
     *
     * Rendre `null` pour une piste, c'est dire « pas de loupe ici ».
     * Sans objet au mode tableau, qui n'a pas de pochette.
     */
    ouvertureAlbum?: ((piste: Track, index: number) => (() => void) | null) | null;
    /**
     * Contenu propre à un écran, rendu APRÈS chaque ligne.
     *
     * La playlist y met son bouton « retirer », l'historique l'instant et le
     * cœur d'un titre radio. Il devient une COLONNE de la grille, pas une
     * enveloppe : enveloppé, la ligne serait plus étroite que l'en-tête et
     * les colonnes ne tomberaient plus en face.
     *
     * Le fragment est compilé chez l'appelant : ses styles le suivent.
     */
    apres?: Snippet<[Track, number]>;
    /**
     * 🔴 La clé de liste, quand `id` ne suffit pas.
     *
     * L'Historique peut afficher DEUX FOIS la même piste — écoutée deux fois.
     * Deux clés identiques et Svelte s'arrête sur `each_key_duplicate` : la
     * liste entière disparaît. C'est le piège déjà documenté dans les Favoris,
     * où toute piste de service porte `id: null`.
     *
     * Par défaut `id`, replié sur le rang. Un écran qui sait mieux le dit.
     */
    clef?: (piste: Track, index: number) => string | number;
    /**
     * Largeur de la colonne du suffixe. Une longueur CSS, jamais `auto`.
     *
     * Voir le commentaire du gabarit : une colonne dimensionnée par son
     * contenu se résout dans CHAQUE grille séparément, donc différemment dans
     * l'en-tête (vide) et dans les lignes.
     */
    largeurApres?: string;
    /**
     * 🔴 Un en-tête « Disque N » avant chaque disque — #1431.
     *
     * Marco Polo, fil 1885 : les pistes d'un coffret réuni s'enchaînaient sans
     * dire de quel disque elles venaient. OPT-IN : seule la fiche d'album
     * rend les pistes d'UN album dans l'ordre disque/piste ; sur une playlist
     * ou la file, deux pistes voisines peuvent venir de deux albums et un
     * « Disque 2 » y mentirait.
     *
     * Les lignes ne bougent pas (`enTetesDisque` n'ordonne rien) : le rang
     * passé à `onLire` reste celui de `pistes`. Un seul disque sans
     * sous-titre : aucun en-tête, la règle d'Oxygen.
     */
    enTetesDisque?: boolean;
    /**
     * 🔴 Le RÉORDONNANCEMENT, par glisser-déposer et au clavier — OPT-IN.
     *
     * Bertrand, 23/09/2026 : l'écran « Gestion des playlists » rendait sa
     * propre liste de pistes — le TROISIÈME rendu de piste du client, sans
     * étiquettes ni menu « … » — pour une seule raison : il savait réordonner
     * en glissant, et cette liste-ci ne le savait pas. Le geste vient donc
     * ici, et l'écran se branche sur la liste commune comme les autres.
     *
     * Ce que ça pose, quand la prop est vraie :
     *   · une POIGNÉE en tête de ligne (colonne de 28 px, en tableau comme en
     *     lignes), focalisable : ↑ et ↓ déplacent la piste d'un rang — les
     *     flèches de la file (`QueueV2`), pour que le geste se lise partout
     *     pareil, et pour que le réordonnancement soit atteignable au clavier
     *     et au lecteur d'écran, ce que le glisser seul n'est pas ;
     *   · la LIGNE entière se saisit à la souris (HTML5 `draggable`), comme
     *     dans l'écran hérité ; la ligne survolée se souligne, la ligne
     *     saisie s'estompe.
     *
     * Quand la prop est absente, RIEN ne change : ni colonne, ni attribut,
     * ni gestionnaire. Une garde monte la liste sans la prop et le vérifie.
     *
     * La liste ne réordonne rien elle-même : elle DIT `onReordonner(de, vers)`
     * avec les deux rangs dans `pistes`, et l'écran — seul à connaître son
     * serveur — déplace, enregistre, et recharge s'il échoue.
     */
    reordonnable?: boolean;
    onReordonner?: ((de: number, vers: number) => void | Promise<void>) | null;
    /** La clé i18n de l'étiquette d'une piste indisponible — voir
     *  `LignePisteV2`. Une playlist dit « Indisponible », pas « À paraître ». */
    etiquetteIndispo?: string;
  }
  let {
    pistes, onLire, onLireDepuis = null, numerotation = 'rang',
    avecAlbum = true, pochette = true, pochetteEnTableau = false,
    sourceEnTableau = false,
    ouvertureAlbum = null, apres,
    clef = (p, i) => p.id ?? i, largeurApres = '96px',
    enTetesDisque = false,
    reordonnable = false, onReordonner = null,
    etiquetteIndispo = 'v2.str.coming',
  }: Props = $props();
  /**
   * Le glisser-déposer : deux rangs, et rien d'autre.
   *
   * `saisi` est la ligne qu'on tient, `survolee` celle au-dessus de laquelle
   * on passe. Les deux sont des RANGS dans `pistes`, jamais des références de
   * piste : après un déplacement l'écran réassigne sa liste, et une référence
   * gardée d'un proxy `$state` serait détachée.
   */
  let saisi = $state<number | null>(null);
  let survolee = $state<number | null>(null);
  const idListe = ++compteurListes;
  function saisir(e: DragEvent, i: number): void {
    saisi = i;
    // Firefox n'entame aucun glisser sans donnée ; `dataTransfer` manque
    // dans jsdom, d'où la garde.
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    }
  }
  function survoler(e: DragEvent, i: number): void {
    if (saisi == null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    survolee = i;
  }
  function quitter(i: number): void {
    if (survolee === i) survolee = null;
  }
  function relacher(): void {
    saisi = null;
    survolee = null;
  }
  function deposer(e: DragEvent, i: number): void {
    e.preventDefault();
    const de = saisi;
    relacher();
    if (de == null || de === i) return;
    void onReordonner?.(de, i);
  }
  /**
   * ↑ / ↓ sur la poignée : un rang, et le focus SUIT la piste.
   *
   * La liste est à clé : Svelte déplace le nœud plutôt que de le recréer, et
   * le focus le suivrait de lui-même — sauf quand l'écran donne le RANG pour
   * clé, ce que fait une playlist, où la même piste peut figurer deux fois.
   * On refocalise donc explicitement, une fois le rendu passé.
   */
  async function deplacerAuClavier(e: KeyboardEvent, i: number): Promise<void> {
    const vers = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
    if (vers == null || vers < 0 || vers >= pistes.length) return;
    e.preventDefault();
    e.stopPropagation();
    await onReordonner?.(i, vers);
    await tick();
    Array.from(document.querySelectorAll<HTMLElement>('.poignee'))
      .find((b) => b.dataset.liste === String(idListe) && b.dataset.rang === String(vers))
      ?.focus();
  }

  // #1431 — pour chaque rang, l'en-tête à poser AVANT la ligne, ou `null`.
  const enTetes = $derived(enTetesDisque ? calculerEnTetes(pistes) : []);

  /**
   * « Lire à partir d'ici », par DÉFAUT — Bertrand, 20/09/2026.
   *
   * L'écran garde la main (`onLireDepuis`) quand sa suite n'est pas la liste
   * rendue. Sans lui, la suite EST la liste rendue, dans son ordre : c'est la
   * seule chose que ce composant puisse affirmer, et c'est ce que les cinq
   * écrans qui passaient la prop écrivaient mot pour mot.
   *
   * 🔴 Sans zone, on ne joue rien — mais on le DIT (#1233). `playAndSync` a
   * besoin d'un identifiant de zone, et l'inventer enverrait la lecture
   * ailleurs ; sortir en silence, c'est le défaut des « Titres phares non
   * cliquables » du 18/09/2026. Le bouton, lui, reste rendu : la colonne ne
   * doit pas changer de largeur selon l'état des zones.
   */
  function lireDepuis(p: Track, i: number): void {
    if (onLireDepuis) { onLireDepuis(p, i); return; }
    const zid = zoneRequise();
    if (zid == null) return;
    lireListeDepuis(pistes, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }

  const mode = $derived($preferences.settingsLevel);
  /**
   * 🔴 Une SEULE source de vérité : `MODES_BRANCHES`, via `modeEnTableau`.
   *
   * Cette ligne testait `mode === 'beginner'` en dur, pendant que l'écran des
   * Réglages, lui, consultait `MODES_BRANCHES` pour griser les modes non
   * branchés. Deux réponses à une seule question : brancher Expert dans la
   * constante n'aurait rien changé ici, et la matrice aurait annoncé cochable
   * un mode que le tableau continuait d'ignorer — le défaut exact que ce
   * client passe son temps à corriger.
   *
   * Ne jamais remettre de nom de mode en dur ici. Une garde le vérifie.
   */
  const enTableau = $derived(modeEnTableau(mode));

  // Le MODE est passé : une colonne réservée à Expert ne doit pas apparaître
  // si un réglage plus ancien la coche pour un mode inférieur.
  const colonnes = $derived(colonnesRetenues($preferences.v2Colonnes?.[mode] ?? [], mode));
  /**
   * 🔴 AUCUN `auto` dans ce gabarit. C'est la règle, et elle a une raison.
   *
   * L'en-tête et les lignes sont des grilles SÉPARÉES qui partagent le même
   * `grid-template-columns`. Une colonne dimensionnée par son contenu — `auto`,
   * `max-content` — se résout donc dans chacune indépendamment : à zéro dans
   * l'en-tête, où la cellule d'actions est vide, et à ~238 px dans les lignes.
   * Les colonnes en `fr` absorbent l'écart, et TOUS les en-têtes dérivent vers
   * la droite. Signalé par Bertrand le 07/09/2026, capture à l'appui : « TIME »
   * deux cents pixels à droite de « 5:24 ».
   *
   * Pire : les actions sont CONDITIONNELLES — playlist et étiquettes ne sont
   * offertes que sur une piste locale. En `auto`, deux lignes voisines
   * n'auraient donc pas la même largeur d'actions, et se désaligneraient entre
   * elles.
   *
   * C'est la leçon de la vue Liste de la Bibliothèque, écrite le 05/09 et que
   * j'ai réintroduite ici. Une garde la tient désormais.
   *
   * 238 px = HUIT boutons de 28 px + sept gouttières de 2 px, la barre pleine.
   *
   * 🔴 Elle valait 178 px — six boutons — jusqu'au 16/09/2026. Le menu « … »
   * (a5be266a, 07/09) avait porté la barre à sept sans toucher à ce chiffre :
   * `.act` est en `overflow:visible; justify-content:flex-end`, donc les 30 px
   * en trop débordaient à GAUCHE, sur la dernière colonne de données. Bertrand,
   * capture à l'appui : la colonne DR se lisait « 1▶ » au lieu de « 12 » — le
   * bouton Lire recouvrait le second chiffre. Ce nombre doit suivre la barre :
   * un témoin compte les boutons de `PisteActions` et le recalcule.
   */
  // `LARGEUR_ACTIONS` et `LARGEUR_ACTIONS_PX` sont déclarés dans le
  // `<script module>` en tête de fichier : l'Historique compose sa ligne
  // d'objet avec la MÊME valeur (#1149).
  const largeurApresPx = $derived(parseFloat(largeurApres) || 0);
  // #1061 : la colonne suit la barre, bouton « à partir d'ici » compris — et
  // il y est sur TOUTES les lignes depuis le 20/09/2026, donc une seule valeur.
  const largeurDesActions = LARGEUR_ACTIONS;
  const largeurDesActionsPx = LARGEUR_ACTIONS_PX;
  // La poignée est une COLONNE de la grille, en tête, présente dans l'en-tête
  // comme dans les lignes : la même règle que le suffixe, pour la même raison.
  const colonnePoignee = $derived(reordonnable ? `${LARGEUR_POIGNEE_PX}px ` : '');
  const gabarit = $derived(
    `${colonnePoignee}${gabaritGrille(colonnes)} ${largeurDesActions}${apres ? ` ${largeurApres}` : ''}`,
  );

  /**
   * 🔴 #853 — la largeur minimale de la grille : somme des PLANCHERS.
   *
   * Pierre M (fil 1671) avait coché une dizaine de colonnes de plus que les
   * dix d'Expert. Les colonnes fixes remplissaient sa fenêtre, les `fr` se
   * partageaient ce qui restait, et le titre tombait à ~64 px — « E… ». Les
   * planchers posés dans le catalogue ne valent que si la grille a le droit de
   * DÉBORDER : sinon elle les ignore et comprime quand même.
   */
  const minGrille = $derived(
    largeurMinimale(colonnes, largeurDesActionsPx + (apres ? largeurApresPx : 0)
      + (reordonnable ? LARGEUR_POIGNEE_PX : 0)),
  );

  /**
   * L'état de lecture d'une ligne, en mode TABLEAU (#1845).
   *
   * Le mode lignes délègue à `LignePisteV2`, qui le calcule chez lui ; le
   * tableau rend ses cellules lui-même et doit donc le faire ici. Les trois
   * magasins sont lus UNE fois, dans des `$derived` : lus dans la fonction,
   * ils seraient réabonnés à chaque ligne de chaque rendu.
   */
  const npId = $derived($currentTrackId);
  const npPiste = $derived($currentTrack);
  const npEtat = $derived($playbackState);
  const etatDe = (p: Track) => etatDeLaLigne(p, npId, npPiste, npEtat);

  function numero(p: Track, i: number): string | null {
    if (numerotation === 'aucune') return null;
    if (numerotation === 'rang') return String(i + 1);
    return String(p.track_number || i + 1);
  }

  /** La valeur d'une cellule. Le numéro est le seul cas que le modèle ne peut
   *  pas trancher seul : il dépend de l'écran, pas de la piste. */
  function cellule(p: Track, i: number, cle: CleColonne): string | null {
    return cle === 'num' ? numero(p, i) : valeurColonne(p, cle);
  }
</script>

{#snippet enTeteDisque(i: number)}
  {@const e = enTetes[i]}
  {#if e}
    <div class="dischead">
      <span class="discno">{$t('library.disc' as any).replace('{num}', String(e.disque))}</span>
      {#if e.sousTitre}<span class="discsub">{e.sousTitre}</span>{/if}
    </div>
  {/if}
{/snippet}

{#snippet poignee(i: number)}
  <!-- La poignée : un bouton, pour que le clavier l'atteigne. `aria-label`
       dit les deux gestes. `data-liste`/`data-rang` servent à la retrouver
       après un déplacement au clavier, pour que le focus suive la piste. -->
  <button class="poignee" type="button" data-liste={idListe} data-rang={i}
    title={$t('v2.liste.poignee' as any)} aria-label={$t('v2.liste.poignee' as any)}
    onkeydown={(e) => deplacerAuClavier(e, i)} onclick={(e) => e.stopPropagation()}>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
      <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
      <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
    </svg>
  </button>
{/snippet}
{#if !enTableau}
  <!-- Les modes HORS tableau — Avancé seul depuis le 09/09/2026, Expert étant
       passé au tableau. Ce rendu est inchangé à la virgule près : le suffixe
       garde la même enveloppe en grille que les écrans avaient chez eux. Une
       garde vérifie qu'Avancé l'emprunte toujours. -->
  {#each pistes as p, i (clef(p, i))}
    {@const ouvrir = ouvertureAlbum?.(p, i) ?? null}
    {@render enTeteDisque(i)}
    {#if apres || reordonnable}
      <!-- L'enveloppe sert au suffixe ET à la poignée : sans l'un ni l'autre,
           la ligne est rendue nue, exactement comme avant. -->
      <!-- Le glisser à la souris est un raccourci : le geste ACCESSIBLE est
           la poignée, un bouton focalisable qui répond aux flèches. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="avecSuffixe" class:avecPoignee={reordonnable} class:sansSuffixe={!apres}
        class:saisie={saisi === i} class:survolee={survolee === i}
        draggable={reordonnable || undefined}
        ondragstart={reordonnable ? (e) => saisir(e, i) : undefined}
        ondragover={reordonnable ? (e) => survoler(e, i) : undefined}
        ondragleave={reordonnable ? () => quitter(i) : undefined}
        ondrop={reordonnable ? (e) => deposer(e, i) : undefined}
        ondragend={reordonnable ? relacher : undefined}>
        {#if reordonnable}{@render poignee(i)}{/if}
        <LignePisteV2
          piste={p}
          numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
          onLire={() => onLire(p, i)}
          onLireDepuis={() => lireDepuis(p, i)}
          {avecAlbum}
          {pochette}
          onOuvrirAlbum={ouvrir}
          {etiquetteIndispo}
        />
        <!--
          🔴 Le suffixe est enveloppé, et ce n'est pas cosmétique.
          `.avecSuffixe` est une grille à DEUX colonnes. Un extrait qui rend
          plusieurs éléments racine — l'Historique en rend deux, l'heure et le
          cœur radio — en posait donc TROIS dans deux colonnes : le troisième
          passait à une seconde ligne IMPLICITE, sous la piste.
          Le cœur radio est en `opacity:0` hors survol : la ligne supplémentaire
          était invisible, et coûtait pourtant 28 px de hauteur plus les 8 px de
          gouttière. Bertrand, 09/09/2026 : « Historique : diminue l'espace
          entre les pistes ». Ce n'était pas un réglage d'espacement, c'était
          une ligne de grille en trop, à chaque piste.
          Une enveloppe, et le nombre de colonnes cesse de dépendre de ce que
          l'appelant a écrit dans son extrait.
        -->
        {#if apres}<span class="suffixe">{@render apres(p, i)}</span>{/if}
      </div>
    {:else}
      <LignePisteV2
        piste={p}
        numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
        onLire={() => onLire(p, i)}
        onLireDepuis={() => lireDepuis(p, i)}
        {avecAlbum}
        {pochette}
        onOuvrirAlbum={ouvrir}
        {etiquetteIndispo}
      />
    {/if}
  {/each}
{:else}
  <!-- 🔴 #853 — `--tmin` est la largeur en deçà de laquelle le tableau DÉFILE
       au lieu de comprimer. Sans elle, les planchers des colonnes de texte
       seraient simplement ignorés par la grille, qui redescendrait sous eux. -->
  <div class="tbl" class:reordonnable style="--tcols:{gabarit}; --tmin:{minGrille}px" role="table">
    <div class="thead" role="row">
      <!-- La colonne de la poignée : dans l'en-tête aussi, sinon tout dérive
           d'une colonne vers la droite. -->
      {#if reordonnable}<span class="th" role="columnheader"></span>{/if}
      {#each colonnes as c (c.cle)}
        <span class="th" class:d={c.align === 'droite'} class:c={c.align === 'centre'}
          role="columnheader">{$t(c.cleI18n as any)}</span>
      {/each}
      <!-- La colonne d'actions n'a pas d'en-tête : son contenu se lit seul, et
           un libellé y serait répété sur chaque ligne pour rien. -->
      <span class="th" role="columnheader" aria-label={$t('v2.tcol.actions' as any)}></span>
      {#if apres}<span class="th" role="columnheader"></span>{/if}
    </div>

    {#each pistes as p, i (clef(p, i))}
      {@const etat = etatDe(p)}
      {@render enTeteDisque(i)}
      <!-- Point 10 (17/09/2026) — une piste que le service dit indisponible
           est grisée et ne se lance pas : le lancer rendrait « no url ». -->
      {@const indispo = pisteIndisponible(p)}
      <!-- Les attributs du glisser ne sont posés QUE si la liste est
           réordonnable : sans la prop, la ligne est celle d'avant. -->
      <!-- Même règle qu'en mode lignes : la ligne se saisit à la souris, la
           poignée (un bouton) porte le geste au clavier. -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div class="trow" class:np={etat != null} class:indispo aria-current={etat ? 'true' : undefined}
        class:saisie={saisi === i} class:survolee={survolee === i}
        draggable={reordonnable || undefined}
        ondragstart={reordonnable ? (e) => saisir(e, i) : undefined}
        ondragover={reordonnable ? (e) => survoler(e, i) : undefined}
        ondragleave={reordonnable ? () => quitter(i) : undefined}
        ondrop={reordonnable ? (e) => deposer(e, i) : undefined}
        ondragend={reordonnable ? relacher : undefined}
        role="row">
        {#if reordonnable}<span class="td act" role="cell">{@render poignee(i)}</span>{/if}
        {#each colonnes as c (c.cle)}
          {#if c.cle === 'quality'}
            <span class="td" role="cell">
              <QualityBadge format={p.format} sampleRate={p.sample_rate}
                bitDepth={p.bit_depth} source={p.source} />
            </span>
          {:else if c.verrouillee}
            <!-- Le TITRE porte le clic de lecture : c'est la cible la plus
                 large et la plus évidente de la ligne. -->
            <button class="td titre" onclick={() => { if (!indispo) onLire(p, i); }}
              disabled={indispo} title={indispo ? $t(etiquetteIndispo as any) : p.title}>
              <!-- L'indicateur est DANS la cellule du titre : une colonne de plus
                   décalerait l'en-tête, et la règle de ce composant est qu'un
                   seul gabarit vaut pour l'en-tête et pour les lignes.
                   La vignette (#3823) suit la MÊME règle, pour la même raison. -->
              <!-- 🔴 #1113 — la pastille de la LIGNE remplace l'incrustation de
                   la vignette, elle ne s'y ajoute pas : une source par ligne
                   suffit, et l'incrustation de 36 px tronque son texte. -->
              {#if pochetteEnTableau}
                <span class="tvig">
                  <AlbumArt coverPath={p.cover_path} albumId={p.album_id} size={36}
                    alt={p.title ?? ''} source={sourceEnTableau ? null : p.source} />
                </span>
              {/if}
              <IndicateurLecture {etat} />
              <span class="ttxt">{cellule(p, i, c.cle) ?? ''}</span>
              <!-- D'OÙ VIENT CETTE LIGNE — #1113. Telle quelle : une source
                   absente ne rend aucune pastille, jamais un « LOCAL » faux. -->
              {#if sourceEnTableau}<ServiceBadge source={p.source} compact />{/if}
              {#if p.source === 'upnp'}<DisponibiliteUpnp sourceId={p.source_id} />{/if}
              {#if indispo}<span class="indispo-etiq">{$t(etiquetteIndispo as any)}</span>{/if}
            </button>
          {:else}
            {@const v = cellule(p, i, c.cle)}
            <!--
              #1193 — la colonne ARTISTE renvoie à la fiche de l'artiste.
              Posée ICI, dans le tableau PARTAGÉ : la playlist que FabienM
              montre, mais aussi les Favoris, la fiche d'album et la
              Bibliothèque, qui affichent la même colonne. `artisteDePiste`
              distingue un identifiant de bibliothèque d'un identifiant de
              service — les confondre ouvrirait un artiste au hasard.
            -->
            {@const artiste = c.cle === 'artist' ? artisteDePiste(p) : null}
            <!-- Une cellule sans valeur reste VIDE : « — » affirmerait une
                 absence qu'on n'a pas mesurée. -->
            <!-- #3924 — l'infobulle dit la PROVENANCE quand la colonne en a
                 une (le Dynamic Range, et lui seul). Partout ailleurs elle
                 reste la valeur brute, comme avant. -->
            {@const ib = cleInfobulleColonne(p, c.cle)}
            {#if artiste && v}
              <span class="td" role="cell">
                <button class="lien-artiste" title={v}
                  onclick={(e) => { e.stopPropagation(); void ouvrirArtisteDepuis(artiste, $activeView); }}>{v}</button>
              </span>
            {:else}
              <span class="td" class:d={c.align === 'droite'} class:c={c.align === 'centre'}
                role="cell" title={ib ? $t(ib as any) : (v ?? '')}>{v ?? ''}</span>
            {/if}
          {/if}
        {/each}
        <span class="td act" role="cell"><PisteActions piste={p}
          onLireDepuis={() => lireDepuis(p, i)} /></span>
        {#if apres}<span class="td act" role="cell">{@render apres(p, i)}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* 🔴 UN seul gabarit, posé sur le conteneur et hérité par l'en-tête comme
     par les lignes. Deux gabarits calculés séparément divergent — c'est le
     défaut d'alignement relevé sur la vue Liste le 05/09/2026. */
  /* 🔴 #853 — le tableau DÉFILE au lieu de comprimer. `.tbl` n'avait aucun
     `overflow-x` : la grille ne pouvait pas déborder, donc elle écrasait. */
  .tbl{display:flex; flex-direction:column; min-width:0; overflow-x:auto}
  .tbl::-webkit-scrollbar{height:9px}
  /* #1431 — l'en-tête de disque : une ligne de texte, hors de la grille des
     colonnes (il n'a pas de cellules), la forme de `.dischead` d'Oxygen. */
  .dischead{display:flex; align-items:baseline; gap:10px; padding:14px 10px 4px}
  .discno{font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
    color:var(--v2-txt3)}
  .discsub{font-size:12px; color:var(--v2-txt2)}
  .tbl::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .thead, .trow{display:grid; grid-template-columns:var(--tcols); align-items:center;
    gap:14px; padding:0 10px; min-width:var(--tmin, 0)}
  .thead{position:sticky; top:0; z-index:2; background:var(--v2-bg);
    border-bottom:1px solid var(--v2-line2); padding-bottom:9px; margin-bottom:4px}
  .th{font:600 11px var(--v2-sans); letter-spacing:.04em; color:var(--v2-txt3);
    text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  .trow{border-radius:9px; color:var(--v2-txt2); min-height:46px}
  .trow:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .trow.np{color:var(--v2-acc1)}
  /* Point 10 — la piste que le service ne sert pas encore. */
  /* #1193 — le lien garde EXACTEMENT l'allure de la cellule : c'est une
     colonne de tableau, pas un bouton. */
  .lien-artiste{background:none; border:none; padding:0; font:inherit; color:inherit;
    text-align:left; cursor:pointer; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lien-artiste:hover{text-decoration:underline; color:var(--v2-txt)}

  .trow.indispo{opacity:0.5}
  .trow.indispo .titre{cursor:default}
  .indispo-etiq{margin-left:8px; font:600 10px var(--v2-sans); color:var(--v2-acc2);
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:1px 6px; white-space:nowrap}

  .td{font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Les colonnes de chiffres s'alignent à droite, en chiffres tabulaires :
     sans quoi la durée saute d'un pixel d'une ligne à l'autre. */
  .th.d, .td.d{text-align:right; font-variant-numeric:tabular-nums}
  .th.c, .td.c{text-align:center}

  .titre{display:flex; align-items:center; gap:7px;
    padding:0; border:0; background:transparent; cursor:pointer; text-align:left;
    font:600 13.5px var(--v2-sans); color:var(--v2-txt); min-width:0}
  /* 36 px : la ligne du tableau fait 46 px de haut (`.trow`), contre 56 px
     dans l'ancien écran qui portait une vignette de 44. La vignette ne doit
     pas décider de la hauteur de la ligne, sinon le tableau change de densité
     sur le seul écran qui l'active. `flex:0 0 auto` : elle ne se comprime
     jamais — c'est le TEXTE qui s'élide, comme l'indicateur juste à côté. */
  .tvig{flex:0 0 auto; width:36px; height:36px; border-radius:4px;
    overflow:hidden; display:block; line-height:0}
  /* C'est le TEXTE qui s'élide, jamais l'indicateur : un repère tronqué ne
     repère plus rien. */
  .ttxt{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .trow.np .titre{color:var(--v2-acc1)}
  .titre:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px; border-radius:4px}

  /* Les actions sont calées à DROITE : une piste sans playlist ni étiquettes
     en montre quatre au lieu de six, et l'alignement se ferait sinon sur la
     gauche — les cœurs ne seraient plus l'un sous l'autre. */
  .act{overflow:visible; display:flex; align-items:center; justify-content:flex-end}

  /* Le suffixe en mode LIGNES : la même grille que les écrans avaient chez
     eux (`1fr auto`), pour que rien ne bouge à leurs yeux. */
  .avecSuffixe{display:grid; grid-template-columns:minmax(0,1fr) auto;
    align-items:center; gap:8px}
  /* Avec la poignée, une colonne de plus EN TÊTE — et sans suffixe, la
     dernière disparaît : la ligne reste `1fr`, jamais plus étroite. */
  .avecSuffixe.avecPoignee{grid-template-columns:auto minmax(0,1fr) auto}
  .avecSuffixe.avecPoignee.sansSuffixe{grid-template-columns:auto minmax(0,1fr)}
  /* La poignée de réordonnancement : la taille d'un bouton de `PisteActions`
     (28 px), discrète au repos, franche au survol ou au focus. `grab` dit le
     geste à la souris ; le clavier a son `aria-label`. */
  .poignee{width:28px; height:28px; padding:6px; border:0; border-radius:6px;
    background:transparent; color:var(--v2-txt3); cursor:grab; display:flex;
    align-items:center; justify-content:center; flex:0 0 auto}
  .poignee svg{width:16px; height:16px}
  .poignee:hover, .poignee:focus-visible{color:var(--v2-txt); background:var(--v2-hover)}
  .poignee:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:1px}
  /* Le retour du glisser : la ligne saisie s'estompe, la ligne survolée
     porte un trait d'accent au-dessus — la place où la piste tombera. */
  .trow.saisie, .avecSuffixe.saisie{opacity:.45}
  .trow.survolee, .avecSuffixe.survolee{box-shadow:inset 0 2px 0 0 var(--v2-acc1)}
  /* L'enveloppe du suffixe : quel que soit le nombre d'éléments que l'extrait
     rend, ils tiennent sur UNE ligne et dans UNE colonne. */
  .suffixe{display:flex; align-items:center; gap:8px; justify-content:flex-end}

  /* Sous 720 px les colonnes ne tiennent plus : l'en-tête se retire et les
     lignes redeviennent lisibles en pile plutôt que d'être rognées. */
  @media (max-width: 720px){
    .thead{display:none}
    .trow{grid-template-columns:minmax(0,1fr) auto}
    /* La poignée est une cellule `.act` : elle reste, et prend sa colonne. */
    .tbl.reordonnable .trow{grid-template-columns:auto minmax(0,1fr) auto}
    .trow .td:not(.act):not(.titre){display:none}
  }
</style>
