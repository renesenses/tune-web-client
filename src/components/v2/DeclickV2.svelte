<script lang="ts">
  /**
   * Dé-ploc — nouveau client (direction Levente). Niveau Expert.
   *
   * Nettoie les artefacts d'encodage (retard d'encodeur, bourrage, clics) et
   * ré-exporte en conteneur sans perte.
   *
   * ATTENTION AUX NOMS DE CHAMPS : l'API ressemble à celle du convertisseur
   * mais N'A PAS les mêmes clés — ici `status`/`completed`/`errors[]`, là-bas
   * `state`/`converted`/`error`. Mutualiser à l'aveugle aurait produit une
   * barre de progression figée à zéro.
   */
  import * as api from '../../lib/api';
  import type { DeclickOptions } from '../../lib/api';
  import { albums } from '../../lib/stores/library';
  import { fold, formatNumber } from '../../lib/utils';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  let q = $state('');
  let picked = $state<Set<number>>(new Set());
  let error = $state<string | null>(null);
  let starting = $state(false);

  // Défauts repris de l'outil actuel : seuil à -40 dB, rognage des deux
  // extrémités, coupe au passage par zéro (évite d'introduire un clic en
  // voulant en retirer un), sortie FLAC.
  let thresholdDb = $state(-40);
  let trimLead = $state(true);
  let trimTail = $state(true);
  let zeroCross = $state(true);
  let outputFormat = $state<'flac' | 'wav'>('flac');

  let jobId = $state<string | null>(null);
  let job = $state<Awaited<ReturnType<typeof api.getDeclickStatus>> | null>(null);
  let downloadUrl = $state<string | null>(null);

  const shown = $derived(
    $albums.filter((a) => !q || fold(a.title).includes(fold(q)) || fold(a.artist_name).includes(fold(q))).slice(0, 200)
  );

  function toggle(id: number | null) {
    if (id == null) return;
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    picked = next;
  }

  async function start() {
    if (!picked.size || starting) return;
    starting = true; error = null; downloadUrl = null;
    const options: DeclickOptions = {
      threshold_db: thresholdDb, trim_lead: trimLead, trim_tail: trimTail,
      zero_cross: zeroCross, output_format: outputFormat,
    };
    try {
      const res = await api.startDeclick([...picked].map((album_id) => ({ album_id })), options);
      jobId = res.job_id; job = null;
    } catch (e: any) {
      error = e?.message === 'premium_required' ? 'Outil réservé aux licences Premium.' : (e?.message ?? 'Lancement impossible.');
    }
    starting = false;
  }

  $effect(() => {
    const jid = jobId;
    if (!jid) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const s = await api.getDeclickStatus(jid);
        job = s;
        if (s.status === 'running') setTimeout(tick, 1200);
      } catch { /* tâche disparue */ }
    };
    tick();
    return () => { alive = false; };
  });

  const pct = $derived(job?.total ? Math.min(100, Math.round(((job.completed ?? 0) / job.total) * 100)) : 0);

  async function download() {
    if (!jobId) return;
    try { downloadUrl = await api.downloadDeclick(jobId); }
    catch { error = 'Récupération impossible.'; }
  }
  async function cancel() {
    if (!jobId) return;
    try { await api.cancelDeclick(jobId); } catch { /* déjà finie */ }
    jobId = null; job = null;
  }
</script>

