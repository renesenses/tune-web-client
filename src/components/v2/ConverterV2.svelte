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
  import { onDestroy } from 'svelte';
  import { activeView, vueDeRetour } from '../../lib/stores/navigation';
  import { ouvrirLeRepertoire } from '../../lib/stores/repertoireCible';
  import { dossierDeLAlbum } from '../../lib/dossierAlbum';
  import { conserverRetourConvertisseur, consommerRetourConvertisseur } from '../../lib/retourConvertisseur';
  import * as api from '../../lib/api';
  import { formatNombre } from '../../lib/formats';
  import { albums } from '../../lib/stores/library';
  import { preferences } from '../../lib/stores/preferences';
  import { fold } from '../../lib/utils';
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import QualityBadge from '../partages/QualityBadge.svelte';
  import '../../styles/tune-v2.css';

  const retour = consommerRetourConvertisseur('v2');
  let alive = true;
  onDestroy(() => { alive = false; });
  let locating = $state<number | null>(null);
  let caps = $state<api.ConverterCapabilities | null>(null);
  let presets = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let q = $state(retour?.q ?? '');
  let picked = $state<Set<number>>(new Set(retour?.picked ?? []));
  let presetId = $state<string | null>(retour?.presetId ?? null);

  let jobId = $state<string | null>(retour?.jobId ?? null);
  let job = $state<Awaited<ReturnType<typeof api.getConversionStatus>> | null>(retour?.job ?? null);
  let starting = $state(false);
  let downloadUrl = $state<string | null>(retour?.downloadUrl ?? null);

  $effect(() => {
    Promise.allSettled([api.getConverterCapabilities(), api.getConverterPresets()])
      .then(([c, p]) => {
        if (!alive) return;
        if (c.status === 'fulfilled') caps = c.value;
        if (p.status === 'fulfilled') {
          presets = p.value ?? [];
          presetId = presets.some(p => p.id === retour?.presetId) ? retour!.presetId : presets[0]?.id ?? null;
        }
        if (c.status === 'rejected' && p.status === 'rejected') error = $t('v2.conv.errUnavailable' as any);
      })
      .finally(() => { if (alive) loading = false; });
  });

  const shown = $derived(
    $albums.filter((a) => !q || fold(a.title).includes(fold(q)) || fold(a.artist_name).includes(fold(q))).slice(0, 200)
  );
  const preset = $derived(presets.find((p) => p.id === presetId) ?? null);
  /** Un format que CE serveur ne peut pas produire : on le dit et on bloque. */
  const supported = $derived(!preset || caps?.formats?.[preset.format] !== false);

  /**
   * 🔴 #1156 — LE DOSSIER D'ORIGINE des albums retenus.
   *
   * Tades, fil 1677 : « J'aurais aimé trouver une fonction "afficher dans le
   * dossier d'origine" afin de prendre une décision en connaissance de
   * cause. » Une page web ne peut pas ouvrir l'explorateur du serveur — et le
   * serveur n'est même pas toujours la machine de l'utilisateur. Ce qu'on peut
   * faire, et qui suffit à décider, c'est NOMMER le dossier.
   *
   * `Album` ne porte pas de chemin : `cover_path` est un hachage, mesuré sur
   * le .18. Le chemin vit sur la PISTE. On ne charge donc les pistes que des
   * albums RETENUS — pas des deux cents vignettes affichées — et on garde le
   * résultat : cocher puis décocher ne redemande rien au serveur.
   */
  // 🔴 `dossierAlbum` existait DÉJÀ sur `main` (`ab663b83`, « Localiser un
  // album sur le disque ») et sert la fiche album. J'en avais écrit un second,
  // `dossierDAlbum`, à une lettre du premier et avec les deux MÊMES noms de
  // fonctions exportées — un piège pour le prochain lecteur, et deux copies
  // qui divergeraient. Celui-ci prend les PISTES, pas des chemins nus, et
  // écarte en prime les pistes de service : il fait plus, et mieux.
  const dossierDeLAlbumSur = (ts: any[]) => dossierDeLAlbum(ts ?? []);
  let dossiers = $state<Map<number, string | null>>(new Map());
  let dossiersEnCours = new Set<number>();
  $effect(() => {
    for (const id of picked) {
      if (dossiers.has(id) || dossiersEnCours.has(id)) continue;
      dossiersEnCours.add(id);
      api.getAlbumTracks(id)
        .then((ts) => {
          // 🔴 Une nouvelle `Map` : muter celle du `$state` ne réveille rien.
          dossiers = new Map(dossiers).set(id, dossierDeLAlbumSur(ts));
        })
        .catch(() => { dossiers = new Map(dossiers).set(id, null); })
        .finally(() => dossiersEnCours.delete(id));
    }
  });
  /** Les dossiers connus des albums retenus, dédoublonnés : dix albums d'un
   *  même artiste tiennent souvent dans un seul dossier parent. */
  const dossiersRetenus = $derived(
    [...new Set([...picked].map((id) => dossiers.get(id)).filter((d): d is string => !!d))],
  );

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
        if (!alive) return;
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

  async function localiser(album: Album) {
    if (album.id == null || locating != null || starting) return;
    locating = album.id;
    try {
      const tracks = await api.getAlbumTracks(album.id);
      if (!alive || starting) return;
      const dossier = dossierDeLAlbum(tracks);
      if (!dossier) { error = $t('converter.folderUnavailable'); return; }
      conserverRetourConvertisseur('v2', {
        q, picked: [...picked], presetId, jobId, job, downloadUrl,
      });
      vueDeRetour.set('converter');
      ouvrirLeRepertoire(dossier);
      activeView.set('browse');
    } catch {
      if (alive) error = $t('converter.folderUnavailable');
    } finally {
      if (alive) locating = null;
    }
  }
