<script lang="ts">
  /**
   * « Coffrets » — onglet de la Bibliothèque (GO de Bertrand du 25/09/2026 :
   * « ajoute une entrée Coffrets dans la barre supérieure »).
   *
   * Les coffrets RÉUNIS : ceux que le serveur a regroupés tout seul (disques
   * rangés un dossier par disque, « Titre, Disc 2 »), ceux composés à la main
   * depuis Métadonnées › Coffrets, et tout album rangé disque par disque.
   * La liste vient de `GET /library/coffrets` ; le clic ouvre la fiche
   * d'album habituelle (`onOuvrir`), celle qui affiche un en-tête par disque
   * depuis la v0.9.162. Rien n'est recréé ici : c'est une porte d'entrée.
   *
   * Même forme qu'`AjoutsRecentsV2` — sa propre source, la bascule
   * grille/liste câblée, son propre ascenseur (#1323).
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { EVT_COFFRET_DEFAIT } from '../../lib/coffretAuto';

  let { onOuvrir, vue = 'grid' }: { onOuvrir: (a: Album) => void; vue?: 'grid' | 'list' } = $props();

  let coffrets = $state<api.CoffretReuni[]>([]);
  /** `ancien` : un serveur sans la route (404). */
  let etat = $state<'attente' | 'charge' | 'ancien' | 'erreur'>('attente');

  async function charger() {
    try {
      const r = await api.getCoffrets();
      coffrets = r?.items ?? [];
      etat = 'charge';
    } catch (e) {
      coffrets = [];
      // Un serveur antérieur au lot des coffrets automatiques ne sert pas la
      // route : le DIRE, plutôt que d'annoncer une bibliothèque sans coffret.
      etat = (e as api.ApiError)?.status === 404 ? 'ancien' : 'erreur';
    }
  }
  $effect(() => { void charger(); });
  // Un coffret défait depuis sa fiche (ouverte PAR-DESSUS cette liste) n'en
  // fait plus partie : on recharge.
  $effect(() => {
    const recharger = () => { void charger(); };
    window.addEventListener(EVT_COFFRET_DEFAIT, recharger);
    return () => window.removeEventListener(EVT_COFFRET_DEFAIT, recharger);
  });

  function disques(c: api.CoffretReuni): string {
    return $tr('ingest.nDiscs' as any).replace('{n}', String(c.disc_count));
  }
</script>

<div class="coffrets">
  <div class="tete">
    <p class="regle">{$tr('library.boxSetsRule' as any)}</p>
    {#if etat === 'charge' && coffrets.length}
      <span class="compte">{coffrets.length}</span>
    {/if}
  </div>

  {#if etat === 'attente'}
    <div class="etat">{$tr('common.loading' as any)}</div>
  {:else if etat === 'ancien'}
    <div class="etat">{$tr('library.boxSetsUnsupported' as any)}</div>
  {:else if etat === 'erreur'}
    <div class="etat">{$tr('library.boxSetsLoadError' as any)}</div>
  {:else if !coffrets.length}
    <div class="etat">{$tr('library.noBoxSets' as any)}</div>
  {:else if vue === 'list'}
    <div class="liste">
      {#each coffrets as c (c.id)}
        <button class="ligne" data-coffret={c.id} onclick={() => onOuvrir(c)}>
          <span class="vign"><AlbumArt coverPath={c.cover_path ?? null} albumId={c.id ?? null} size={0} alt={c.title ?? ''} /></span>
          <span class="ltitre">{c.title ?? ''}</span>
          <span class="lartiste">{c.artist_name ?? ''}</span>
          <span class="ldisques">{disques(c)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="grille">
      {#each coffrets as c (c.id)}
        <button class="carte" data-coffret={c.id} onclick={() => onOuvrir(c)}>
          <AlbumArt coverPath={c.cover_path ?? null} albumId={c.id ?? null} size={0} alt={c.title ?? ''} />
          <span class="titre">{c.title ?? ''}</span>
          {#if c.artist_name}<span class="artiste">{c.artist_name}</span>{/if}
          <span class="disques">{disques(c)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Même ascenseur que `.recents` (#1323) : le corps de `LibraryV2` coupe ce
     qui dépasse, la vue porte donc le sien. */
  .coffrets{flex:1; min-width:0; min-height:0; overflow-y:auto; padding:4px 18px 40px 0}
  .coffrets::-webkit-scrollbar{width:9px}
  .coffrets::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .tete{display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-bottom:16px}
  .regle{margin:0; font-size:13px; color:var(--v2-txt2)}
  .compte{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .etat{padding:24px 0; color:var(--v2-txt3); font-size:13px}
  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:16px}
  .carte{display:flex; flex-direction:column; gap:6px; padding:0; border:0; background:transparent; text-align:left; cursor:pointer; color:inherit}
  .liste{display:flex; flex-direction:column; gap:1px}
  .ligne{display:grid; grid-template-columns:44px minmax(0,2fr) minmax(0,1.4fr) auto; align-items:center;
    gap:14px; width:100%; padding:6px 10px; border:0; border-radius:9px; background:transparent;
    color:var(--v2-txt2); cursor:pointer; text-align:left; transition:.12s}
  .ligne:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .vign{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .ltitre{min-width:0; font-size:13.5px; font-weight:600; color:var(--v2-txt);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lartiste{min-width:0; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ldisques, .disques{font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .titre{font-size:13px; color:var(--v2-txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .artiste{font-size:12px; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
</style>
