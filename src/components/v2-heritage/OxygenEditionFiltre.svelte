<script lang="ts">
  /**
   * tune-server-rust#7539 — « Modifier les métadonnées… » sur la sélection
   * d'Oxygen (le résultat filtré entier, #7128).
   *
   * Un champ, une valeur, un APERÇU OBLIGATOIRE, puis la confirmation. Le
   * bouton « Confirmer » reste inactif tant que l'aperçu n'a pas été calculé
   * pour EXACTEMENT le champ, la valeur et la cible affichés : changer l'un
   * des trois efface l'aperçu. La confirmation renvoie les comptes vus ; si
   * la sélection a bougé, le serveur refuse sans rien écrire.
   */
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { getGenres, type FacetParam } from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';
  import type { CibleEtiquetage } from '../../lib/etiquetageParFiltre';
  import {
    CHAMPS_EDITION, apercuEdition, arreterFichiers, cibleEffective, editerParFiltre, statutFichiers,
    valeurValide, type ApercuEdition, type ChampEdition, type StatutFichiers,
  } from '../../lib/editionParFiltre';

  interface Props {
    filtres: Record<string, FacetParam>;
    cibleParDefaut: CibleEtiquetage;
    onFermer: () => void;
    onFait?: () => void;
  }
  let { filtres, cibleParDefaut, onFermer, onFait }: Props = $props();

  let cible = $state<CibleEtiquetage>('track');
  let champ = $state<ChampEdition>('genre');
  let valeur = $state('');
  let genres = $state<string[]>([]);
  let apercu = $state<ApercuEdition | null>(null);
  /** La clé (champ, valeur, cible) pour laquelle `apercu` a été calculé. */
  let cleApercu = $state('');
  let apercuEnCours = $state(false);
  let apercuEchoue = $state(false);
  let envoiEnCours = $state(false);
  let passe = $state<string | null>(null);
  let statut = $state<StatutFichiers | null>(null);
  let minuterie: ReturnType<typeof setInterval> | null = null;

  const nf = (n: number | undefined) => (n ?? 0).toLocaleString();
  const cibleVue = $derived(cibleEffective(champ, cible));
  const cle = $derived(`${champ}\u0000${valeur.trim()}\u0000${cibleVue}`);
  const apercuAJour = $derived(!!apercu && cleApercu === cle);
  const valide = $derived(valeurValide(champ, valeur));
  const rienAModifier = $derived(!!apercu && !apercu.over_limit && (apercu.tracks ?? 0) === 0 && (apercu.albums ?? 0) === 0);
  const peutConfirmer = $derived(apercuAJour && !apercu!.over_limit && !rienAModifier && !envoiEnCours && passe === null);

  onMount(() => {
    cible = cibleParDefaut;
    void (async () => {
      try { genres = ((await getGenres()) ?? []).map((g) => g.name).filter(Boolean); } catch { genres = []; }
    })();
  });
  onDestroy(() => { if (minuterie) clearInterval(minuterie); });

  function nomDuChamp(c: ChampEdition): string {
    return $t(`oxygen.editSel.field.${c}`);
  }

  async function calculerApercu() {
    if (!valide) return;
    apercuEnCours = true;
    apercuEchoue = false;
    const pour = cle;
    try {
      apercu = await apercuEdition(cibleVue, champ, valeur, filtres);
      cleApercu = pour;
    } catch {
      apercu = null;
      apercuEchoue = true;
    } finally {
      apercuEnCours = false;
    }
  }

  function phraseCompte(a: ApercuEdition): string {
    if (a.over_limit) {
      return $t('oxygen.editSel.overLimit').replace('{count}', nf(a.count)).replace('{limit}', nf(a.limit));
    }
    if ((a.tracks ?? 0) === 0 && (a.albums ?? 0) === 0) return $t('oxygen.editSel.nothing');
    return $t('oxygen.editSel.previewCount').replace('{tracks}', nf(a.tracks)).replace('{albums}', nf(a.albums));
  }

  function phraseFichiers(a: ApercuEdition): string {
    if (!a.file_writes_enabled) return $t('oxygen.editSel.filesOff');
    return $t('oxygen.editSel.filesOn').replace('{files}', nf(a.files));
  }

  async function confirmer() {
    if (!peutConfirmer || !apercu) return;
    envoiEnCours = true;
    try {
      const bilan = await editerParFiltre(apercu, cibleVue, filtres);
      notifications.success(
        $t('oxygen.editSel.done')
          .replace('{field}', nomDuChamp(champ))
          .replace('{tracks}', nf(bilan.tracks))
          .replace('{albums}', nf(bilan.albums)),
        6000,
      );
      onFait?.();
      if (bilan.files_task_id) {
        passe = bilan.files_task_id;
        suivre();
      } else {
        onFermer();
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'preview_changed') {
        notifications.error($t('oxygen.editSel.stale'));
        await calculerApercu();
      } else if (code === 'files_pass_running') {
        notifications.error($t('oxygen.editSel.passRunning'));
      } else {
        notifications.error($t('oxygen.editSel.failed'));
      }
    } finally {
      envoiEnCours = false;
    }
  }

  function suivre() {
    const lire = async () => {
      try { statut = await statutFichiers(); } catch { /* le prochain tour réessaie */ }
      if (statut && statut.task_id === passe && statut.status !== 'running') {
        if (minuterie) clearInterval(minuterie);
        minuterie = null;
      }
    };
    void lire();
    minuterie = setInterval(lire, 1000);
  }

  const passeFinie = $derived(!!statut && statut.task_id === passe && statut.status !== 'running');
