<script lang="ts">
  /**
   * Les cinq actions posées SUR une pochette.
   *
   * Chantier ouvert par Bertrand le 02/09/2026, maquette de Levente. Quatre
   * coins et un centre :
   *
   * | Position | Action |
   * |---|---|
   * | haut gauche | favori (bascule) |
   * | haut droite | édition |
   * | bas gauche | menu d'actions — `lib/actionsPochette` en dit le contenu |
   * | bas droite | étiquettes : voir, ajouter, retirer |
   * | centre | lecture |
   *
   * Les positions viennent de la MAQUETTE, pas de l'énoncé : les deux
   * divergeaient sur l'emplacement de l'édition et des étiquettes, et Bertrand
   * a tranché pour la maquette (« je modifierai si nécessaire »).
   *
   * 🔴 CE COMMENTAIRE A MENTI PENDANT 24 JOURS. Il annonçait un menu
   * « **inerte**, la modale reste à définir » alors que le mécanisme existait et
   * marchait depuis le 02/09/2026 : la propriété `menu`, l'état `menuOuvert`, la
   * fermeture au clic ailleurs et à Échap, `aria-haspopup`. Une session l'a lu
   * le 26/09/2026 et en a conclu qu'il n'y avait rien à brancher. Corrigé le
   * même jour, en même temps que le catalogue.
   *
   * ## Une enveloppe, pas une vignette
   *
   * Ce composant ne dessine PAS la pochette : il la reçoit en `children` et
   * pose les actions par-dessus. C'est ce qui lui permet d'habiller aussi bien
   * un `AlbumArt` qu'une `MosaiquePochettes` — un album, une collection, une
   * playlist et un artiste n'ont pas la même image, mais ont les mêmes gestes.
   *
   * ## Ce qui ne s'applique pas est ABSENT, pas grisé
   *
   * Une collection ne se met pas en favori : l'API n'existe pas. Un bouton
   * grisé promettrait une action à venir ; un bouton absent ne promet rien.
   *
   * 🔴 SANS EXCEPTION depuis le 26/09/2026. Le menu d'actions en était une : il
   * restait présent et grisé, avec le libellé « Autres actions — bientôt », sur
   * les huit écrans qui ne lui passaient rien. L'exception avait été accordée
   * « en attendant la modale de Levente » et a duré 24 jours — un bouton grisé
   * qui promet depuis 24 jours ne promet plus, il ment. Bertrand, 26/09/2026 :
   * le bouton DISPARAÎT là où le catalogue ne rend rien.
   *
   * ## Le contenu du menu ne vit PAS ici
   *
   * Il vient de `lib/actionsPochette`, un module que les treize écrans
   * appellent. La raison est celle de `lib/menuPiste` : une garde écrite contre
   * ce composant ne peut que lire son TEXTE, et un texte présent ne prouve pas
   * qu'il s'exécute. La liste sortie dans un module, la garde l'appelle et
   * regarde ce qui en sort. Et treize écrans qui construisent chacun son
   * tableau, ce sont treize vérités — le défaut que Dominique Comet avait relevé
   * sur le menu de piste (deux chemins vers la même chose, pas les mêmes
   * gestes).
   *
   * ## Le menu est PORTÉ à la racine du document
   *
   * Comme `MenuPisteV2`, et pour la même raison : `.pa` porte `overflow:
   * hidden` (c'est lui qui arrondit la pochette), la carte de la Bibliothèque
   * porte `content-visibility: auto` — qui implique `contain: layout style
   * paint` — et la grille défile. Ancré dans la pochette, le menu se faisait
   * rogner ; dans une grille de 800 albums, c'est une certitude, pas un risque.
   * On porte donc le nœud à la racine (`lib/portail`) et on le place aux
   * coordonnées ÉCRAN du bouton (`lib/ancrageMenu`). Il se referme dès que la
   * page bouge sous lui : des coordonnées figées suivraient le bouton de très
   * loin.
   *
   * ## Pourquoi les boutons n'apparaissent qu'au survol
   *
   * Cinq icônes en permanence sur chaque vignette d'une grille de 800 albums
   * seraient du bruit. Deux exceptions, et elles ne sont pas cosmétiques :
   *
   *  - le cœur ACTIF reste visible, sinon on ne peut plus lire quels albums
   *    sont en favori sans les survoler un par un ;
   *  - sans survol possible — tactile —, tout reste visible. C'est l'iPad qui
   *    paierait le plus cher une affordance pensée à la souris, exactement ce
   *    que `HeartButton` avait déjà eu à corriger.
   */
  import { t } from '../../lib/i18n';
  import {
    favoriteTrackIds,
    favoriteAlbumIds,
    favoriteArtistIds,
    favoritePlaylistIds,
    favoriteCollectionIds,
    favoriteSmartCollectionIds,
    favoriteSmartPlaylistIds,
  } from '../../lib/stores/profile';
  import { basculerFavoriLocal, estFavoriLocal, type RefLocale } from '../../lib/favorisLocaux';
  import { portail } from '../../lib/portail';
  import { styleMenuAncre, LARGEUR_MENU } from '../../lib/ancrageMenu';
  import type { Snippet } from 'svelte';
  import type { CibleEtiquette } from '../../lib/cibleEtiquette';
  import type { EntreePochette } from '../../lib/actionsPochette';

  interface Props {
    /** La pochette : `AlbumArt`, `MosaiquePochettes`, ce que l'appelant veut. */
    children: Snippet;
    /** Objet favorisable. Laisser vide masque le cœur (collection, playlist). */
    favori?: RefLocale | null;
    /**
     * Cœur d'un objet dont le favori NE vit PAS dans `favorites`.
     *
     * Une radio en est un : son favori est une colonne de sa propre table,
     * basculée par `PUT /radios/{id}`. Elle avait donc son cœur à elle —
     * rond, en haut à droite, d'une autre couleur — et deux cœurs différents
     * dans la même interface se lisent comme deux choses différentes.
     * Bertrand, 02/09/2026 : « harmonise avec celui des covers ».
     *
     * On partage l'APPARENCE et la position ; seule la bascule diffère.
     */
    favoriExterne?: { actif: boolean; basculer: () => void | Promise<void> } | null;
    /**
     * Cible des étiquettes. Absent = pas de bouton d'étiquettes.
     *
     * #1238 : un objet de la bibliothèque (`itemId`) OU de service
     * (`source` + `sourceId`, voir `lib/cibleEtiquette`).
     */
    etiquettes?: CibleEtiquette | null;
    /** Ouvre l'édition. Absent = pas de bouton d'édition. */
    onEditer?: (() => void) | null;
    /** Lance la lecture. Absent = pas de bouton central. */
    onLire?: (() => void) | null;
    /**
     * Ouvre le détail au clic sur la pochette elle-même.
     *
     * Rendu comme un bouton plein cadre SOUS les icônes. La vignette de
     * l'appelant ne peut plus être un `<button>` : cinq boutons imbriqués dans
     * un bouton, c'est du HTML invalide, et les navigateurs le défont.
     */
    onOuvrir?: (() => void) | null;
    /**
     * Entrées du menu d'actions (coin bas-gauche) — `entreesPochette()` les
     * rend, l'appelant ne les compose pas à la main.
     *
     * VIDE, le bouton est ABSENT. Pas grisé : voir la règle plus haut.
     *
     * `danger` teinte l'entrée : partager pose un jeton PUBLIC, ce n'est pas
     * un geste anodin qu'on veut au milieu des autres sans le dire.
     */
    menu?: EntreePochette[];
    /** Nom de l'objet, pour les libellés d'accessibilité. */
    nom?: string;
  }
  let {
    children,
    favori = null,
    favoriExterne = null,
    etiquettes = null,
    onEditer = null,
    onLire = null,
    onOuvrir = null,
    menu = [],
    nom = '',
  }: Props = $props();

  const montreCoeur = $derived(!!favori || !!favoriExterne);
  const estFavori = $derived(
    favoriExterne
      ? favoriExterne.actif
      : favori
      ? estFavoriLocal(
          favori,
          $favoriteTrackIds,
          $favoriteAlbumIds,
          $favoriteArtistIds,
          $favoritePlaylistIds,
          $favoriteCollectionIds,
          $favoriteSmartCollectionIds,
          $favoriteSmartPlaylistIds,
        )
      : false,
  );

  let bascule = $state(false);
  /**
   * Chaque geste s'ARRÊTE ici.
   *
   * La vignette entière est cliquable chez l'appelant — sans cela, cliquer le
   * cœur ouvrirait aussi l'album.
   */
  function seul(ev: MouseEvent, faire: () => void) {
    ev.stopPropagation();
    ev.preventDefault();
    faire();
  }

  async function basculerFavori() {
    if (bascule) return;
    bascule = true;
    if (favoriExterne) await favoriExterne.basculer();
    else await basculerFavoriLocal(favori!);
    bascule = false;
  }

  /** Panneau d'étiquettes, ouvert au clic sur le bouton du bas-droit. */
  let panneauOuvert = $state(false);
  /**
   * Menu d'actions : la boîte ÉCRAN du bouton qui l'a ouvert, ou `null` quand
   * il est fermé.
   *
   * Ce n'est pas un booléen : le menu vit à la racine du document, il ne sait
   * donc plus où était son bouton. `lib/ancrageMenu` a besoin de ces
   * coordonnées.
   */
  let ancre = $state<DOMRect | null>(null);
  const style = $derived(ancre ? styleMenuAncre(ancre, menu.length, window) : '');

  function ouvrirMenu(ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    const b = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    ancre = ancre ? null : b;
  }
  /** Le menu se referme : choix, clic ailleurs, Échap, et tout mouvement de la
   *  page — ancré à des coordonnées figées, il suivrait le bouton de loin. */
  function fermerMenu() {
    ancre = null;
  }
  function fermerEchap(e: KeyboardEvent) {
    if (e.key === 'Escape') fermerMenu();
  }
  function choisir(ev: MouseEvent, e: EntreePochette) {
    ev.stopPropagation();
    ev.preventDefault();
    fermerMenu();
    e.faire();
  }
