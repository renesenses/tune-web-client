<!--
  tune-server-rust#8672 (go de Bertrand du 13/11/2026) — « Associer à un
  album » : un disque de Ma collection physique resté « nulle part » (aucun
  correspondant, ou plusieurs qu'on ne départage pas) s'associe à la main à
  un album de la bibliothèque.

  La recherche s'ouvre préremplie (premier artiste + titre, proposée par le
  serveur) ; pour « plusieurs correspondants », les candidats viennent en
  tête. Le lien est rangé par le serveur, prime sur le rapprochement
  automatique et survit aux synchronisations ; « Dissocier » le défait.

  Déplacée à la racine du document (`portail`), comme `RenommerModale` :
  ouverte depuis une carte, une surcouche `fixed` se ferait enfermer.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import {
    albumsAAssocier, associerALAlbum, messageErreurCollection, qualiteDe,
    type AlbumDeLaBibliotheque, type Disque,
  } from '../../lib/collectionPhysique';

  interface Props {
    disque: Disque;
    onClose: () => void;
    /** Le disque relu par le serveur, associé. */
    onAssocie: (d: Disque) => void;
  }
  let { disque, onClose, onAssocie }: Props = $props();

  let requete = $state('');
  let candidats = $state<AlbumDeLaBibliotheque[]>([]);
  let albums = $state<AlbumDeLaBibliotheque[]>([]);
  let cherche = $state(false);
  let enCours = $state(true);
  let travail = $state(false);
  let erreur = $state<unknown>(null);

  const traduire = (cle: string) => $t(cle as any) as string;

  async function lire(q: string | null) {
    enCours = true;
    erreur = null;
    try {
      const r = await albumsAAssocier(disque.release_id, q);
      if (q == null) requete = r.proposee;
      candidats = r.candidats;
      albums = r.albums;
      cherche = true;
    } catch (e) {
      erreur = e;
    } finally {
      enCours = false;
    }
  }

  function chercher(e: Event) {
    e.preventDefault();
    void lire(requete.trim());
  }

  async function choisir(a: AlbumDeLaBibliotheque) {
    if (travail) return;
    travail = true;
    erreur = null;
    try {
      const r = await associerALAlbum(disque.release_id, a.album_id);
      onAssocie(r.disque);
      onClose();
    } catch (e) {
      // On ne ferme pas : fermer sur un échec ferait croire à l'association.
      erreur = e;
    } finally {
      travail = false;
    }
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => { void lire(null); });
</script>

<svelte:window onkeydown={auClavier} />

{#snippet ligne(a: AlbumDeLaBibliotheque)}
  <li class="album" data-album-a-associer={a.album_id}>
    <span class="cv"><AlbumArt coverPath={a.cover_path ?? null} albumId={a.album_id} size={0} vignette
      alt={a.titre} fallbackInitials={a.titre?.slice(0, 1)} /></span>
    <span class="ti">
      <span class="tt" title={a.titre}>{a.titre}</span>
      <em title={a.artiste ?? ''}>{a.artiste ?? ''}{#if qualiteDe(a)} · {qualiteDe(a)}{/if}</em>
    </span>
    <button class="pri" onclick={() => void choisir(a)} disabled={travail} data-choisir-album={a.album_id}>
      {$t('collectionPhysique.associer.choisir' as any)}
    </button>
  </li>
{/snippet}

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events : le clic ne fait
       qu'empêcher la fermeture par le fond ; Échap ferme au clavier. -->
  <div class="panneau" role="dialog" aria-modal="true" tabindex="-1" aria-label={$t('collectionPhysique.associer.titre' as any)}
    onclick={(e) => e.stopPropagation()} data-associer-album={disque.release_id}>
    <h2>{$t('collectionPhysique.associer.titre' as any)}</h2>
    <p class="disque">{disque.artiste} — {disque.titre}</p>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    <form onsubmit={chercher}>
      <label>
        <span>{$t('collectionPhysique.associer.recherche' as any)}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={requete} autofocus data-recherche-bibliotheque />
      </label>
      <button type="submit" class="sec" disabled={enCours}>{$t('collectionPhysique.associer.chercher' as any)}</button>
    </form>

    {#if erreur}
      <p class="err" data-erreur-association>{messageErreurCollection(erreur, traduire)}</p>
    {/if}

    <div class="listes">
      {#if candidats.length}
        <h3>{$t('collectionPhysique.associer.candidats' as any)}</h3>
        <ul data-candidats>
          {#each candidats as a (a.album_id)}{@render ligne(a)}{/each}
        </ul>
      {/if}
      {#if enCours}
        <p class="q">{$t('collectionPhysique.recherche.enCours' as any)}</p>
      {:else if cherche}
        <h3>{$t('collectionPhysique.associer.resultats' as any)}</h3>
        {#if albums.length}
          <ul data-resultats>
            {#each albums as a (a.album_id)}{@render ligne(a)}{/each}
          </ul>
        {:else}
          <p class="q" data-aucun-resultat>{$t('collectionPhysique.associer.aucunResultat' as any)}</p>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center; background:rgba(0,0,0,.55); padding:20px}
  .panneau{position:relative; width:min(560px,100%); max-height:min(80vh,720px); display:flex; flex-direction:column;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card);
    padding:20px 22px 16px; font-family:var(--v2-sans)}
  h2{font-size:calc(17px * var(--v2-txt-echelle, 1)); font-weight:700; margin:0 32px 4px 0}
  h3{margin:12px 0 6px; font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em;
    text-transform:uppercase; color:var(--v2-txt3)}
  .disque{margin:0 0 12px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:calc(20px * var(--v2-txt-echelle, 1)); line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  form{display:flex; align-items:flex-end; gap:8px}
  label{flex:1; min-width:0}
  label span{display:block; margin-bottom:5px; font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono);
    letter-spacing:.06em; text-transform:uppercase; color:var(--v2-txt3)}
  input{width:100%; box-sizing:border-box; background:var(--v2-bg); border:1px solid var(--v2-line2); border-radius:8px;
    color:var(--v2-txt); font:inherit; font-size:calc(13.5px * var(--v2-txt-echelle, 1)); padding:8px 10px}
  input:focus{outline:2px solid var(--v2-acc1); outline-offset:-1px}
  .listes{overflow-y:auto; margin-top:4px}
  ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
  .album{display:grid; grid-template-columns:36px minmax(0,1fr) auto; align-items:center; gap:10px; padding:6px 4px; border-radius:8px}
  .album:hover{background:var(--v2-hover)}
  .cv{width:36px; height:36px; border-radius:5px; overflow:hidden}
  .ti{min-width:0; display:flex; flex-direction:column; gap:2px}
  .tt{font-size:calc(13px * var(--v2-txt-echelle, 1)); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); font-style:normal; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  button.pri, button.sec{border-radius:8px; font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:7px 12px; cursor:pointer}
  .sec{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2)}
  .pri{border:0; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .pri:disabled, .sec:disabled{opacity:.5; cursor:default}
  .q{margin:8px 0; font:calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .err{margin:8px 0 0; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-danger)}
</style>
