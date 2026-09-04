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
  import { formatNombre } from '../../lib/formats';
  import { activeView } from '../../lib/stores/navigation';
  import { } from '../../lib/utils';
  import { heureSeule } from '../../lib/dates';
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
      if (r?.inserted != null) bits.push(`${$formatNombre(r.inserted)} ajoutés`);
      if (r?.updated != null) bits.push(`${$formatNombre(r.updated)} mis à jour`);
      if (r?.skipped != null) bits.push(`${$formatNombre(r.skipped)} ignorés`);
      const failures = (r?.failed_paths?.length ?? 0) + (r?.error_dirs?.length ?? 0);
      out.push({
        id: 'scan', titre: 'Analyse de la bibliothèque',
        sous: 'Lecture des fichiers et des tags',
        etat: scanning ? 'running' : 'idle',
        ligne: scanning ? 'Analyse en cours…' : (bits.length ? `Dernière passe — ${bits.join(', ')}` : 'Aucune analyse enregistrée'),
        detail: failures ? `${failures} chemin${failures > 1 ? 's' : ''} en échec` : undefined,
        sansJauge: true,   // le serveur signale « en cours », pas un pourcentage
      });
    } else {
      out.push({ id: 'scan', titre: 'Analyse de la bibliothèque', sous: 'Lecture des fichiers et des tags',
        etat: 'inconnu', ligne: 'État indisponible', sansJauge: true });
    }

    // ── Analyse acoustique (CLAP) ─────────────────────────────────────────
    const ac = await Promise.allSettled([api.getAcousticStatus()]);
    if (ac[0].status === 'fulfilled') {
      const s = ac[0].value;
      const done = s?.analysed_tracks ?? 0;
      if (!s?.available) {
        out.push({ id: 'clap', titre: 'Analyse acoustique', sous: 'Recherche par ambiance (CLAP)',
          etat: 'off', ligne: "Ce serveur n'embarque pas la brique acoustique." });
      } else if (!s.enabled) {
        out.push({ id: 'clap', titre: 'Analyse acoustique', sous: 'Recherche par ambiance (CLAP)',
          etat: 'off', ligne: 'Désactivée sur ce serveur.', detail: `${$formatNombre(done)} titres déjà analysés` });
      } else {
        out.push({
          id: 'clap', titre: 'Analyse acoustique', sous: 'Recherche par ambiance (CLAP)',
          etat: totalTracks && done >= totalTracks ? 'done' : done > 0 ? 'running' : 'idle',
          ligne: totalTracks
            ? `${$formatNombre(done)} titres analysés sur ${$formatNombre(totalTracks)}`
            : `${$formatNombre(done)} titres analysés`,
          fait: done, total: totalTracks || undefined });
      }
    } else {
      out.push({ id: 'clap', titre: 'Analyse acoustique', sous: 'Recherche par ambiance (CLAP)',
        etat: 'inconnu', ligne: 'État indisponible' });
    }

    // ── ReplayGain ────────────────────────────────────────────────────────
    // Aucune route d'avancement n'est exposée côté client : on montre la
    // CONFIGURATION réelle et on le dit, plutôt qu'une jauge inventée.
    const cfg = await Promise.allSettled([api.getConfig()]);
    if (cfg[0].status === 'fulfilled') {
      const c: any = cfg[0].value;
      const mode = c?.replaygain_mode ?? 'off';
      const analysis = c?.replaygain_analysis_enabled !== false && c?.replaygain_analysis_enabled !== 'false';
      const modeLabel = mode === 'off' ? 'Désactivé' : mode === 'track' ? 'Par piste' : 'Par album';
      out.push({
        id: 'rg', titre: 'ReplayGain', sous: 'Normalisation du niveau',
        etat: mode === 'off' ? 'off' : 'idle',
        ligne: `${modeLabel} — source : ${analysis ? 'tags des fichiers + analyse' : 'tags des fichiers seuls'}`,
        detail: "Le serveur n'expose pas l'avancement du calcul.",
        sansJauge: true });
    } else {
      out.push({ id: 'rg', titre: 'ReplayGain', sous: 'Normalisation du niveau',
        etat: 'inconnu', ligne: 'État indisponible', sansJauge: true });
    }

    // ── Enrichissement des métadonnées ────────────────────────────────────
    const en = await Promise.allSettled([api.getBatchEnrichStatus()]);
    if (en[0].status === 'fulfilled') {
      const s = en[0].value;
      const done = s?.enriched ?? 0, total = s?.total ?? 0;
      out.push({
        id: 'enrich', titre: 'Enrichissement des métadonnées', sous: 'Complément depuis les bases publiques',
        etat: s?.status === 'running' ? 'running' : s?.status === 'done' ? 'done' : 'idle',
        ligne: total ? `${$formatNombre(done)} sur ${$formatNombre(total)}` : `${$formatNombre(done)} enrichis`,
        fait: done, total: total || undefined,
        detail: s?.errors ? `${$formatNombre(s.errors)} en échec` : undefined });
    } else {
      out.push({ id: 'enrich', titre: 'Enrichissement des métadonnées', sous: 'Complément depuis les bases publiques',
        etat: 'inconnu', ligne: 'État indisponible' });
    }

    // ── Pochettes d'artistes ──────────────────────────────────────────────
    const ar = await Promise.allSettled([api.enrichArtistImagesStatus()]);
    if (ar[0].status === 'fulfilled') {
      const s = ar[0].value;
      const r = s?.result;
      const manquantes = s?.artists_without_image ?? 0;
      out.push({
        id: 'covers', titre: "Pochettes d'artistes", sous: 'Recherche des portraits manquants',
        etat: r?.phase && r.phase !== 'done' ? 'running' : r ? 'done' : 'idle',
        ligne: r?.total
          ? `${$formatNombre(r.processed ?? 0)} traités sur ${$formatNombre(r.total)} — ${$formatNombre(r.enriched ?? 0)} trouvés`
          : 'Aucune passe enregistrée',
        fait: r?.processed, total: r?.total,
        detail: manquantes ? `${$formatNombre(manquantes)} artistes encore sans portrait` : undefined });
    } else {
      out.push({ id: 'covers', titre: "Pochettes d'artistes", sous: 'Recherche des portraits manquants',
        etat: 'inconnu', ligne: 'État indisponible' });
    }

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

  const ETATS: Record<string, { txt: string; cls: string }> = {
    running: { txt: 'en cours', cls: 'run' },
    done: { txt: 'terminé', cls: 'ok' },
    idle: { txt: 'au repos', cls: 'idle' },
    off: { txt: 'inactif', cls: 'off' },
    inconnu: { txt: 'inconnu', cls: 'unk' } };
  const pct = (c: Card) => (c.total && c.fait != null ? Math.min(100, Math.round((c.fait / c.total) * 100)) : null);
</script>

<section class="v2-health tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">État du serveur</div>
      <h1>Processing</h1>
    </div>
    <div class="meta">
      {#if lastAt}<span>relevé à {lastAt}</span>{/if}
      {#if anyRunning}<span class="live">suivi automatique</span>{/if}
    </div>
    <button class="lnk" onclick={() => collect()} disabled={refreshing}>
      {refreshing ? 'Relevé…' : 'Actualiser'}
    </button>
  </header>

  <div class="scroll">
    {#if loading}
      <div class="state">Relevé en cours…</div>
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
              <div class="nogauge">Pas d'avancement chiffré pour ce traitement.</div>
            {/if}

            {#if c.detail}<div class="detail">{c.detail}</div>{/if}
          </article>
        {/each}
      </div>

      <p class="foot">
        Les traitements se lancent depuis les Réglages — Bibliothèque et Métadonnées.
        <button class="lnk sm" onclick={() => activeView.set('settings')}>Ouvrir les réglages</button>
      </p>
    {/if}
  </div>
</section>

<style>
  .v2-health{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:18px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
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
</style>