</script>

<section class="v2-conv tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.tool.eyebrow' as any)}</div>
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
              {$t('v2.tool.count' as any).replace('{done}', $formatNombre(job.converted ?? 0)).replace('{total}', $formatNombre(job.total ?? 0))}
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
          <!-- Même champ que sur tous les autres écrans : `.v2-rech`. Il
               faisait 240 px de large et 36 px de haut ici, 230 × 38 sur les
               Extensions, 320 × 40 sur le Streaming — trois dessins pour un
               seul geste. -->
          <div class="v2-rech">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input placeholder={$t('v2.tool.filter' as any)} aria-label={$t('v2.tool.filter' as any)} bind:value={q} />
          </div>
          <button class="go" disabled={!picked.size || !preset || !supported || starting} onclick={start}>
            {starting ? $t('v2.tool.starting' as any) : $t('v2.conv.start' as any)}
          </button>
        </div>
        <!-- #1156 — d'où viennent les albums retenus. -->
        {#if dossiersRetenus.length}
          <div class="dossiers">
            <span class="dl">{$t('v2.conv.sourceFolder' as any)}</span>
            {#each dossiersRetenus as d (d)}<code class="dp" title={d}>{d}</code>{/each}
          </div>
        {/if}
        {#if !$albums.length}
          <div class="state">{$t('v2.tool.libraryEmpty' as any)}</div>
        {:else}
          <div class="grid">
            {#each shown as a (a.id)}
              <div class="album-source">
              <button class="card" class:sel={a.id != null && picked.has(a.id)} onclick={() => toggle(a.id)}>
                <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
                <span class="ct" title={a.title}>{a.title}</span>
                <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
                <!-- 🔴 Le format D'ORIGINE. Tades, 06/09/2026 (ticket 83, fil
                     1677) : « on me montre des albums qu'on me propose de
                     convertir. Difficile de savoir le format d'origine :
                     Alac ? » Un écran qui propose de convertir sans dire
                     DEPUIS QUOI demande une décision à l'aveugle.

                     La donnée était déjà là : `$albums` porte `format`,
                     `sample_rate` et `bit_depth` (`Album`, sérialisés par
                     `tune-core/src/db/models.rs`), et c'est ce même magasin
                     qui alimente la grille de la Bibliothèque, où le badge
                     est affiché depuis toujours. Rien à demander au serveur.

                     `QualityBadge` plutôt qu'un texte : c'est le badge que
                     l'utilisateur lit déjà partout ailleurs, et il ne dessine
                     RIEN quand il n'a pas de quoi — un album sans format ne
                     reçoit pas une case vide, il n'a pas de badge. -->
                <span class="cq"><QualityBadge format={a.format} sampleRate={a.sample_rate}
                  bitDepth={a.bit_depth} source={a.source} /></span>
                {#if a.id != null && picked.has(a.id)}
                  <span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>
                {/if}
              </button>
              <button class="lnk source-folder" disabled={starting || locating != null || a.id == null}
                onclick={() => localiser(a)}>{$t('v2.album.locate')}</button>
              </div>
            {/each}
          </div>
          {#if $albums.length > shown.length}
            <div class="more">{$t('v2.tool.shownOf' as any).replace('{shown}', String(shown.length)).replace('{total}', $formatNombre($albums.length))}</div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .album-source{min-width:0; display:flex; flex-direction:column; gap:7px}
  .album-source .card{width:100%; flex:1}
  .source-folder{align-self:flex-start}

  .v2-conv{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .cnt{font:11.5px var(--v2-mono); color:var(--v2-acc-tint)}
  /* #1156 — le dossier d'origine des albums retenus. */
  .dossiers{display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 10px;
    font-size:12px; color:var(--v2-txt2)}
  .dossiers .dl{font-weight:600; color:var(--v2-txt)}
  .dossiers .dp{font-family:var(--v2-mono); font-size:11.5px; padding:2px 8px;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .err{margin:0 30px 10px; padding:10px 14px; border-radius:10px; font-size:12.5px;
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 0; color:var(--v2-txt3)}
  .cl{font:10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  /* Le badge de qualité de la source, sous l'artiste. Une ligne vide quand
     l'album n'en a pas : le badge ne rend rien, la carte ne bouge pas. */
  .cq{display:block; margin-top:3px; min-height:16px}

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
