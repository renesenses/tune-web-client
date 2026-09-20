<script lang="ts">
  /**
   * L'EN-TÊTE D'UNE FICHE ARTISTE — le même pour la bibliothèque et pour un
   * service (#1356).
   *
   * Bertrand, 20/09/2026, deux captures à l'appui : « Je voudrais que la fiche
   * LibraryArtist soit semblable à StreamingArtist. »
   *
   * Les deux fiches montraient DÉJÀ le même contenu — `BioEtTitresPhares` est
   * monté par les deux depuis la page artiste commune
   * (renesenses/tune-server-rust#4330). C'est l'habillage qui divergeait :
   * `ArtisteServiceV2` posait un en-tête pleine largeur à portrait rond,
   * `ArtistesV2` un portrait carré de 84 px qui, rendu en frère direct de son
   * corps dans le `.body{display:flex}` de `LibraryV2`, devenait une COLONNE
   * de gauche et comprimait les titres phares dans la moitié restante.
   *
   * 🔴 POURQUOI UN COMPOSANT, ET PAS UN SECOND BLOC RECOPIÉ.
   *
   * C'est précisément ce que #4330 cherchait à éviter : deux habillages
   * concurrents divergent au premier correctif — on vient d'en payer le prix
   * pendant trois semaines. La forme ne se décide donc qu'ICI.
   *
   * Ce qui reste à l'appelant : ses ACTIONS, passées en extrait (`actions`).
   * Elles n'ont pas le même contenu des deux côtés et ne peuvent pas l'avoir
   * (voir la mesure action par action dans la PR de #1356) ; les passer en
   * propriétés aurait demandé une douzaine de drapeaux, ce qui serait pire que
   * le bloc recopié qu'on supprime. Un extrait est rendu dans la portée de
   * l'APPELANT : chaque fiche garde donc ses propres styles de pastille.
   */
  import type { Snippet } from 'svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { t } from '../../lib/i18n';

  interface Props {
    /** Le nom affiché. */
    nom: string;
    /**
     * La ligne sous le nom : d'où vient cette fiche — `QOBUZ` pour un artiste
     * de service, `BIBLIOTHÈQUE` pour un artiste local. Déjà en majuscules à
     * l'écran (`text-transform`), pas dans la traduction.
     */
    provenance?: string | null;
    /** Le portrait, s'il y en a un. */
    imagePath?: string | null;
    /** Le repli quand il n'y a pas de portrait. */
    initiales?: string;
    /**
     * Une ligne de plus sous la provenance — « 11 albums ». Elle n'existe que
     * côté bibliothèque : `/library/artists` le compte, un service non.
     */
    sousTitre?: string | null;
    onRetour: () => void;
    /** Les pastilles d'action de la fiche. */
    actions?: Snippet;
  }
  let {
    nom,
    provenance = null,
    imagePath = null,
    initiales = '',
    sousTitre = null,
    onRetour,
    actions,
  }: Props = $props();
</script>

<header class="tete">
  <button class="retour" onclick={onRetour} aria-label={$t('common.back' as any)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
  <div class="portrait">
    <AlbumArt coverPath={imagePath} albumId={null} size={0} alt={nom} fallbackInitials={initiales} />
  </div>
  <div class="ident">
    <h1>{nom}</h1>
    {#if provenance}<span class="prov">{provenance}</span>{/if}
    {#if sousTitre}<span class="cpt">{sousTitre}</span>{/if}
    {#if actions}
      <div class="gestes">{@render actions()}</div>
    {/if}
  </div>
</header>

<style>
  /* La forme exacte de `.tete` d'`ArtisteServiceV2`, déplacée ici. */
  .tete{display:flex; align-items:center; gap:18px; padding:18px 0 22px}
  .retour{width:34px; height:34px; border-radius:9px; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center; flex:none}
  .retour:hover{color:var(--v2-txt); border-color:var(--v2-txt3)}
  .retour svg{width:17px; height:17px}
  /*
    PORTRAIT ROND — arbitrage de Bertrand du 20/09/2026 (#1356), qui ne porte
    que sur l'EN-TÊTE DE FICHE.

    🔴 Il ne rouvre pas la décision du 03/09 sur la VIGNETTE DE GRILLE, qui
    reste carrée : ses trois mesures tiennent toujours là-bas — un cercle
    jetterait 21 % d'une image de service déjà carrée, et les quatre icônes de
    `PochetteActions` tomberaient dans le vide autour du disque. L'en-tête,
    lui, n'est enveloppé d'aucun `PochetteActions`, et c'est la forme qu'il
    portait déjà côté service.

    La forme se décide à DEUX endroits — ce rayon-ci, et le drapeau `round`
    d'`AlbumArt`, qui arrondit l'image elle-même. On garde le premier : le
    cadre est rond, l'image le remplit et déborde de ses coins.
  */
  .portrait{width:92px; height:92px; border-radius:50%; overflow:hidden; flex:none; background:var(--v2-line2)}
  .portrait :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .ident h1{margin:0; font:600 26px/1.15 var(--v2-sans)}
  /* 🔴 `.prov`, PAS `.svc` : `.svc` nommait les sections par service que la
     discographie commune a supprimées, et un garde de #4330 vérifie qu'il
     n'en reste aucune dans la fiche. Réemployer ce nom pour la provenance
     aurait fait rougir ce garde — et surtout brouillé ce qu'il mesure. */
  .prov{display:block; font:11px var(--v2-mono); color:var(--v2-txt3);
    text-transform:uppercase; letter-spacing:.06em}
  .cpt{display:block; font:11px var(--v2-mono); color:var(--v2-txt3); margin-top:3px}
  .gestes{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}
</style>
