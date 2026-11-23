<script lang="ts">
  /**
   * L'onglet « Versions » de la fiche album — maquette de Levente (Figma
   * 611:5807, rc12), branché sur le regroupement de tune-server-rust#7617.
   *
   * Une ligne par version de l'œuvre : pochette, nom d'édition, label, et les
   * pastilles connues (année, canaux, format, résolution). Choisir une ligne
   * ouvre CETTE version dans la fiche, exactement comme le sélecteur d'avant ;
   * la version préférée garde son étoile et son bouton. Le numéro de
   * catalogue de la maquette n'est pas servi : il n'apparaît pas.
   */
  import { t as tr } from '../../lib/i18n';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import type { OeuvreAlbum } from '../../lib/oeuvres';
  import { pastillesVersion, titreVersion } from '../../lib/ficheAlbumMaquette';

  interface Props {
    oeuvre: OeuvreAlbum;
    /** La version affichée par la fiche. */
    courante: number | null;
    onChoisir: (id: number) => void;
    onPreferer: () => void;
  }
  let { oeuvre, courante, onChoisir, onPreferer }: Props = $props();
</script>

<ul class="versions-liste" data-versions={oeuvre.versions.length}>
  {#each oeuvre.versions as v (v.id)}
    {@const actuelle = v.id === courante}
    <li class="ligne" class:actuelle data-version={v.id}>
      <button type="button" class="ouvrir" aria-current={actuelle ? 'true' : undefined}
        onclick={() => onChoisir(v.id)} title={$tr('v2.album.fiche.openVersion' as any)}>
        <span class="pochette"><AlbumArt coverPath={v.cover_path ?? null} albumId={v.id} size={0} vignette alt={titreVersion(v)} fallbackInitials={v.title?.slice(0, 1)} /></span>
        <span class="texte">
          <span class="titre" title={titreVersion(v)}>{titreVersion(v)}{#if v.id === oeuvre.preferred_id}<span class="etoile" title={$tr('v2.album.preferredVersion' as any)}> ★</span>{/if}</span>
          {#if v.label}<span class="sous" title={v.label}>{v.label}</span>{/if}
        </span>
        <span class="pastilles">
          {#each pastillesVersion(v) as p (p)}<span class="pastille">{p}</span>{/each}
        </span>
      </button>
      {#if actuelle}
        {#if v.id === oeuvre.preferred_id}
          <span class="vpref">★ {$tr('v2.album.preferredVersion' as any)}</span>
        {:else}
          <button type="button" class="vchoix" data-preferer-version onclick={onPreferer}>{$tr('v2.album.setPreferredVersion' as any)}</button>
        {/if}
      {/if}
    </li>
  {/each}
</ul>

<style>
  .versions-liste{list-style:none; margin:0; padding:6px 0 20px; display:flex; flex-direction:column; gap:2px; font-family:var(--v2-sans)}
  .ligne{display:flex; align-items:center; gap:12px; padding:6px 10px; border-radius:8px; border-bottom:1px solid var(--v2-line)}
  .ligne:hover{background:var(--v2-hover)}
  .ligne.actuelle{background:var(--v2-active1)}
  .ouvrir{all:unset; flex:1 1 auto; min-width:0; display:flex; align-items:center; gap:14px; cursor:pointer}
  .ouvrir:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px; border-radius:6px}
  .pochette{width:56px; height:56px; flex:0 0 auto; border-radius:4px; overflow:hidden}
  .texte{flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:3px}
  .titre{font:600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .etoile{color:var(--v2-acc2)}
  .sous{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .pastilles{display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; flex:0 1 auto}
  .pastille{padding:3px 10px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); color:var(--v2-txt2);
    font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); white-space:nowrap}
  .vpref{flex:0 0 auto; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc2)}
  .vchoix{flex:0 0 auto; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc2); background:transparent;
    border:1px solid var(--v2-line2); border-radius:6px; padding:3px 8px; cursor:pointer}
  .vchoix:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  @media (max-width:640px){
    .ligne{flex-wrap:wrap}
    .ouvrir{flex-wrap:wrap}
    .pastilles{justify-content:flex-start; width:100%}
  }
</style>
