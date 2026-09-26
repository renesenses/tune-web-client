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
   * Il vient de `lib/actionsPochette` (quelles entrées) et de
   * `lib/gestesObjet` (comment chacune se fait), par `MenuObjetV2` — le MÊME
   * composant que les lignes de liste (menus d'objets, 26/09/2026). L'écran ne
   * passe plus un tableau : il passe l'OBJET (`objet`). La raison est celle de `lib/menuPiste` : une garde écrite contre
   * ce composant ne peut que lire son TEXTE, et un texte présent ne prouve pas
   * qu'il s'exécute. La liste sortie dans un module, la garde l'appelle et
   * regarde ce qui en sort. Et treize écrans qui construisent chacun son
   * tableau, ce sont treize vérités — le défaut que Dominique Comet avait relevé
   * sur le menu de piste (deux chemins vers la même chose, pas les mêmes
   * gestes).
   *
   * ## Le menu est PORTÉ à la racine du document (`MenuObjetV2`)
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
  import type { Snippet } from 'svelte';
  import type { CibleEtiquette } from '../../lib/cibleEtiquette';
  import type { GestesPochette } from '../../lib/actionsPochette';
  import { objetAUnMenu, type ObjetMenu } from '../../lib/gestesObjet';
  import MenuObjetV2 from './MenuObjetV2.svelte';

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
     * L'OBJET du menu d'actions (coin bas-gauche) — `lib/gestesObjet`
     * (`objetAlbum`, `objetPlaylist`…). Le menu en découle ; l'appelant ne
     * compose plus ses entrées.
     *
     * Absent, ou sans aucune entrée, le bouton est ABSENT. Pas grisé : voir la
     * règle plus haut.
     */
    objet?: ObjetMenu | null;
    /** Gestes propres à l'écran (retirer de la collection ouverte), ou le
     *  chemin d'« Ouvrir » dans son calque. Ils ne changent pas la liste. */
    gestesMenu?: GestesPochette;
    /** Relire l'écran après un geste qui change sa liste. */
    rafraichir?: () => void;
    /** L'objet est montré dans une collection MANUELLE ouverte. */
    dansCollectionManuelle?: boolean;
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
    objet = null,
    gestesMenu = {},
    rafraichir,
    dansCollectionManuelle = false,
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
   * Le menu d'actions — `MenuObjetV2`, sans bouton propre : c'est le coin
   * bas-gauche qui l'ouvre, aux coordonnées ÉCRAN de ce coin.
   */
  let menuObjet = $state<ReturnType<typeof MenuObjetV2> | null>(null);
  let menuOuvert = $state(false);
  /**
   * « Ouvrir » du menu = le clic sur la pochette : le même chemin (le calque de
   * l'écran), sauf si l'écran en donne un autre.
   */
  const gestesDuMenu = $derived<GestesPochette>(onOuvrir ? { ouvrir: onOuvrir, ...gestesMenu } : gestesMenu);
  /** Le bouton n'existe que si le menu a au moins une entrée — absent sinon. */
  const menuPresent = $derived(!!objet && objetAUnMenu(objet, gestesDuMenu));
  function ouvrirMenu(ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    menuObjet?.basculer((ev.currentTarget as HTMLElement).getBoundingClientRect());
  }
</script>

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
  {#if menuPresent}
    <button
      class="coin bl"
      class:ouvert={menuOuvert}
      aria-haspopup="menu"
      aria-expanded={menuOuvert}
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

<!-- Le menu : `MenuObjetV2`, porté à la racine du document par lui-même. -->
{#if objet}
  <MenuObjetV2 bind:this={menuObjet} {objet} gestes={gestesDuMenu} {rafraichir}
    {dansCollectionManuelle} bouton={false} {nom} surOuverture={(o) => (menuOuvert = o)} />
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