<section class="v2-dec tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Outils</div>
      <h1>Dé-ploc</h1>
    </div>
    {#if picked.size}<span class="cnt">{picked.size} album{picked.size > 1 ? 's' : ''} choisi{picked.size > 1 ? 's' : ''}</span>{/if}
  </header>

  {#if error}<div class="err">{error}</div>{/if}

  <div class="scroll">
    <p class="lead">
      Retire les artefacts laissés par un encodage : retard d'encodeur, bourrage de fin,
      clics aux jointures. Le résultat est ré-exporté <b>sans perte</b> — les fichiers
      d'origine ne sont jamais modifiés.
    </p>

    <div class="opts">
      <div class="opt">
        <div class="ol"><span>Seuil de détection</span><span class="oh">Plus bas = plus sensible.</span></div>
        <div class="sl">
          <input type="range" min="-80" max="-10" step="1" bind:value={thresholdDb} />
          <span class="val">{thresholdDb} dB</span>
        </div>
      </div>
      <div class="opt">
        <div class="ol"><span>Rogner le début</span></div>
        <label class="sw"><input type="checkbox" bind:checked={trimLead} /><span class="slider"></span></label>
      </div>
      <div class="opt">
        <div class="ol"><span>Rogner la fin</span></div>
        <label class="sw"><input type="checkbox" bind:checked={trimTail} /><span class="slider"></span></label>
      </div>
      <div class="opt">
        <div class="ol">
          <span>Couper au passage par zéro</span>
          <span class="oh">Évite d'introduire un clic en voulant en retirer un.</span>
        </div>
        <label class="sw"><input type="checkbox" bind:checked={zeroCross} /><span class="slider"></span></label>
      </div>
      <div class="opt">
        <div class="ol"><span>Format de sortie</span></div>
        <div class="seg">
          <button class:on={outputFormat === 'flac'} onclick={() => (outputFormat = 'flac')}>FLAC</button>
          <button class:on={outputFormat === 'wav'} onclick={() => (outputFormat = 'wav')}>WAV</button>
        </div>
      </div>
    </div>

    {#if jobId}
      <div class="job">
        <div class="jh">
          <h2>Traitement en cours</h2>
          <button class="lnk danger" onclick={cancel}>Annuler</button>
        </div>
        {#if job}
          <div class="bar"><span style="width:{pct}%"></span></div>
          <div class="jl">
            {formatNumber(job.completed ?? 0)} sur {formatNumber(job.total ?? 0)}
            {#if job.current_file}<em>{job.current_file}</em>{/if}
          </div>
          {#if job.status === 'completed'}
            <div class="done">
              Terminé
              {#if downloadUrl}
                <a class="lnk" href={downloadUrl} download>Enregistrer le fichier</a>
              {:else}
                <button class="lnk" onclick={download}>Préparer le téléchargement</button>
              {/if}
            </div>
          {:else if job.status === 'failed'}
            <div class="jerr">Échec{#if job.errors?.length} — {job.errors[0]}{/if}</div>
          {:else if job.status === 'cancelled'}
            <div class="jl">Annulé.</div>
          {/if}
        {:else}
          <div class="jl">Démarrage…</div>
        {/if}
      </div>
    {/if}

    <div class="ph">
      <span class="cl">Albums à traiter</span>
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder="Filtrer" bind:value={q} />
      </div>
      <button class="go" disabled={!picked.size || starting} onclick={start}>{starting ? 'Lancement…' : 'Traiter'}</button>
    </div>

    {#if !$albums.length}
      <div class="state">Bibliothèque vide.</div>
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
    {/if}
  </div>
</section>

<style>
  .v2-dec{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
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
  .lead{font-size:13.5px; line-height:1.6; color:var(--v2-txt2); max-width:64ch; padding:2px 0 18px}
  .lead b{color:var(--v2-txt)}
  .cl{font:10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}

  .opts{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:4px 18px; margin-bottom:20px}
  .opt{display:flex; align-items:center; justify-content:space-between; gap:22px; padding:14px 0; border-bottom:1px solid var(--v2-line)}
  .opt:last-child{border-bottom:0}
  .ol{display:flex; flex-direction:column; gap:3px}
  .ol span:first-child{font-size:13.5px; font-weight:600}
  .oh{font-size:11.5px; color:var(--v2-txt3)}
  .sl{display:flex; align-items:center; gap:12px}
  .sl input{width:200px; accent-color:var(--v2-acc1)}
  .val{font:11.5px var(--v2-mono); color:var(--v2-txt2); width:52px; text-align:right}
  .seg{display:flex; gap:2px; padding:3px; border-radius:11px; background:var(--v2-bg); border:1px solid var(--v2-line)}
  .seg button{border:0; background:transparent; color:var(--v2-txt2); font:600 11.5px var(--v2-sans);
    padding:6px 14px; border-radius:8px; cursor:pointer}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw{position:relative; width:44px; height:25px; cursor:pointer; flex:0 0 auto}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}

  .job{margin:0 0 22px; padding:15px 18px; border-radius:13px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
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
</style>
