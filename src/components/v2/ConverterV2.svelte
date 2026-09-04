<script lang="ts">
  /**
   * Convertisseur — nouveau client (direction Levente). Niveau Expert.
   *
   * Choisir des albums, un format, lancer, suivre, récupérer.
   *
   * CE QUE LE SERVEUR SAIT FAIRE N'EST PAS SUPPOSÉ (#1524) : flac/wav/opus
   * sont natifs, mp3/aac/alac dépendent d'outils externes livrés avec la
   * release. On interroge `/converter/capabilities` et on GRISE ce que ce
   * serveur-ci ne peut pas produire, au lieu de laisser choisir un format qui
   * échouera à l'exécution.
   */
  import * as api from '../../lib/api';
  import { albums } from '../../lib/stores/library';
  import { preferences } from '../../lib/stores/preferences';
  import { fold, formatNumber } from '../../lib/utils';
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  let caps = $state<api.ConverterCapabilities | null>(null);
  let presets = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let q = $state('');
  let picked = $state<Set<number>>(new Set());
  let presetId = $state<string | null>(null);

  let jobId = $state<string | null>(null);
  let job = $state<Awaited<ReturnType<typeof api.getConversionStatus>> | null>(null);
  let starting = $state(false);
  let downloadUrl = $state<string | null>(null);

  $effect(() => {
    Promise.allSettled([api.getConverterCapabilities(), api.getConverterPresets()])
      .then(([c, p]) => {
        if (c.status === 'fulfilled') caps = c.value;
        if (p.status === 'fulfilled') { presets = p.value ?? []; presetId = presets[0]?.id ?? null; }
        if (c.status === 'rejected' && p.status === 'rejected') error = $t('v2.conv.errUnavailable' as any);
      })
      .finally(() => { loading = false; });
  });

  const shown = $derived(
    $albums.filter((a) => !q || fold(a.title).includes(fold(q)) || fold(a.artist_name).includes(fold(q))).slice(0, 200)
  );
  const preset = $derived(presets.find((p) => p.id === presetId) ?? null);
  /** Un format que CE serveur ne peut pas produire : on le dit et on bloque. */
  const supported = $derived(!preset || caps?.formats?.[preset.format] !== false);

  function toggle(id: number | null) {
    if (id == null) return;
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    picked = next;
  }

  async function start() {
    if (!preset || !picked.size || starting) return;
    starting = true; error = null; downloadUrl = null;
    try {
      // Le serveur attend un tableau PLAT de sources, et des nombres pour
      // sample_rate/bit_depth — pas des chaînes (#1094/#1095).
      const sources = [...picked].map((album_id) => ({ album_id }));
      const rate = Number(preset.sample_rate);
      const depth = Number(preset.bit_depth);
      const res = await api.startConversion(
        sources, preset.format, preset.quality,
        Number.isFinite(rate) && rate > 0 ? rate : null,
        Number.isFinite(depth) && depth > 0 ? depth : null,
      );
      jobId = res.job_id;
      job = null;
    } catch (e: any) {
      error = e?.message ?? $t('v2.tool.errStart' as any);
    }
    starting = false;
  }

  // Suivi : uniquement tant que la tâche tourne.
  $effect(() => {
    const jid = jobId;
    if (!jid) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const s = await api.getConversionStatus(jid);
        job = s;
        if (s.state === 'converting') setTimeout(tick, 1200);
      } catch { /* la tâche a peut-être disparu */ }
    };
    tick();
    return () => { alive = false; };
  });

  async function download() {
    if (!jobId) return;
    try { downloadUrl = await api.downloadConversion(jobId); }
    catch { error = $t('v2.tool.errDownload' as any); }
  }
  async function cancel() {
    if (!jobId) return;
    try { await api.cancelConversion(jobId); } catch { /* déjà finie */ }
    jobId = null; job = null;
  }
</script>