</script>

<div class="oxy-tagsel-fond" role="presentation" onclick={() => { if (!envoiEnCours && passe === null) onFermer(); }}></div>
<div class="oxy-tagsel-dialogue" role="dialog" aria-modal="true" aria-label={$t('oxygen.editSel.title')} data-testid="oxy-edit-dialog">
  <h2>{$t('oxygen.editSel.title')}</h2>

  {#if passe === null}
    <label class="oxy-tagsel-ligne">
      <span>{$t('oxygen.editSel.fieldLabel')}</span>
      <select bind:value={champ} data-testid="oxy-edit-field">
        {#each CHAMPS_EDITION as c (c)}
          <option value={c}>{nomDuChamp(c)}</option>
        {/each}
      </select>
    </label>

    {#if champ === 'album_artist'}
      <p class="oxy-tagsel-note">{$t('oxygen.editSel.albumArtistNote')}</p>
    {:else}
      <div class="oxy-tagsel-ligne" role="radiogroup" aria-label={$t('oxygen.tagSel.target')}>
        <span>{$t('oxygen.tagSel.target')}</span>
        <button class="oxy-tagsel" class:on={cible === 'track'} aria-pressed={cible === 'track'} onclick={() => { cible = 'track'; }}>{$t('oxygen.tagSel.targetTracks')}</button>
        <button class="oxy-tagsel" class:on={cible === 'album'} aria-pressed={cible === 'album'} onclick={() => { cible = 'album'; }}>{$t('oxygen.tagSel.targetAlbums')}</button>
      </div>
    {/if}

    <label class="oxy-tagsel-ligne">
      <span>{$t('oxygen.editSel.valueLabel')}</span>
      {#if champ === 'year'}
        <input class="oxy-tagsel-nom" data-testid="oxy-edit-value" inputmode="numeric" maxlength="4"
               placeholder="1959" bind:value={valeur} />
      {:else}
        <input class="oxy-tagsel-nom" data-testid="oxy-edit-value" maxlength="200"
               list={champ === 'genre' ? 'oxy-edit-genres' : undefined} bind:value={valeur} />
      {/if}
    </label>
    {#if champ === 'genre'}
      <datalist id="oxy-edit-genres">
        {#each genres as g (g)}<option value={g}></option>{/each}
      </datalist>
    {/if}
    {#if champ === 'year' && valeur.trim() !== '' && !valide}
      <p class="oxy-tagsel-apercu alerte">{$t('oxygen.editSel.yearInvalid')}</p>
    {/if}

    <button class="oxy-tagsel" data-testid="oxy-edit-preview" onclick={calculerApercu} disabled={!valide || apercuEnCours}>
      {$t('oxygen.editSel.preview')}
    </button>

    <div class="oxy-tagsel-apercu" class:alerte={apercu?.over_limit} data-testid="oxy-edit-preview-text" aria-live="polite">
      {#if apercuEnCours}
        {$t('oxygen.tagSel.counting')}
      {:else if apercuEchoue}
        {$t('oxygen.tagSel.previewFailed')}
      {:else if apercuAJour && apercu}
        <p data-testid="oxy-edit-count">{phraseCompte(apercu)}</p>
        {#if !apercu.over_limit}
          {#if (apercu.unchanged ?? 0) > 0}
            <p class="oxy-tagsel-note">{$t('oxygen.editSel.unchanged').replace('{count}', nf(apercu.unchanged))}</p>
          {/if}
          {#if (apercu.remote_skipped ?? 0) > 0}
            <p class="oxy-tagsel-note">{$t('oxygen.editSel.remoteSkipped').replace('{count}', nf(apercu.remote_skipped))}</p>
          {/if}
          {#if (apercu.track_examples?.length ?? 0) > 0 || (apercu.album_examples?.length ?? 0) > 0}
            <ul class="oxy-edit-exemples" data-testid="oxy-edit-examples">
              {#each apercu.album_examples ?? [] as ex (`a${ex.id}`)}
                <li><strong>{ex.title}</strong> : <s>{ex.before ?? $t('oxygen.editSel.empty')}</s> → {ex.after}</li>
              {/each}
              {#each apercu.track_examples ?? [] as ex (`t${ex.id}`)}
                <li>{ex.title}{#if ex.context} <span class="oxy-tagsel-note">({ex.context})</span>{/if} : <s>{ex.before ?? $t('oxygen.editSel.empty')}</s> → {ex.after}</li>
              {/each}
            </ul>
          {/if}
          <p data-testid="oxy-edit-files">{phraseFichiers(apercu)}</p>
          {#if apercu.file_writes_enabled && (apercu.files_cue_skipped ?? 0) > 0}
            <p class="oxy-tagsel-note">{$t('oxygen.editSel.cueSkipped').replace('{count}', nf(apercu.files_cue_skipped))}</p>
          {/if}
        {/if}
      {:else}
        {$t('oxygen.editSel.previewRequired')}
      {/if}
    </div>

    <div class="oxy-tagsel-actions">
      <button class="oxy-tagsel" onclick={onFermer} disabled={envoiEnCours}>{$t('oxygen.tagSel.cancel')}</button>
      <button class="oxy-tagsel primaire" data-testid="oxy-edit-confirm" onclick={confirmer} disabled={!peutConfirmer}>{$t('oxygen.tagSel.confirm')}</button>
    </div>
  {:else}
    <p class="oxy-tagsel-apercu" data-testid="oxy-edit-progress" aria-live="polite">
      {#if passeFinie}
        {$t(statut?.status === 'done' ? 'oxygen.editSel.filesDone' : 'oxygen.editSel.filesStopped')
          .replace('{written}', nf(statut?.written)).replace('{total}', nf(statut?.total))}
      {:else}
        {$t('oxygen.editSel.filesProgress').replace('{done}', nf(statut?.processed)).replace('{total}', nf(statut?.total))}
      {/if}
    </p>
    <div class="oxy-tagsel-actions">
      {#if !passeFinie}
        <button class="oxy-tagsel" data-testid="oxy-edit-stop" onclick={() => { void arreterFichiers(); }}>{$t('oxygen.editSel.stopFiles')}</button>
      {/if}
      <button class="oxy-tagsel primaire" onclick={onFermer}>{$t('oxygen.editSel.close')}</button>
    </div>
  {/if}
</div>

<style>
  .oxy-tagsel { background: var(--tune-surface); border: 1px solid var(--tune-border); color: var(--tune-text-secondary); height: 34px; padding: 0 12px; border-radius: 9px; cursor: pointer; font-size: 13px; white-space: nowrap; }
  .oxy-tagsel:hover:not(:disabled) { color: var(--tune-text); border-color: var(--tune-accent); }
  .oxy-tagsel:disabled { opacity: .5; cursor: default; }
  .oxy-tagsel.on { color: var(--tune-text); border-color: var(--tune-accent); }
  .oxy-tagsel.primaire { background: var(--tune-accent); border-color: var(--tune-accent); color: var(--tune-bg); }
  .oxy-tagsel-fond { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 900; }
  .oxy-tagsel-dialogue { position: fixed; z-index: 901; left: 50%; top: 12%; transform: translateX(-50%); width: min(480px, calc(100vw - 32px)); max-height: 80vh; overflow-y: auto; background: var(--tune-bg); color: var(--tune-text); border: 1px solid var(--tune-border); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .oxy-tagsel-dialogue h2 { font-size: 16px; margin: 0; }
  .oxy-tagsel-ligne { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
  .oxy-tagsel-ligne select, .oxy-tagsel-nom { flex: 1; min-width: 0; height: 32px; background: var(--tune-surface); color: var(--tune-text); border: 1px solid var(--tune-border); border-radius: 8px; padding: 0 8px; }
  .oxy-tagsel-apercu { margin: 0; font-size: 14px; }
  .oxy-tagsel-apercu p { margin: 0 0 6px; }
  .oxy-tagsel-apercu.alerte { color: var(--tune-danger, #d33); }
  .oxy-tagsel-note { margin: 0; font-size: 12px; color: var(--tune-text-secondary); }
  .oxy-edit-exemples { margin: 0 0 6px; padding-left: 18px; font-size: 13px; }
  .oxy-tagsel-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
