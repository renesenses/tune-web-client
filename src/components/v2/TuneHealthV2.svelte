<script lang="ts">
  /**
   * Tune Health — nouveau client (direction Levente).
   *
   * Remplace « Diagnostics » (Bertrand, 27/08). Une seule question : les
   * traitements de fond de la bibliothèque avancent-ils, et où en sont-ils ?
   *
   * Cinq chantiers : analyse de la bibliothèque, analyse acoustique (CLAP),
   * ReplayGain, enrichissement des métadonnées, pochettes d'artistes.
   *
   * RÈGLE DE L'ÉCRAN : chaque carte dit ce qu'elle SAIT. Quand le serveur
   * n'expose pas d'avancement, la carte l'annonce au lieu d'afficher une
   * barre inventée. Une jauge fausse sur un écran de santé est pire que pas
   * de jauge du tout — c'est précisément ici qu'on vient chercher la vérité.
   *
   * Le rafraîchissement automatique ne tourne QUE tant qu'un traitement est
   * en cours : un écran de santé ne doit pas être lui-même une charge.
   */
  import * as api from '../../lib/api';
  import OutputModulesPanel from '../OutputModulesPanel.svelte';
  import { tableauFournisseurs, type TableauFournisseurs } from '../../lib/refusModuleSortie';
  import { formatNombre } from '../../lib/formats';
  import { activeView } from '../../lib/stores/navigation';
  import { } from '../../lib/utils';
  import { heureSeule } from '../../lib/dates';
  import { t } from '../../lib/i18n';
  import '../../styles/tune-v2.css';

  type Card = {
    id: string;
    titre: string;
    sous: string;
    etat: 'inconnu' | 'idle' | 'running' | 'done' | 'off';
    ligne: string;
    fait?: number;
    total?: number;
    detail?: string;
    /** Le serveur n'expose pas d'avancement pour ce chantier. */
    sansJauge?: boolean;
  };

  let cards = $state<Card[]>([]);
  let loading = $state(true);
  let lastAt = $state<string | null>(null);
  let refreshing = $state(false);
  /** #2392 — l'instantané `output_providers` ; `null` = serveur antérieur à v0.9.115, pas de panneau. */
  let modulesSortie = $state<TableauFournisseurs | null>(null);

  const anyRunning = $derived(cards.some((c) => c.etat === 'running'));

  async function collect() {
    refreshing = true;
    const out: Card[] = [];

    // ── Analyse de la bibliothèque ────────────────────────────────────────
    const [scan, report, stats] = await Promise.allSettled([
      api.getScanStatus(), api.getScanReport(), api.getLibraryStats(),
    ]);
    const totalTracks = stats.status === 'fulfilled' ? (stats.value?.tracks ?? 0) : 0;
    if (scan.status === 'fulfilled') {
      const scanning = !!scan.value?.scanning;
      const r = report.status === 'fulfilled' ? report.value : null;
      const bits: string[] = [];
      const n = (k: string, v: number) => $t(k as any).replace('{n}', $formatNombre(v));
      if (r?.inserted != null) bits.push(n('v2.health.added', r.inserted));
      if (r?.updated != null) bits.push(n('v2.health.updated', r.updated));
      if (r?.skipped != null) bits.push(n('v2.health.skipped', r.skipped));
      const failures = (r?.failed_paths?.length ?? 0) + (r?.error_dirs?.length ?? 0);
      out.push({
        id: 'scan', titre: $t('v2.health.cardScan' as any),
        sous: $t('v2.health.cardScanSub' as any),
        etat: scanning ? 'running' : 'idle',
        ligne: scanning ? $t('v2.health.scanning' as any)
          : (bits.length ? $t('v2.health.lastPass' as any).replace('{d}', bits.join(', '))
             : $t('v2.health.noScan' as any)),
        detail: failures ? $t('v2.health.pathsFailed' as any).replace('{n}', String(failures)) : undefined,
        sansJauge: true,   // le serveur signale « en cours », pas un pourcentage
      });
    } else {
      out.push({ id: 'scan', titre: $t('v2.health.cardScan' as any), sous: $t('v2.health.cardScanSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any), sansJauge: true });
    }

    // ── Analyse acoustique (CLAP) ─────────────────────────────────────────
    const ac = await Promise.allSettled([api.getAcousticStatus()]);
    if (ac[0].status === 'fulfilled') {
      const s = ac[0].value;
      const done = s?.analysed_tracks ?? 0;
      if (!s?.available) {
        out.push({ id: 'clap', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
          etat: 'off', ligne: $t('v2.health.clapAbsent' as any) });
      } else if (!s.enabled) {
        out.push({ id: 'clap', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
          etat: 'off', ligne: $t('v2.health.clapDisabled' as any),
          detail: $t('v2.health.clapAnalysed' as any).replace('{n}', $formatNombre(done)) });
      } else {
        out.push({
          id: 'clap', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
          etat: totalTracks && done >= totalTracks ? 'done' : done > 0 ? 'running' : 'idle',
          ligne: totalTracks
            ? $t('v2.health.clapProgress' as any).replace('{n}', $formatNombre(done)).replace('{t}', $formatNombre(totalTracks))
            : $t('v2.health.clapDone' as any).replace('{n}', $formatNombre(done)),
          fait: done, total: totalTracks || undefined });
      }
    } else {
      out.push({ id: 'clap', titre: $t('v2.health.cardClap' as any), sous: $t('v2.health.cardClapSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any) });
    }

    // ── ReplayGain ────────────────────────────────────────────────────────
    // Aucune route d'avancement n'est exposée côté client : on montre la
    // CONFIGURATION réelle et on le dit, plutôt qu'une jauge inventée.
    const cfg = await Promise.allSettled([api.getConfig()]);
    if (cfg[0].status === 'fulfilled') {
      const c: any = cfg[0].value;
      const mode = c?.replaygain_mode ?? 'off';
      const analysis = c?.replaygain_analysis_enabled !== false && c?.replaygain_analysis_enabled !== 'false';
      const modeLabel = mode === 'off' ? $t('v2.health.rgOff' as any)
        : mode === 'track' ? $t('v2.health.rgTrack' as any) : $t('v2.health.rgAlbum' as any);
      out.push({
        id: 'rg', titre: 'ReplayGain', sous: $t('v2.health.cardRgSub' as any),
        etat: mode === 'off' ? 'off' : 'idle',
        ligne: $t('v2.health.rgLine' as any).replace('{m}', modeLabel)
          .replace('{s}', analysis ? $t('v2.health.rgSourceBoth' as any) : $t('v2.health.rgSourceTags' as any)),
        detail: $t('v2.health.rgNoProgress' as any),
        sansJauge: true });
    } else {
      out.push({ id: 'rg', titre: 'ReplayGain', sous: $t('v2.health.cardRgSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any), sansJauge: true });
    }

    // ── Enrichissement des métadonnées ────────────────────────────────────
    const en = await Promise.allSettled([api.getBatchEnrichStatus()]);
    if (en[0].status === 'fulfilled') {
      const s = en[0].value;
      const done = s?.enriched ?? 0, total = s?.total ?? 0;
      out.push({
        id: 'enrich', titre: $t('v2.health.cardEnrich' as any), sous: $t('v2.health.cardEnrichSub' as any),
        etat: s?.status === 'running' ? 'running' : s?.status === 'done' ? 'done' : 'idle',
        ligne: total
          ? $t('v2.health.enrichProgress' as any).replace('{n}', $formatNombre(done)).replace('{t}', $formatNombre(total))
          : $t('v2.health.enrichDone' as any).replace('{n}', $formatNombre(done)),
        fait: done, total: total || undefined,
        detail: s?.errors ? $t('v2.health.enrichErrors' as any).replace('{n}', $formatNombre(s.errors)) : undefined });
    } else {
      out.push({ id: 'enrich', titre: $t('v2.health.cardEnrich' as any), sous: $t('v2.health.cardEnrichSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any) });
    }

    // ── Pochettes d'artistes ──────────────────────────────────────────────
    const ar = await Promise.allSettled([api.enrichArtistImagesStatus()]);
    if (ar[0].status === 'fulfilled') {
      const s = ar[0].value;
      const r = s?.result;
      const manquantes = s?.artists_without_image ?? 0;
      out.push({
        id: 'covers', titre: $t('v2.health.cardCovers' as any), sous: $t('v2.health.cardCoversSub' as any),
        etat: r?.phase && r.phase !== 'done' ? 'running' : r ? 'done' : 'idle',
        ligne: r?.total
          ? $t('v2.health.coversLine' as any).replace('{n}', $formatNombre(r.processed ?? 0))
              .replace('{t}', $formatNombre(r.total)).replace('{f}', $formatNombre(r.enriched ?? 0))
          : $t('v2.health.coversNone' as any),
        fait: r?.processed, total: r?.total,
        detail: manquantes ? $t('v2.health.coversMissing' as any).replace('{n}', $formatNombre(manquantes)) : undefined });
    } else {
      out.push({ id: 'covers', titre: $t('v2.health.cardCovers' as any), sous: $t('v2.health.cardCoversSub' as any),
        etat: 'inconnu', ligne: $t('v2.health.unavailable' as any) });
    }

    // ── Modules de sortie (#2392) ─────────────────────────────────────────
    // Un seul appel, celui de Diagnostics ; un serveur qui n'envoie pas
    // `output_providers` ne fait apparaître aucun panneau.
    const diag = await Promise.allSettled([api.getServerDiagnostics()]);
    modulesSortie = diag[0].status === 'fulfilled'
      ? tableauFournisseurs(diag[0].value?.output_providers)
      : null;

    cards = out;
    lastAt = $heureSeule(new Date());
    loading = false;
    refreshing = false;
  }

  $effect(() => { collect(); });

  // Sondage UNIQUEMENT tant qu'un traitement tourne : un écran de santé qui
  // interroge le serveur en boucle alors que rien ne bouge est lui-même un
  // problème de santé.
  $effect(() => {
    if (!anyRunning) return;
    const h = setInterval(() => { void collect(); }, 5000);
    return () => clearInterval(h);
  });

  const ETATS: Record<string, { txt: string; cls: string }> = $derived({
    running: { txt: $t('v2.health.stRunning' as any), cls: 'run' },
    done: { txt: $t('v2.health.stDone' as any), cls: 'ok' },
    idle: { txt: $t('v2.health.stIdle' as any), cls: 'idle' },
    off: { txt: $t('v2.health.stOff' as any), cls: 'off' },
    inconnu: { txt: $t('v2.health.stUnknown' as any), cls: 'unk' } });
  const pct = (c: Card) => (c.total && c.fait != null ? Math.min(100, Math.round((c.fait / c.total) * 100)) : null);
</script>

<section class="v2-health tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.health.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.processing' as any)}</h1>
    </div>
    <div class="v2-actions">
      <div class="meta">
        {#if lastAt}<span>{$t('v2.health.readAt' as any).replace('{h}', lastAt)}</span>{/if}
        {#if anyRunning}<span class="live">{$t('v2.health.autoFollow' as any)}</span>{/if}
      </div>
      <button class="v2-btn" onclick={() => collect()} disabled={refreshing}>
        {$t((refreshing ? 'v2.health.refreshing' : 'v2.health.refresh') as any)}
      </button>
    </div>
  </header>

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.health.loading' as any)}</div>
    {:else}
      <div class="cards">
        {#each cards as c (c.id)}
          {@const p = pct(c)}
          <article class="card {ETATS[c.etat].cls}">
            <div class="chead">
              <div>
                <h2>{c.titre}</h2>
                <div class="sub">{c.sous}</div>
              </div>
              <span class="badge {ETATS[c.etat].cls}">{ETATS[c.etat].txt}</span>
            </div>

            <div class="line">{c.ligne}</div>

            {#if p !== null}
              <div class="bar"><span style="width:{p}%"></span></div>
              <div class="pct">{p} %</div>
            {:else if c.sansJauge}
              <div class="nogauge">{$t('v2.health.noProgress' as any)}</div>
            {/if}

            {#if c.detail}<div class="detail">{c.detail}</div>{/if}
          </article>
        {/each}
      </div>

      {#if modulesSortie}
        <section class="modules">
          <h2>{$t('diagnostics.outputModules' as any)}</h2>
          <div class="sub">{$t('diagnostics.outputModulesHint' as any)}</div>
          <OutputModulesPanel tableau={modulesSortie} variante="v2" />
        </section>
      {/if}

      <p class="foot">
        {$t('v2.hint.processingFromSettings' as any)}
        <button class="lnk sm" onclick={() => activeView.set('settings')}>{$t('v2.eq.openSettings' as any)}</button>
      </p>
    {/if}
  </div>
</section>

<style>
  .v2-health{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .meta{display:flex; gap:14px; margin-left:auto; font:11px var(--v2-mono); color:var(--v2-txt3)}
  .meta .live{color:var(--v2-acc1)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.5; cursor:default}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}

  .cards{display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px}
  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:16px 18px 18px}
  .card.run{border-color:var(--v2-acc2)}
  .chead{display:flex; align-items:flex-start; justify-content:space-between; gap:14px}
  .chead h2{font-size:15px; font-weight:700}
  .sub{margin-top:3px; font-size:11.5px; color:var(--v2-txt3)}
  .badge{flex:0 0 auto; font:9.5px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase;
    padding:3px 9px; border-radius:999px; border:1px solid var(--v2-line2); color:var(--v2-txt3)}
  .badge.run{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .badge.ok{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}
  .badge.unk{color:var(--v2-danger); border-color:var(--v2-danger-bd)}

  .line{margin-top:13px; font-size:13px; color:var(--v2-txt2); line-height:1.5}
  .bar{margin-top:11px; height:6px; border-radius:4px; background:var(--v2-line); overflow:hidden}
  .bar span{display:block; height:100%; border-radius:4px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2)); transition:width .4s ease}
  .pct{margin-top:6px; font:10.5px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .nogauge{margin-top:11px; font:10.5px var(--v2-mono); color:var(--v2-txt3); font-style:italic}
  .detail{margin-top:9px; font-size:11.5px; color:var(--v2-txt3)}
  .foot{margin-top:22px; font-size:12.5px; color:var(--v2-txt3)}
  .modules{margin-top:22px; border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:16px 18px 18px}
  .modules h2{font-size:15px; font-weight:700}
  .modules .sub{margin-bottom:12px}
</style>