<section class="v2-conv tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">{$t('v2.tool.eyebrow' as any)}</div>
      <h1>{$t('v2.conv.title' as any)}</h1>
    </div>
    {#if picked.size}<span class="cnt">{(picked.size > 1 ? $t('v2.tool.pickedMany' as any) : $t('v2.tool.pickedOne' as any)).replace('{count}', String(picked.size))}</span>{/if}
  </header>

  {#if error}<div class="err">{error}</div>{/if}

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else}
      <div class="fmt">
        <span class="cl">{$t('v2.tool.outputFormat' as any)}</span>
        <div class="chips">
          {#each presets as p (p.id)}
            {@const ok = caps?.formats?.[p.format] !== false}
            <button class:on={presetId === p.id} class:ko={!ok} disabled={!ok}
              title={ok ? `${p.format} · ${p.sample_rate} · ${p.bit_depth}` : $t('v2.conv.cannotProduce' as any).replace('{format}', p.format)}
              onclick={() => (presetId = p.id)}>
              {p.label}{#if !ok}<span class="x">{$t('v2.conv.unavailable' as any)}</span>{/if}
            </button>
          {/each}
        </div>
        {#if preset}
          <div class="pinfo">
            {preset.format?.toUpperCase()} · {preset.sample_rate} · {preset.bit_depth}
            {#if preset.estimated_size_per_min}<span>≈ {preset.estimated_size_per_min} / min</span>{/if}
          </div>
        {/if}
        {#if caps?.tools && (caps.tools.ffmpeg || caps.tools.lame)}
          <div class="tools">{$t('v2.conv.toolsFound' as any).replace('{list}', [caps.tools.ffmpeg && 'ffmpeg', caps.tools.lame && 'lame'].filter(Boolean).join(', '))}</div>
        {/if}
      </div>

      {#if jobId}
        <div class="job">
          <div class="jh">
            <h2>{$t('v2.conv.running' as any)}</h2>
            <button class="lnk danger" onclick={cancel}>{$t('v2.tool.cancel' as any)}</button>
          </div>
          {#if job}
            <div class="bar"><span style="width:{Math.min(100, Math.round(job.progress ?? 0))}%"></span></div>
            <div class="jl">
              {$t('v2.tool.count' as any).replace('{done}', formatNumber(job.converted ?? 0)).replace('{total}', formatNumber(job.total ?? 0))}
              {#if job.current_file}<em>{job.current_file}</em>{/if}
            </div>
            {#if job.state === 'done'}
              <div class="done">
                {$t('v2.tool.done' as any)}{#if job.download_size} — {job.download_size}{/if}
                {#if downloadUrl}
                  <a class="lnk" href={downloadUrl} download>{$t('v2.tool.saveFile' as any)}</a>
                {:else}
                  <button class="lnk" onclick={download}>{$t('v2.tool.prepareDownload' as any)}</button>
                {/if}
              </div>
            {:else if job.state === 'error'}
              <div class="jerr">{$t('v2.tool.failed' as any)}{#if job.error} — {job.error}{/if}</div>
            {/if}
          {:else}
            <div class="jl">{$t('v2.tool.jobStarting' as any)}</div>
          {/if}
        </div>
      {/if}

      <div class="pick">
        <div class="ph">
          <span class="cl">{$t('v2.conv.albumsToConvert' as any)}</span>
          <div class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input placeholder={$t('v2.tool.filter' as any)} bind:value={q} />
          </div>
          <button class="go" disabled={!picked.size || !preset || !supported || starting} onclick={start}>
            {starting ? $t('v2.tool.starting' as any) : $t('v2.conv.start' as any)}
          </button>
        </div>
        {#if !$albums.length}
          <div class="state">{$t('v2.tool.libraryEmpty' as any)}</div>
        {:else}
          <div class="grid">
            {#each shown as a (a.id)}
              <button class="card" class:sel={a.id != null && picked.has(a.id)} onclick={() => toggle(a.id)}>
                <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
                <span class="ct">{a.title}</span>
                <span class="ca">{a.artist_name ?? ''}</span>
                {#if a.id != null && picked.has(a.id)}
                  <span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>
                {/if}
              </button>
            {/each}
          </div>
          {#if $albums.length > shown.length}
            <div class="more">{$t('v2.tool.shownOf' as any).replace('{shown}', String(shown.length)).replace('{total}', formatNumber($albums.length))}</div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-conv{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:18px; padding:24px 30px 12px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .cnt{font:11.5px var(--v2-mono); color:var(--v2-acc-tint)}
  .err{margin:0 30px 10px; padding:10px 14px; border-radius:10px; font-size:12.5px;
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 0; color:var(--v2-txt3)}
  .cl{font:10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}

  .fmt{padding:4px 0 20px}
  .chips{display:flex; gap:7px; flex-wrap:wrap; padding:11px 0 0}
  .chips button{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill)}
  .chips button:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-acc2)}
  .chips button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .chips button.ko{opacity:.45; cursor:not-allowed}
  .chips .x{font:9px var(--v2-mono); color:var(--v2-danger)}
  .pinfo{margin-top:11px; font:11.5px var(--v2-mono); color:var(--v2-txt2); display:flex; gap:14px}
  .pinfo span{color:var(--v2-txt3)}
  .tools{margin-top:6px; font:10.5px var(--v2-mono); color:var(--v2-txt3)}

  .job{margin:4px 0 22px; padding:15px 18px; border-radius:13px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .jh{display:flex; align-items:center; justify-content:space-between; gap:14px}
  .jh h2{font-size:14px; font-weight:700}
  .bar{margin-top:12px; height:6px; border-radius:4px; background:var(--v2-line); overflow:hidden}
  .bar span{display:block; height:100%; border-radius:4px; background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2)); transition:width .4s}
  .jl{margin-top:8px; font:11.5px var(--v2-mono); color:var(--v2-txt2); display:flex; gap:12px; align-items:baseline}
  .jl em{font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:420px}
  .done{margin-top:12px; display:flex; align-items:center; gap:14px; font-size:12.5px; color:var(--v2-acc-tint)}
  .jerr{margin-top:10px; font-size:12.5px; color:var(--v2-danger)}

  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:7px 14px; font:600 12px var(--v2-sans); text-decoration:none; display:inline-block}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.danger:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}

  .ph{display:flex; align-items:center; gap:14px; padding:0 0 14px}
  .search{position:relative; display:flex; align-items:center; width:240px; margin-left:auto}
  .search svg{position:absolute; left:13px; width:15px; height:15px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:36px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:12.5px var(--v2-sans); padding:0 12px 0 36px; outline:none}
  .go{height:36px; padding:0 20px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 13px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.4; cursor:default}

  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(128px,1fr)); gap:16px}
  .card{position:relative; border:0; background:transparent; color:inherit; cursor:pointer; text-align:left;
    padding:0; display:flex; flex-direction:column}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.16s}
  .card.sel .cv{box-shadow:0 0 0 3px var(--v2-acc1)}
  .ct{margin-top:8px; font:600 12px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:10.5px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .tick{position:absolute; top:7px; right:7px; width:22px; height:22px; border-radius:50%; display:grid; place-items:center;
    color:var(--v2-on-acc); background:var(--v2-acc1)}
  .tick svg{width:12px; height:12px}
  .more{margin-top:14px; font:11px var(--v2-mono); color:var(--v2-txt3)}
</style>
