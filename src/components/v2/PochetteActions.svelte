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
   * | bas gauche | menu d'actions — **inerte**, la modale reste à définir |
   * | bas droite | étiquettes : voir, ajouter, retirer |
   * | centre | lecture |
   *
   * Les positions viennent de la MAQUETTE, pas de l'énoncé : les deux
   * divergeaient sur l'emplacement de l'édition et des étiquettes, et Bertrand
   * a tranché pour la maquette (« je modifierai si nécessaire »).
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
   * Seul le menu d'actions fait exception — il est présent et inerte, parce que
   * Bertrand l'a demandé ainsi en attendant la modale de Levente.
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
  } from '../../lib/stores/profile';
  import { basculerFavoriLocal, estFavoriLocal, type RefLocale } from '../../lib/favorisLocaux';
  import type { Snippet } from 'svelte';

  interface Props {
    /** La pochette : `AlbumArt`, `MosaiquePochettes`, ce que l'appelant veut. */
    children: Snippet;
    /** Objet favorisable. Laisser vide masque le cœur (collection, playlist). */
    favori?: RefLocale | null;
    /** Cible des étiquettes. Absent = pas de bouton d'étiquettes. */
    etiquettes?: { itemType: string; itemId: number } | null;
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
    /** Nom de l'objet, pour les libellés d'accessibilité. */
    nom?: string;
  }
  let {
    children,
    favori = null,
    etiquettes = null,
    onEditer = null,
    onLire = null,
    onOuvrir = null,
    nom = '',
  }: Props = $props();

  const estFavori = $derived(
    favori
      ? estFavoriLocal(
          favori,
          $favoriteTrackIds,
          $favoriteAlbumIds,
          $favoriteArtistIds,
          $favoritePlaylistIds,
          $favoriteCollectionIds,
          $favoriteSmartCollectionIds,
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
    await basculerFavoriLocal(favori!);
    bascule = false;
  }

  /** Panneau d'étiquettes, ouvert au clic sur le bouton du bas-droit. */
  let panneauOuvert = $state(false);
</script>

<div class="pa">
  {@render children()}

  {#if onOuvrir}
    <button class="ouvrir" aria-label={nom || $t('common.open' as any)} onclick={(e) => seul(e, onOuvrir)}
    ></button>
  {/if}

  <div class="voile" aria-hidden="true"></div>

  {#if favori}
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

  <!-- Menu d'actions : PRÉSENT et inerte, sur décision de Bertrand. La modale
       reste à définir par Levente. `disabled` plutôt qu'un clic sans effet —
       un bouton qui ne répond pas se lit comme une panne. -->
  <button
    class="coin bl"
    disabled
    aria-label={$t('v2.cover.moreSoon' as any)}
    title={$t('v2.cover.moreSoon' as any)}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4"/><path d="M3 15v4a2 2 0 0 0 2 2h4"/></svg>
  </button>

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

{#if panneauOuvert && etiquettes}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default
      itemType={etiquettes.itemType}
      itemId={etiquettes.itemId}
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

  /* Inerte : visible, mais il ne prétend rien. */
  .coin:disabled {
    cursor: default;
    color: rgba(255, 255, 255, 0.42);
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
