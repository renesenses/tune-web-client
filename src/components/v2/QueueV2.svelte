<script lang="ts">
  /**
   * File d'attente — nouveau client (direction Levente).
   *
   * Niveau Avancé. Densité :
   *   Avancé → ce qui joue, la suite, saut, retrait, vider.
   *   Expert → réordonnancement (monter/descendre) et ligne technique.
   *
   * La file est chargée ICI et rechargée à chaque changement de zone. Comme
   * pour les autres stores partagés, `fetchQueue()` vit dans App.svelte que
   * le mode `?v2` ne monte jamais : sans ce chargement l'écran resterait
   * vide en permanence, ce qui ressemble a une file vide alors que rien n'a
   * été demandé au serveur.
   *
   * Chaque action réécrit l'état depuis la RÉPONSE du serveur (rechargement)
   * plutôt que de deviner localement : sur une file partagée entre plusieurs
   * clients, un état devine diverge en quelques secondes.
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { queueTracks, queuePosition } from '../../lib/stores/queue';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration, getQualityTier } from '../../lib/utils';
  import type { Track } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function reload() {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    try {
      const qs = await api.getQueue(zid);
      queueTracks.set(qs.tracks ?? []);
      queuePosition.set(qs.position ?? 0);
      error = null;
    } catch {
      error = "File d'attente indisponible.";
    }
    loading = false;
  }
  // Se relance sur changement de zone : chaque zone a SA file.
  $effect(() => { void $currentZoneId; loading = true; reload(); });

  const tracks = $derived($queueTracks);
  const pos = $derived($queuePosition);
  const current = $derived(tracks[pos] ?? null);
  const upNext = $derived(tracks.slice(pos + 1));
  const remainingMs = $derived(upNext.reduce((s, t) => s + (t.duration_ms ?? 0), 0));

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try { await fn(); await reload(); }
    catch { error = 'Action impossible.'; }
    busy = false;
  }
  const jump = (i: number) => act(() => api.jumpInQueue($currentZoneId!, i));
  const remove = (i: number) => act(() => api.removeFromQueue($currentZoneId!, i));
  const move = (from: number, to: number) => act(() => api.moveInQueue($currentZoneId!, from, to));
  const clear = () => act(() => api.clearQueue($currentZoneId!));

  function tech(t: Track): string {
    if (getQualityTier(t) === 'dsd') return 'DSD';
    const r = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const d = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), r, d].filter(Boolean).join(' · ');
  }
</script>

<section class="v2-queue tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Zone courante</div>
      <h1>File d'attente</h1>
    </div>
    {#if tracks.length}
      <div class="meta">
        <span>{upNext.length} à suivre</span>
        {#if remainingMs}<span>{formatDuration(remainingMs)} restantes</span>{/if}
      </div>
      <button class="lnk danger" onclick={clear} disabled={busy}>{$tr('v2.queue.clear' as any)}</button>
    {/if}
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if loading}
      <div class="state">{$tr('v2.queue.loading' as any)}</div>
    {:else if $currentZoneId == null}
      <div class="state">{$tr('v2.queue.noZone' as any)}</div>
    {:else if !tracks.length}
      <div class="state">{$tr('v2.queue.empty' as any)}</div>
    {:else}
      {#if current}
        <section class="sec">
          <h2>En cours</h2>
          <div class="now">
            <span class="ncv"><AlbumArt coverPath={current.cover_path} albumId={current.album_id ?? null} size={0} alt={current.title} source={current.source} fallbackInitials={current.title?.slice(0,1)} /></span>
            <div class="nmeta">
              <div class="nt">{current.title}</div>
              <div class="na">{current.artist_name ?? ''}{current.album_title ? ' · ' + current.album_title : ''}</div>
              {#if showExpert && tech(current)}<div class="ntk">{tech(current)}</div>{/if}
            </div>
            <span class="ndur">{formatDuration(current.duration_ms ?? 0)}</span>
          </div>
        </section>
      {/if}

      <section class="sec">
        <h2>À suivre{#if !upNext.length}&nbsp;— rien{/if}</h2>
        <div class="list">
          {#each upNext as t, i (String(t.id ?? '') + '@' + (pos + 1 + i))}
            {@const idx = pos + 1 + i}
            <div class="row" class:np={t.id != null && t.id === $currentTrackId}>
              <button class="play" onclick={() => jump(idx)} disabled={busy} aria-label={`Lire ${t.title}`}>
                <span class="n">{i + 1}</span>
                <span class="cv"><AlbumArt coverPath={t.cover_path} albumId={t.album_id ?? null} size={0} alt={t.title} source={t.source} fallbackInitials={t.title?.slice(0,1)} /></span>
                <span class="ti">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
              </button>
              {#if showExpert && tech(t)}<span class="tk">{tech(t)}</span>{/if}
              <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
              {#if showExpert}
                <span class="ord">
                  <button onclick={() => move(idx, idx - 1)} disabled={busy || idx <= pos + 1} aria-label="Monter">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 15l6-6 6 6"/></svg>
                  </button>
                  <button onclick={() => move(idx, idx + 1)} disabled={busy || i === upNext.length - 1} aria-label="Descendre">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                </span>
              {/if}
              <button class="del" onclick={() => remove(idx)} disabled={busy} aria-label={$tr('v2.queue.remove' as any)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</section>

<style>
  .v2-queue{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:20px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .meta{display:flex; gap:16px; margin-left:auto; font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk.danger:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .lnk:disabled{opacity:.45; cursor:default}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)}
  .sec{padding:6px 30px 20px}
  .sec h2{font-size:16px; font-weight:700; padding-bottom:12px}

  .now{display:flex; align-items:center; gap:18px; padding:14px 16px; border-radius:14px;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .ncv{width:72px; height:72px; flex:0 0 auto; border-radius:8px; overflow:hidden; box-shadow:var(--v2-sh-card)}
  .nmeta{min-width:0; flex:1}
  .nt{font-size:16px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .na{margin-top:3px; font-size:13px; color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ntk{margin-top:4px; font:10px var(--v2-mono); color:var(--v2-acc2)}
  .ndur{font:12px var(--v2-mono); color:var(--v2-txt3); flex:0 0 auto}

  .list{display:flex; flex-direction:column; gap:1px}
  .row{display:grid; grid-template-columns:1fr auto auto auto auto; align-items:center; gap:12px;
    padding:0 8px; border-radius:9px; color:var(--v2-txt2)}
  .row:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .row.np{color:var(--v2-acc1)}
  .play{display:grid; grid-template-columns:26px 40px 1fr; align-items:center; gap:12px; min-width:0;
    border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; padding:7px 0; font-family:inherit}
  .play:disabled{cursor:default}
  .row .n{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .row .cv{width:40px; height:40px; border-radius:6px; overflow:hidden}
  .row .ti{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .row .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .row .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .row .dur{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .ord{display:flex; gap:2px}
  .ord button, .del{width:26px; height:26px; border-radius:7px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .ord button:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2)}
  .ord button:disabled{opacity:.25; cursor:default}
  .ord svg{width:13px; height:13px}
  .del:hover:not(:disabled){color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .del svg{width:12px; height:12px}
</style>
