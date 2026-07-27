<script lang="ts">
  // Assistant d'ajout de contenu : dossier récupéré → bibliothèque rangée.
  //
  // Quatre étapes, dans cet ordre pour qu'aucun fichier ne bouge avant que
  // l'utilisateur ait vu où il va atterrir :
  //   source      choisir le dossier (parcourir, coller un chemin, ou drop)
  //   album       vérifier/corriger ce que les tags racontent
  //   dest        choisir déplacer/copier et valider l'aperçu des chemins
  //   done        rapport, avec annulation en un clic
  import * as api from '../lib/api';
  import type {
    DroppedFile,
    IngestAnalysis,
    IngestConflictPolicy,
    IngestFileMode,
    IngestJob,
    IngestPlanResponse,
    IngestReleaseCandidate,
    IngestReleaseTracksResponse,
    IngestSettings,
    IngestTrackOverride,
  } from '../lib/api/ingest';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import FolderBrowser from './FolderBrowser.svelte';

  interface Props {
    /** Chemin de départ (dossier déjà connu côté serveur). */
    initialSource?: string | null;
    /** Fichiers lâchés dans la fenêtre : envoyés au staging avant analyse. */
    droppedFiles?: DroppedFile[] | null;
    onClose: () => void;
    /** Appelé après un import réussi, pour rafraîchir la bibliothèque. */
    onImported?: () => void;
  }
  let { initialSource = null, droppedFiles = null, onClose, onImported }: Props = $props();

  type Step = 'source' | 'album' | 'dest' | 'done';
  let step = $state<Step>('source');

  let settings = $state<IngestSettings | null>(null);
  let sourcePath = $state(initialSource ?? '');
  let analysis = $state<IngestAnalysis | null>(null);
  let planResp = $state<IngestPlanResponse | null>(null);
  let job = $state<IngestJob | null>(null);

  // Corrections utilisateur. Chaînes vides = « ne pas surcharger ».
  let ovArtist = $state('');
  let ovAlbum = $state('');
  let ovYear = $state<string>('');
  let ovGenre = $state('');

  let destRoot = $state('');
  let mode = $state<IngestFileMode>('move');
  let conflictPolicy = $state<IngestConflictPolicy>('skip');
  let template = $state('');
  let writeTags = $state(true);
  let showAdvanced = $state(false);

  let busy = $state(false);
  let identifying = $state(false);
  let error = $state<string | null>(null);
  let uploadPct = $state<number | null>(null);
  let showBrowser = $state(false);

  // -- Édition choisie sur MusicBrainz --
  let selectedReleaseId = $state<string | null>(null);
  let releaseTracks = $state<IngestReleaseTracksResponse | null>(null);
  let loadingRelease = $state(false);
  /** Appliquer le tracklisting de l'édition (titres, numéros, disques). */
  let applyTrackTitles = $state(true);

  const candidates = $derived(analysis?.musicbrainz_candidates ?? []);
  /** Les seules propositions à montrer : celles qui changent quelque chose. */
  const changedProposals = $derived(
    (releaseTracks?.proposals ?? []).filter(
      (p) =>
        p.matched &&
        (p.proposed_title !== p.current_title ||
          p.proposed_track_number !== p.current_track_number ||
          p.proposed_disc_number !== p.current_disc_number),
    ),
  );

  const overrides = () => ({
    album_artist: ovArtist.trim() || null,
    album: ovAlbum.trim() || null,
    year: ovYear.trim() ? Number(ovYear.trim()) : null,
    genre: ovGenre.trim() || null,
  });

  /**
   * Corrections par fichier issues de l'édition choisie. Vide si l'utilisateur
   * a décoché l'application du tracklisting — auquel cas seuls les champs
   * album partent.
   */
  const trackOverrides = (): IngestTrackOverride[] => {
    if (!applyTrackTitles || !releaseTracks) return [];
    return releaseTracks.proposals
      .filter((p) => p.matched)
      .map((p) => ({
        source_path: p.source_path,
        title: p.proposed_title,
        track_number: p.proposed_track_number,
        disc_number: p.proposed_disc_number,
      }));
  };

  const request = () => ({
    source_path: sourcePath,
    dest_root: destRoot || undefined,
    template: template.trim() || undefined,
    mode,
    conflict_policy: conflictPolicy,
    write_tags: writeTags,
    overrides: overrides(),
    track_overrides: trackOverrides(),
  });

  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  // -- Démarrage : réglages, puis upload éventuel, puis analyse --

  $effect(() => {
    void bootstrap();
  });

  let bootstrapped = false;
  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    try {
      const s = await api.getIngestSettings();
      settings = s;
      mode = s.mode;
      conflictPolicy = s.conflict_policy;
      writeTags = s.write_tags;
      template = s.template === s.default_template ? '' : s.template;
      destRoot = s.dest_root ?? s.effective_dest_root ?? '';
    } catch (e) {
      fail(e);
    }

    if (droppedFiles && droppedFiles.length > 0) {
      await uploadThenAnalyze(droppedFiles);
    } else if (initialSource) {
      await analyze();
    }
  }

  async function uploadThenAnalyze(files: DroppedFile[]) {
    busy = true;
    error = null;
    uploadPct = 0;
    try {
      const staged = await api.uploadIngestFiles(files, (f) => {
        uploadPct = Math.round(f * 100);
      });
      sourcePath = staged.source_path;
      uploadPct = null;
      await analyze();
    } catch (e) {
      fail(e);
      uploadPct = null;
    } finally {
      busy = false;
    }
  }

  async function analyze(identify = false) {
    if (!sourcePath.trim()) return;
    busy = true;
    error = null;
    try {
      const a = await api.analyzeIngest(sourcePath.trim(), identify);
      analysis = a;
      sourcePath = a.source_path;
      // Les champs de correction restent vides tant que l'utilisateur n'y
      // touche pas : le serveur retombe sur les tags lus. On ne préremplit
      // que ce qui manque, pour que le trou soit visible et comblable.
      if (!a.album.album_artist) ovArtist = ovArtist || '';
      step = 'album';
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  /** Demande la liste des éditions possibles. */
  async function identifyRelease() {
    if (!analysis) return;
    identifying = true;
    error = null;
    try {
      const a = await api.analyzeIngest(sourcePath, true);
      analysis = a;
      const found = a.musicbrainz_candidates.length;
      if (found === 0) {
        notifications.info($t('ingest.identifyNone'));
      } else {
        notifications.success($t('ingest.identifyFound').replace('{n}', String(found)));
      }
    } catch (e) {
      fail(e);
    } finally {
      identifying = false;
    }
  }

  /**
   * Choisit une édition : récupère son tracklisting et l'appariement proposé.
   * Les champs album sont remplis depuis l'édition, sans écraser ce que
   * l'utilisateur a déjà saisi.
   */
  async function chooseRelease(candidate: IngestReleaseCandidate) {
    if (selectedReleaseId === candidate.release_id) {
      // Re-cliquer sur l'édition retenue la désélectionne.
      selectedReleaseId = null;
      releaseTracks = null;
      return;
    }

    selectedReleaseId = candidate.release_id;
    releaseTracks = null;
    loadingRelease = true;
    error = null;
    try {
      if (!ovAlbum.trim()) ovAlbum = candidate.title;
      if (!ovArtist.trim() && candidate.artist) ovArtist = candidate.artist;
      if (!ovYear.trim() && candidate.year) ovYear = String(candidate.year);

      const res = await api.getIngestReleaseTracks(sourcePath, candidate.release_id);
      releaseTracks = res;
      // Ne proposer d'appliquer le tracklisting que s'il change quelque chose.
      applyTrackTitles = res.changed > 0;
    } catch (e) {
      fail(e);
      selectedReleaseId = null;
    } finally {
      loadingRelease = false;
    }
  }

  /** Résumé d'une édition en une ligne : ce qui la distingue des autres. */
  function candidateLine(c: IngestReleaseCandidate): string {
    const bits = [
      c.year ? String(c.year) : null,
      c.country,
      c.track_count != null ? $t('ingest.nTracks').replace('{n}', String(c.track_count)) : null,
      c.disc_count && c.disc_count > 1
        ? $t('ingest.nDiscs').replace('{n}', String(c.disc_count))
        : null,
      c.media_format,
      c.label,
      c.catalog_number,
    ].filter(Boolean);
    return bits.join(' · ');
  }

  async function preview() {
    busy = true;
    error = null;
    try {
      planResp = await api.planIngest(request());
      step = 'dest';
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  /** Recalcule l'aperçu quand un réglage de destination change. */
  async function refreshPreview() {
    if (step !== 'dest') return;
    try {
      planResp = await api.planIngest(request());
    } catch (e) {
      fail(e);
    }
  }

  let polling: ReturnType<typeof setInterval> | null = null;

  async function run() {
    busy = true;
    error = null;
    try {
      const { job_id } = await api.applyIngest(request());
      step = 'done';
      job = await api.getIngestJob(job_id);
      polling = setInterval(async () => {
        try {
          const j = await api.getIngestJob(job_id);
          job = j;
          if (j.status !== 'running') {
            stopPolling();
            if (j.status === 'done' || j.status === 'partial') onImported?.();
          }
        } catch {
          stopPolling();
        }
      }, 900);
    } catch (e) {
      fail(e);
      step = 'dest';
    } finally {
      busy = false;
    }
  }

  function stopPolling() {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  }

  $effect(() => () => stopPolling());

  async function undo() {
    if (!job) return;
    busy = true;
    error = null;
    try {
      const res = await api.undoIngestJob(job.id);
      notifications.success($t('ingest.undone').replace('{n}', String(res.reverted)));
      job = await api.getIngestJob(job.id);
      onImported?.();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  function pickFolder(path: string) {
    sourcePath = path;
    showBrowser = false;
    void analyze();
  }

  function humanBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ['kB', 'MB', 'GB', 'TB'];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
  }

  function warningLabel(code: string): string {
    const key = `ingest.warn.${code}`;
    const label = $t(key);
    // Clé absente : on montre le code brut plutôt qu'un libellé vide.
    return label === key ? code : label;
  }

  function conflictLabel(kind: string): string {
    return kind === 'duplicate_target'
      ? $t('ingest.conflict.duplicate')
      : $t('ingest.conflict.exists');
  }

  const stepIndex = $derived(['source', 'album', 'dest', 'done'].indexOf(step));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if showBrowser}
  <FolderBrowser onSelect={pickFolder} onClose={() => (showBrowser = false)} />
{/if}

<div
  class="wiz-backdrop"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  role="presentation"
>
  <div class="wiz" role="dialog" aria-label={$t('ingest.title')}>
    <header>
      <div>
        <h2>{$t('ingest.title')}</h2>
        <p class="subtitle">{$t('ingest.subtitle')}</p>
      </div>
      <button class="close" onclick={onClose} aria-label={$t('ingest.close')}>&times;</button>
    </header>

    <ol class="steps">
      {#each [$t('ingest.step.source'), $t('ingest.step.album'), $t('ingest.step.dest'), $t('ingest.step.done')] as label, i}
        <li class:active={i === stepIndex} class:past={i < stepIndex}>
          <span class="dot">{i + 1}</span>
          <span class="label">{label}</span>
        </li>
      {/each}
    </ol>

    {#if error}
      <div class="banner err">{error}</div>
    {/if}

    <div class="body">
      <!-- Étape 1 : source -->
      {#if step === 'source'}
        {#if uploadPct !== null}
          <div class="uploading">
            <p>{$t('ingest.uploading').replace('{n}', String(uploadPct))}</p>
            <div class="bar"><div class="fill" style="width: {uploadPct}%"></div></div>
          </div>
        {:else}
          <p class="hint">{$t('ingest.sourceHint')}</p>
          <div class="row">
            <input
              type="text"
              bind:value={sourcePath}
              placeholder={$t('ingest.sourcePlaceholder')}
              onkeydown={(e) => e.key === 'Enter' && analyze()}
            />
            <button class="ghost" onclick={() => (showBrowser = true)}>
              {$t('ingest.browse')}
            </button>
          </div>
          <div class="actions">
            <button class="primary" disabled={busy || !sourcePath.trim()} onclick={() => analyze()}>
              {busy ? $t('ingest.analyzing') : $t('ingest.analyze')}
            </button>
          </div>
          <p class="dropnote">{$t('ingest.dropNote')}</p>
        {/if}

        <!-- Étape 2 : album -->
      {:else if step === 'album' && analysis}
        <div class="summary">
          <div class="sum-main">
            <strong>{analysis.album.album ?? $t('ingest.unknownAlbum')}</strong>
            <span class="sep">—</span>
            <span>{analysis.album.album_artist ?? $t('ingest.unknownArtist')}</span>
            {#if analysis.album.year}<span class="muted">({analysis.album.year})</span>{/if}
          </div>
          <div class="sum-meta">
            {analysis.album.track_count}
            {$t('ingest.tracks')}
            {#if analysis.album.disc_count > 1}
              · {analysis.album.disc_count} {$t('ingest.discs')}
            {/if}
            · {analysis.album.formats.join(', ').toUpperCase()} · {humanBytes(
              analysis.album.total_bytes,
            )}
            {#if analysis.extras.length}
              · {analysis.extras.length} {$t('ingest.sidecars')}
            {/if}
          </div>
        </div>

        {#if analysis.already_in_library > 0}
          <div class="banner warn">
            {$t('ingest.alreadyInLibrary').replace(
              '{n}',
              String(analysis.already_in_library),
            )}
          </div>
        {/if}

        {#if analysis.album.warnings.length}
          <div class="chips">
            {#each analysis.album.warnings as w}
              <span class="chip">{warningLabel(w)}</span>
            {/each}
          </div>
        {/if}

        <div class="grid">
          <label>
            <span>{$t('ingest.albumArtist')}</span>
            <input
              type="text"
              bind:value={ovArtist}
              placeholder={analysis.album.album_artist ??
                (analysis.album.is_compilation
                  ? 'Various Artists'
                  : $t('ingest.unknownArtist'))}
            />
          </label>
          <label>
            <span>{$t('ingest.album')}</span>
            <input
              type="text"
              bind:value={ovAlbum}
              placeholder={analysis.album.album ?? $t('ingest.unknownAlbum')}
            />
          </label>
          <label>
            <span>{$t('ingest.year')}</span>
            <input
              type="number"
              bind:value={ovYear}
              placeholder={analysis.album.year ? String(analysis.album.year) : '—'}
            />
          </label>
          <label>
            <span>{$t('ingest.genre')}</span>
            <input type="text" bind:value={ovGenre} placeholder={analysis.album.genre ?? '—'} />
          </label>
        </div>

        <div class="mb-row">
          <button class="ghost" disabled={identifying} onclick={identifyRelease}>
            {identifying ? $t('ingest.identifying') : $t('ingest.identify')}
          </button>
          {#if candidates.length}
            <span class="muted small">
              {$t('ingest.pickEdition').replace('{n}', String(candidates.length))}
            </span>
          {/if}
        </div>

        {#if candidates.length}
          <ul class="editions">
            {#each candidates as c}
              <li>
                <button
                  class="edition"
                  class:sel={selectedReleaseId === c.release_id}
                  onclick={() => chooseRelease(c)}
                >
                  <span class="edition-main">
                    {c.title}
                    {#if c.disambiguation}
                      <em class="disamb">({c.disambiguation})</em>
                    {/if}
                  </span>
                  <span class="edition-meta">{candidateLine(c)}</span>
                </button>
              </li>
            {/each}
          </ul>

          {#if loadingRelease}
            <p class="muted small">{$t('ingest.loadingRelease')}</p>
          {:else if releaseTracks}
            <div class="release-box">
              {#if releaseTracks.changed === 0}
                <p class="muted small">{$t('ingest.releaseNoChange')}</p>
              {:else}
                <label class="check">
                  <input type="checkbox" bind:checked={applyTrackTitles} />
                  <span>
                    {$t('ingest.applyTrackTitles').replace(
                      '{n}',
                      String(releaseTracks.changed),
                    )}
                  </span>
                </label>
                <ul class="diff">
                  {#each changedProposals as p}
                    <li>
                      <span class="num">{p.proposed_track_number ?? '—'}</span>
                      <span class="was">
                        {p.current_title ?? p.source_path.split('/').pop()}
                      </span>
                      <span class="arrow">→</span>
                      <span class="now">{p.proposed_title}</span>
                      {#if p.method === 'order'}
                        <span class="badge">{$t('ingest.matchedByOrder')}</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if releaseTracks.unmatched > 0}
                <p class="muted small">
                  {$t('ingest.unmatchedFiles').replace(
                    '{n}',
                    String(releaseTracks.unmatched),
                  )}
                </p>
              {/if}
            </div>
          {/if}
        {/if}

        <details class="tracklist">
          <summary>{$t('ingest.showTracks').replace('{n}', String(analysis.tracks.length))}</summary>
          <ul>
            {#each analysis.tracks as tr}
              <li>
                <span class="num">{tr.track_number ?? '—'}</span>
                <span class="ti">{tr.title ?? tr.source_path.split('/').pop()}</span>
                <span class="muted">{(tr.format ?? tr.ext).toUpperCase()}</span>
              </li>
            {/each}
          </ul>
        </details>

        <div class="actions">
          <button class="ghost" onclick={() => (step = 'source')}>{$t('ingest.back')}</button>
          <button class="primary" disabled={busy} onclick={preview}>
            {busy ? $t('ingest.computing') : $t('ingest.next')}
          </button>
        </div>

        <!-- Étape 3 : destination + aperçu -->
      {:else if step === 'dest' && planResp}
        <div class="mode-block">
          <span class="mode-title">{$t('ingest.fileMode')}</span>
          <div class="mode-choice">
            <button
              class="mode"
              class:sel={mode === 'move'}
              onclick={() => {
                mode = 'move';
                void refreshPreview();
              }}
            >
              <strong>{$t('ingest.move')}</strong>
              <small>{$t('ingest.moveHint')}</small>
            </button>
            <button
              class="mode"
              class:sel={mode === 'copy'}
              onclick={() => {
                mode = 'copy';
                void refreshPreview();
              }}
            >
              <strong>{$t('ingest.copy')}</strong>
              <small>{$t('ingest.copyHint')}</small>
            </button>
          </div>
          {#if settings}
            <small class="muted">
              {$t('ingest.modeDefault').replace(
                '{mode}',
                settings.mode === 'move' ? $t('ingest.move') : $t('ingest.copy'),
              )}
            </small>
          {/if}
        </div>

        {#if settings && settings.music_dirs.length > 1}
          <label class="full">
            <span>{$t('ingest.destRoot')}</span>
            <select
              bind:value={destRoot}
              onchange={() => {
                void refreshPreview();
              }}
            >
              {#each settings.music_dirs as dir}
                <option value={dir}>{dir}</option>
              {/each}
            </select>
          </label>
        {/if}

        {#if planResp.conflicts > 0}
          <div class="banner warn">
            {$t('ingest.conflictsFound').replace('{n}', String(planResp.conflicts))}
          </div>
          <label class="full">
            <span>{$t('ingest.onConflict')}</span>
            <select
              bind:value={conflictPolicy}
              onchange={() => {
                void refreshPreview();
              }}
            >
              <option value="skip">{$t('ingest.policy.skip')}</option>
              <option value="rename">{$t('ingest.policy.rename')}</option>
              <option value="overwrite">{$t('ingest.policy.overwrite')}</option>
            </select>
          </label>
        {/if}

        <div class="preview">
          <div class="preview-head">
            <span>{$t('ingest.destination')}</span>
            <code>{planResp.plan.dest_root}</code>
          </div>
          <ul>
            {#each planResp.plan.entries as e}
              <li class:conflicting={!!e.conflict}>
                <span class="kind" class:extra={e.kind === 'extra'}>
                  {e.kind === 'extra' ? '📄' : '♪'}
                </span>
                <span class="path">{e.relative_path}</span>
                {#if e.conflict}
                  <span class="badge">{conflictLabel(e.conflict)}</span>
                {/if}
              </li>
            {/each}
          </ul>
          {#if planResp.plan.skipped.length}
            <p class="muted small">
              {$t('ingest.skippedCount').replace('{n}', String(planResp.plan.skipped.length))}
            </p>
          {/if}
        </div>

        <details bind:open={showAdvanced} class="advanced">
          <summary>{$t('ingest.advanced')}</summary>
          <label class="full">
            <span>{$t('ingest.template')}</span>
            <input
              type="text"
              bind:value={template}
              placeholder={settings?.default_template ?? ''}
              onchange={() => {
                void refreshPreview();
              }}
            />
            <small class="muted">{$t('ingest.templateHint')}</small>
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={writeTags} />
            <span>{$t('ingest.writeTags')}</span>
          </label>
        </details>

        <div class="actions">
          <button class="ghost" onclick={() => (step = 'album')}>{$t('ingest.back')}</button>
          <button class="primary" disabled={busy} onclick={run}>
            {mode === 'move' ? $t('ingest.doMove') : $t('ingest.doCopy')}
          </button>
        </div>

        <!-- Étape 4 : résultat -->
      {:else if step === 'done'}
        {#if !job || job.status === 'running'}
          <div class="uploading">
            <p>{$t('ingest.working')}</p>
            <div class="bar indeterminate"><div class="fill"></div></div>
          </div>
        {:else if job.status === 'failed'}
          <div class="banner err">{job.error ?? $t('ingest.failed')}</div>
        {:else if job.status === 'undone'}
          <div class="banner">
            {$t('ingest.undoneReport').replace('{n}', String(job.undo_reverted ?? 0))}
          </div>
        {:else}
          <div class="result">
            <div class="big">{job.placed ?? 0}</div>
            <p>
              {job.mode === 'move' ? $t('ingest.resultMoved') : $t('ingest.resultCopied')}
              {#if job.bytes}<span class="muted"> · {humanBytes(job.bytes)}</span>{/if}
            </p>
            {#if job.album_dir}
              <code class="dest">{job.album_dir}</code>
            {/if}
            <ul class="notes">
              {#if job.tags_written}
                <li>{$t('ingest.tagsWritten').replace('{n}', String(job.tags_written))}</li>
              {/if}
              {#if job.scan_triggered}
                <li>{$t('ingest.scanTriggered')}</li>
              {/if}
              {#if job.report?.skipped.length}
                <li>
                  {$t('ingest.skippedCount').replace(
                    '{n}',
                    String(job.report.skipped.length),
                  )}
                </li>
              {/if}
            </ul>
            {#if job.report?.errors.length}
              <div class="banner err">
                <p>{$t('ingest.someErrors').replace('{n}', String(job.report.errors.length))}</p>
                <ul>
                  {#each job.report.errors.slice(0, 5) as er}
                    <li>{er.source_path.split('/').pop()} — {er.message}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}

        <div class="actions">
          {#if job && (job.status === 'done' || job.status === 'partial')}
            <button class="ghost danger" disabled={busy} onclick={undo}>
              {$t('ingest.undo')}
            </button>
          {/if}
          <button class="primary" onclick={onClose}>{$t('ingest.close')}</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .wiz-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    padding: 24px;
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .wiz {
    background: var(--tune-surface, #1e1e1e);
    color: var(--tune-text, #eee);
    border: 1px solid var(--tune-border, #333);
    border-radius: 14px;
    width: min(780px, 96vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px 12px;
    border-bottom: 1px solid var(--tune-border, #333);
  }
  header h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .subtitle {
    margin: 4px 0 0;
    font-size: 0.85rem;
    opacity: 0.65;
  }
  .close {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.6rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.6;
  }
  .close:hover {
    opacity: 1;
  }

  .steps {
    display: flex;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 12px 22px;
    border-bottom: 1px solid var(--tune-border, #333);
    overflow-x: auto;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
    opacity: 0.45;
    white-space: nowrap;
    padding-right: 10px;
  }
  .steps li.active,
  .steps li.past {
    opacity: 1;
  }
  .dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.72rem;
    background: var(--tune-bg, #111);
    border: 1px solid var(--tune-border, #444);
  }
  .steps li.active .dot {
    background: var(--tune-accent, #4a9eff);
    border-color: transparent;
    color: #fff;
  }
  .steps li.past .dot {
    border-color: var(--tune-accent, #4a9eff);
  }

  .body {
    padding: 18px 22px 22px;
    overflow-y: auto;
  }

  .hint,
  .dropnote {
    font-size: 0.86rem;
    opacity: 0.7;
    margin: 0 0 12px;
  }
  .dropnote {
    margin: 14px 0 0;
    font-size: 0.8rem;
  }

  .row {
    display: flex;
    gap: 8px;
  }
  .row input {
    flex: 1;
  }

  input[type='text'],
  input[type='number'],
  select {
    background: var(--tune-bg, #111);
    color: inherit;
    border: 1px solid var(--tune-border, #333);
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 0.9rem;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus,
  select:focus {
    outline: none;
    border-color: var(--tune-accent, #4a9eff);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 14px 0;
  }
  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.82rem;
  }
  label > span {
    opacity: 0.75;
  }
  label.full {
    margin: 12px 0;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  label.check input {
    width: auto;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }
  button.primary,
  button.ghost {
    border-radius: 8px;
    padding: 9px 16px;
    font-size: 0.88rem;
    cursor: pointer;
    border: 1px solid transparent;
  }
  button.primary {
    background: var(--tune-accent, #4a9eff);
    color: #fff;
  }
  button.primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.ghost {
    background: transparent;
    color: inherit;
    border-color: var(--tune-border, #444);
  }
  button.ghost:hover {
    border-color: var(--tune-accent, #4a9eff);
  }
  button.ghost.danger {
    color: #ff6b6b;
    border-color: rgba(255, 107, 107, 0.4);
    margin-right: auto;
  }

  .banner {
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.85rem;
    margin: 0 22px 12px;
    background: rgba(255, 255, 255, 0.06);
  }
  .body .banner {
    margin: 0 0 12px;
  }
  .banner.err {
    background: rgba(255, 90, 90, 0.14);
    color: #ff9d9d;
  }
  .banner.warn {
    background: rgba(255, 190, 80, 0.14);
    color: #ffd08a;
  }
  .banner ul {
    margin: 6px 0 0;
    padding-left: 18px;
  }

  .summary {
    border: 1px solid var(--tune-border, #333);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .sum-main {
    font-size: 1rem;
  }
  .sep {
    opacity: 0.4;
    margin: 0 6px;
  }
  .sum-meta {
    font-size: 0.8rem;
    opacity: 0.65;
    margin-top: 5px;
  }
  .muted {
    opacity: 0.6;
  }
  .small {
    font-size: 0.8rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .chip {
    font-size: 0.75rem;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255, 190, 80, 0.16);
    color: #ffd08a;
  }

  .mb-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  /* Liste des éditions candidates */
  .editions {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    max-height: 210px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  button.edition {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--tune-bg, #111);
    color: inherit;
    border: 1px solid var(--tune-border, #333);
    border-radius: 8px;
    padding: 8px 11px;
    cursor: pointer;
  }
  button.edition:hover {
    border-color: var(--tune-accent, #4a9eff);
  }
  button.edition.sel {
    border-color: var(--tune-accent, #4a9eff);
    background: rgba(74, 158, 255, 0.1);
  }
  .edition-main {
    font-size: 0.88rem;
  }
  .disamb {
    opacity: 0.7;
    font-style: italic;
  }
  .edition-meta {
    font-size: 0.76rem;
    opacity: 0.6;
  }

  /* Différences apportées par le tracklisting choisi */
  .release-box {
    margin-top: 10px;
    border-top: 1px solid var(--tune-border, #333);
    padding-top: 10px;
  }
  .diff {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
    font-size: 0.82rem;
  }
  .diff li {
    display: grid;
    grid-template-columns: 26px 1fr 14px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 2px 0;
  }
  .diff .was {
    opacity: 0.55;
    text-decoration: line-through;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .diff .arrow {
    opacity: 0.4;
  }
  .diff .now {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tracklist {
    margin-top: 14px;
    font-size: 0.85rem;
  }
  .tracklist summary {
    cursor: pointer;
    opacity: 0.75;
  }
  .tracklist ul {
    list-style: none;
    padding: 8px 0 0;
    margin: 0;
    max-height: 190px;
    overflow-y: auto;
  }
  .tracklist li {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 8px;
    padding: 3px 0;
  }
  .num {
    opacity: 0.5;
    text-align: right;
  }
  .ti {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mode-block {
    margin-bottom: 8px;
  }
  .mode-title {
    font-size: 0.82rem;
    opacity: 0.75;
  }
  .mode-choice {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 8px 0 6px;
  }
  @media (max-width: 560px) {
    .mode-choice {
      grid-template-columns: 1fr;
    }
  }
  button.mode {
    text-align: left;
    background: var(--tune-bg, #111);
    color: inherit;
    border: 1px solid var(--tune-border, #333);
    border-radius: 10px;
    padding: 10px 12px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  button.mode small {
    opacity: 0.6;
    font-size: 0.76rem;
  }
  button.mode.sel {
    border-color: var(--tune-accent, #4a9eff);
    background: rgba(74, 158, 255, 0.1);
  }

  .preview {
    border: 1px solid var(--tune-border, #333);
    border-radius: 10px;
    margin: 12px 0;
    overflow: hidden;
  }
  .preview-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    padding: 9px 12px;
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.8rem;
  }
  .preview-head code,
  code.dest {
    font-size: 0.78rem;
    opacity: 0.75;
    word-break: break-all;
  }
  .preview ul {
    list-style: none;
    margin: 0;
    padding: 6px 0;
    max-height: 240px;
    overflow-y: auto;
  }
  .preview li {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 3px 12px;
    font-size: 0.82rem;
    font-family: var(--tune-mono, ui-monospace, monospace);
  }
  .preview li.conflicting {
    background: rgba(255, 190, 80, 0.08);
  }
  .kind {
    opacity: 0.5;
    text-align: center;
  }
  .kind.extra {
    font-size: 0.7rem;
  }
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 0.7rem;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(255, 190, 80, 0.18);
    color: #ffd08a;
    white-space: nowrap;
  }
  .preview p {
    padding: 0 12px 8px;
    margin: 0;
  }

  .advanced {
    font-size: 0.85rem;
    border-top: 1px solid var(--tune-border, #333);
    padding-top: 10px;
  }
  .advanced summary {
    cursor: pointer;
    opacity: 0.75;
  }

  .uploading {
    text-align: center;
    padding: 22px 0;
  }
  .bar {
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
    margin-top: 12px;
  }
  .bar .fill {
    height: 100%;
    background: var(--tune-accent, #4a9eff);
    transition: width 0.2s ease-out;
  }
  .bar.indeterminate .fill {
    width: 35%;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    from { margin-left: -35%; }
    to { margin-left: 100%; }
  }

  .result {
    text-align: center;
    padding: 8px 0;
  }
  .result .big {
    font-size: 2.4rem;
    font-weight: 600;
    color: var(--tune-accent, #4a9eff);
  }
  .result p {
    margin: 2px 0 10px;
  }
  .notes {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    font-size: 0.83rem;
    opacity: 0.75;
  }
  .notes li {
    padding: 2px 0;
  }
</style>
