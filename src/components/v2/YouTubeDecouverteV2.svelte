<script lang="ts">
  /**
   * YouTube Music — Tendances et Ambiances, portées de l'ancien écran
   * Streaming, seul à les offrir. Onglet « Découvrir » de YouTube dans
   * `StreamingV2`.
   *
   * La lecture emploie les mêmes corps que le reste de l'écran : une piste par
   * `source` + `source_id`, une playlist par `streaming_playlist_id`.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import AlbumArt from '../partages/AlbumArt.svelte';

  type Onglet = 'charts' | 'moods';
  let onglet = $state<Onglet>('charts');
  let chargement = $state(false);
  let tendances = $state<Record<string, any[]>>({});
  let categories = $state<{ title: string; items: { title: string; params: string }[] }[]>([]);
  let ambiance = $state<{ title: string } | null>(null);
  let playlists = $state<{ title: string; playlistId: string; description: string; cover_path: string | null }[]>([]);

  async function chargerTendances() {
    chargement = true;
    try { tendances = (await api.getYouTubeCharts('FR')) ?? {}; } catch { tendances = {}; }
    chargement = false;
  }
  async function chargerAmbiances() {
    chargement = true;
    try { categories = (await api.getYouTubeMoods()) ?? []; } catch { categories = []; }
    chargement = false;
  }
  async function ouvrirAmbiance(item: { title: string; params: string }) {
    chargement = true;
    ambiance = { title: item.title };
    try { playlists = (await api.getYouTubeMoodPlaylists(item.params)) ?? []; } catch { playlists = []; }
    chargement = false;
  }
  $effect(() => {
    if (onglet === 'charts') void chargerTendances();
    else if (!categories.length) void chargerAmbiances();
  });

  function jouerPiste(p: any) {
    const zid = zoneRequise();
    const sid = p?.source_id ?? p?.id;
    if (zid == null || !sid) return;
    playAndSync(zid, { source: 'youtube' as any, source_id: String(sid) }).catch(signalerEchecLecture);
  }
  function jouerPlaylist(id: string) {
    const zid = zoneRequise();
    if (zid == null) return;
    playAndSync(zid, { streaming_playlist_id: id, source: 'youtube' as any }).catch(signalerEchecLecture);
  }

  const SECTIONS: [string, string][] = [
    ['trending', 'streaming.ytmTrending'],
    ['songs', 'streaming.ytmTopSongs'],
    ['videos', 'streaming.ytmTopVideos'],
  ];
</script>

<div class="ytm">
  <div class="onglets">
    <button class:on={onglet === 'charts'} onclick={() => (onglet = 'charts')}>{$t('streaming.ytmCharts' as any)}</button>
    <button class:on={onglet === 'moods'} onclick={() => { onglet = 'moods'; ambiance = null; playlists = []; }}>{$t('streaming.ytmMoods' as any)}</button>
  </div>

  {#if chargement}
    <div class="etat">{$t('common.loading' as any)}</div>
  {:else if onglet === 'charts'}
    {#each SECTIONS as [cle, titre] (cle)}
      {#if tendances[cle]?.length}
        <h3>{$t(titre as any)}</h3>
        <ol class="pistes">
          {#each tendances[cle] as p, i (i)}
            <li><button onclick={() => jouerPiste(p)}>
              <span class="n">{i + 1}</span>
              <span class="ti">{p.title}</span>
              <span class="ar">{p.artist_name ?? ''}</span>
            </button></li>
          {/each}
        </ol>
      {/if}
    {:else}
      <div class="etat">—</div>
    {/each}
  {:else if ambiance}
    <button class="retour" onclick={() => { ambiance = null; playlists = []; }}>← {ambiance.title}</button>
    <div class="grille">
      {#each playlists as pl (pl.playlistId)}
        <button class="carte" onclick={() => jouerPlaylist(pl.playlistId)} title={pl.description}>
          <AlbumArt coverPath={pl.cover_path} albumId={null} size={0} alt={pl.title} />
          <span class="ti">{pl.title}</span>
        </button>
      {/each}
    </div>
  {:else}
    {#each categories as c (c.title)}
      <h3>{c.title}</h3>
      <div class="puces">
        {#each c.items as it (it.params)}<button onclick={() => ouvrirAmbiance(it)}>{it.title}</button>{/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .ytm{padding:4px 0 24px}
  .onglets{display:flex; gap:6px; margin-bottom:14px}
  .onglets button,.puces button{padding:5px 11px; border-radius:999px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); font:12px var(--v2-sans); cursor:pointer}
  .onglets button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); border-color:transparent}
  h3{margin:16px 0 8px; font:600 11px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .etat{padding:20px 0; color:var(--v2-txt3); font-size:13px}
  .pistes{list-style:none; margin:0; padding:0}
  .pistes button{display:grid; grid-template-columns:28px minmax(0,1fr) minmax(0,.7fr); gap:10px; width:100%; padding:7px 8px;
    border:0; border-radius:8px; background:transparent; color:var(--v2-txt2); text-align:left; cursor:pointer; font-size:13px}
  .pistes button:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .n{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .ti,.ar{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ar{color:var(--v2-txt3)}
  .puces{display:flex; flex-wrap:wrap; gap:6px}
  .retour{border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:0 0 10px}
  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:16px}
  .carte{display:flex; flex-direction:column; gap:6px; padding:0; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer}
</style>