</script>

<svelte:window onkeydown={fermerEchap} onresize={fermerMenu} />

<div class="pa">
  {@render children()}

  {#if onOuvrir}
    <button class="ouvrir" aria-label={nom || $t('common.open' as any)} onclick={(e) => seul(e, onOuvrir)}
    ></button>
  {/if}

  <div class="voile" aria-hidden="true"></div>

  {#if montreCoeur}
    <button
      class="coin tl"
      class:actif={estFavori}
      aria-pressed={estFavori}
      aria-label={estFavori ? $t('v2.cover.unfavorite' as any) : $t('v2.cover.favorite' as any)}
      title={estFavori ? $t('v2.cover.unfavorite' as any) : $t('v2.cover.favorite' as any)}
      onclick={(e) => seul(e, basculerFavori)}
    >
      {#if estFavori}
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      {/if}
    </button>
  {/if}

  {#if onEditer}
    <button
      class="coin tr"
      aria-label={$t('v2.cover.edit' as any)}
      title={$t('v2.cover.edit' as any)}
      onclick={(e) => seul(e, onEditer)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>
    </button>
  {/if}

  <!-- Menu d'actions. AUCUNE entrée, AUCUN bouton : « ce qui ne s'applique pas
       est absent, pas grisé ». Il était grisé sur huit écrans sur treize. -->
  {#if menu.length}
    <button
      class="coin bl"
      class:ouvert={!!ancre}
      aria-haspopup="menu"
      aria-expanded={!!ancre}
      aria-label={$t('v2.cover.more' as any)}
      title={$t('v2.cover.more' as any)}
      onclick={ouvrirMenu}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4"/><path d="M3 15v4a2 2 0 0 0 2 2h4"/></svg>
    </button>
  {/if}

  {#if etiquettes}
    <button
      class="coin br"
      class:ouvert={panneauOuvert}
      aria-expanded={panneauOuvert}
      aria-label={$t('v2.cover.tags' as any)}
      title={$t('v2.cover.tags' as any)}
      onclick={(e) => seul(e, () => (panneauOuvert = !panneauOuvert))}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/><circle cx="6.5" cy="6.5" r="1.2" fill="currentColor"/></svg>
    </button>
  {/if}

  {#if onLire}
    <button
      class="centre"
      aria-label={nom ? `${$t('common.play' as any)} — ${nom}` : $t('common.play' as any)}
      title={$t('common.play' as any)}
      onclick={(e) => seul(e, onLire)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 5.5v13l11-6.5z"/></svg>
    </button>
  {/if}
</div>

<!-- Le menu, PORTÉ à la racine du document. Le fond ferme au clic ET consomme
     l'événement : la vignette qu'il recouvre ouvre le détail au clic, refermer
     le menu ne doit pas l'ouvrir. -->
{#if ancre && menu.length}
  <div class="fond tune-v2" role="presentation" use:portail
    onclick={(e) => { e.stopPropagation(); e.preventDefault(); fermerMenu(); }}
    onwheel={fermerMenu}>
    <div class="menu" role="menu" style={style}>
      {#each menu as e, i (i)}
        <button role="menuitem" class:danger={e.danger} title={e.libelle}
          onclick={(ev) => choisir(ev, e)}>{e.libelle}</button>
      {/each}
    </div>
  </div>
{/if}

{#if panneauOuvert && etiquettes}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default
      cible={etiquettes}
      {nom}
      onClose={() => (panneauOuvert = false)}
    />
  {/await}
{/if}

<style>
  .pa {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    overflow: hidden;
  }
  /* Le voile assombrit la pochette sous les icônes : sur une pochette claire,
     une icône blanche sur fond translucide disparaît. */
  .voile {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.42) 0%,
      rgba(0, 0, 0, 0.12) 34%,
      rgba(0, 0, 0, 0.12) 66%,
      rgba(0, 0, 0, 0.42) 100%
    );
    opacity: 0;
    transition: opacity 0.14s ease;
    pointer-events: none;
  }

  /* Plein cadre, SOUS les icônes : c'est lui qui ouvre le détail quand on
     clique la pochette hors d'une icône. */
  .ouvrir {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }
  .ouvrir:focus-visible {
    outline: 2px solid var(--v2-acc1, #f97316);
    outline-offset: -2px;
  }

  .coin,
  .centre {
    position: absolute;
    z-index: 1;
    display: grid;
    place-items: center;
    border: 0;
    cursor: pointer;
    padding: 0;
    opacity: 0;
    /*
      La SORTIE est adoucie, l'ENTRÉE est immédiate (voir la règle de
      révélation plus bas, qui met la durée à zéro). Une apparition en fondu,
      même courte, se lit comme un temps de réponse : on croit que l'écran
      hésite. Une disparition instantanée, elle, fait sursauter.
    */
    transition: opacity 0.16s ease, transform 0.1s ease, background 0.1s ease;
    /*
      PAS de `will-change`. Il promeut une couche de composition par élément —
      cinq par vignette, plusieurs milliers sur une grille de 838 albums. Le
      remède coûterait plus cher que le mal qu'il prétend soigner.
    */
  }

  .coin {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    /*
      PAS de `backdrop-filter`.

      Il y en avait un — `blur(6px)` — et il coûtait quatre floutages par
      vignette. Sur une grille de plusieurs centaines d'albums, le navigateur
      compose autant de couches, et le survol devenait pâteux : Bertrand l'a
      senti immédiatement (02/09/2026). Un fond opaque à 82 % donne le même
      contraste pour rien.
    */
    background: rgba(18, 18, 20, 0.82);
    color: #fff;
  }
  .coin svg {
    width: 15px;
    height: 15px;
  }
  .tl { top: 8px; left: 8px; }
  .tr { top: 8px; right: 8px; }
  .bl { bottom: 8px; left: 8px; }
  .br { bottom: 8px; right: 8px; }

  .centre {
    top: 50%;
    left: 50%;
    width: 52px;
    height: 52px;
    margin: -26px 0 0 -26px;
    border-radius: 50%;
    /*
      La couleur PRIMAIRE du thème, pas le blanc de la maquette : demandé par
      Bertrand le 02/09/2026. `--v2-on-acc` va avec — chaque thème déclare la
      teinte lisible SUR son accent, et le triangle passerait sinon du noir sur
      un accent sombre au blanc sur un accent clair sans qu'on s'en aperçoive.
    */
    background: var(--v2-acc1);
    color: var(--v2-on-acc);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  }
  .centre svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
    /* Le triangle est optiquement décentré dans son carré : sans ce décalage
       il paraît collé au bord gauche du disque. */
    margin-left: 2px;
  }

  /* Révélation : le survol ou le CLAVIER. `focus-within` n'est pas un
     raffinement — sans lui, on peut tabuler jusqu'à un bouton invisible. */
  .pa:hover .coin,
  .pa:hover .centre,
  .pa:focus-within .coin,
  .pa:focus-within .centre,
  .pa:hover .voile,
  .pa:focus-within .voile {
    opacity: 1;
    /* Zéro à l'apparition : le geste doit être suivi, pas commenté. */
    transition-duration: 0s;
  }

  /* Le cœur ACTIF ne se cache pas : sans cela, on ne peut plus lire quels
     albums sont en favori sans les survoler un par un. */
  .coin.actif {
    opacity: 1;
    color: #ef4444;
  }
  /* Idem pour un panneau d'étiquettes ouvert : son bouton doit rester visible
     pendant qu'on s'en sert. */
  .coin.ouvert {
    opacity: 1;
  }

  .coin:hover:not(:disabled) {
    transform: scale(1.08);
    background: rgba(38, 38, 42, 0.92);
  }
  .centre:hover {
    transform: scale(1.08);
    background: var(--v2-acc2);
  }
  .coin:focus-visible,
  .centre:focus-visible {
    outline: 2px solid var(--v2-acc1, #f97316);
    outline-offset: 2px;
    opacity: 1;
  }

  /*
    Le menu est PORTÉ à la racine du document (`use:portail`), comme celui de
    `MenuPisteV2`. Ancré dans la pochette, il se faisait rogner : `.pa` porte
    `overflow: hidden` (c'est lui qui arrondit la pochette) et la carte de la
    Bibliothèque porte `content-visibility: auto`, donc `contain: layout style
    paint`, qui capture même un `position: fixed`.

    🔴 `position: fixed` est INDISPENSABLE ici : `styleMenuAncre` ne rend que
    `left`, `top`/`bottom` et `max-height`. En `absolute`, ces coordonnées se
    liraient contre le bloc conteneur et le panneau atterrirait n'importe où.
  */
  .fond { position: fixed; inset: 0; z-index: 900; }
  .menu {
    position: fixed;
    /* = LARGEUR_MENU de lib/ancrageMenu : ce module calcule `left` en retirant
       cette largeur du bord droit du bouton. Une autre valeur ici décalerait le
       panneau de la différence. */
    width: 208px;
    z-index: 901;
    /* `styleMenuAncre` pose un `max-height` égal à la place du côté choisi :
       sans défilement interne, une quinzaine de collections serait tronquée
       (`renesenses/tune-web-client#1575`, Lulu, fil 1928). */
    overflow-y: auto;
    padding: 5px;
    border-radius: 10px;
    background: var(--v2-surface);
    border: 1px solid var(--v2-line2);
    box-shadow: var(--v2-sh-menu);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .menu button {
    border: 0;
    background: transparent;
    color: var(--v2-txt);
    cursor: pointer;
    font: 500 12.5px var(--v2-sans);
    padding: 7px 10px;
    border-radius: 7px;
    text-align: left;
    /* Le panneau a une largeur FIXE : un nom de collection long doit se couper,
       pas déborder. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .menu button:hover { background: var(--v2-hover); }
  .menu button.danger { color: var(--v2-danger); }

  /*
    Sans survol possible — tactile —, on ne peut rien garder en réserve : tout
    reste visible. C'est l'iPad et le téléphone qui paieraient le plus cher une
    affordance pensée à la souris.
  */
  @media (hover: none) {
    .coin,
    .centre,
    .voile {
      opacity: 1;
    }
  }

  /* Les vignettes descendent jusqu'à 160 px dans les grilles : à cette taille
     les quatre coins et le disque central se chevauchent. */
  @media (max-width: 600px) {
    .coin { width: 24px; height: 24px; border-radius: 7px; }
    .coin svg { width: 13px; height: 13px; }
    .centre { width: 42px; height: 42px; margin: -21px 0 0 -21px; }
    .centre svg { width: 20px; height: 20px; }
  }
</style>
