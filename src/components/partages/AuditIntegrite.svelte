<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import TrackTagsDrawer from './TrackTagsDrawer.svelte';
  let mode = $state<api.ModeIntegrite>('full');
  let fichierOuvert = $state<number | null>(null);
  let etat = $state<api.EtatIntegrite | null>(null);
  let lignes = $state<api.LigneIntegrite[]>([]);
  let offset = $state(0);
  let verdict = $state('');
  let totalFiltre = $derived(!etat ? 0 : verdict === 'sain' ? etat.sains : verdict === 'corrompu' ? etat.corrompus : verdict === 'non_verifiable' ? etat.non_verifiables : etat.traites);
  let enVol = $state(false);
  let erreur = $state('');
  let vivant = false;
  let lectureEnVol = false;
  async function relire() {
    if (lectureEnVol) return;
    lectureEnVol = true;
    try {
      const [statut, rapport] = await Promise.all([api.getIntegrityStatus(), api.getIntegrityReport(offset, verdict)]);
      if (!['idle', 'running', 'paused', 'completed', 'error'].includes(statut?.status)
        || ![statut.total, statut.traites, statut.sains, statut.corrompus, statut.non_verifiables].every(Number.isFinite)
        || !Array.isArray(rapport?.lignes)
        || !rapport.lignes.every(l => typeof l.chemin === 'string' && l.resultat && ['sain', 'corrompu', 'non_verifiable'].includes(l.resultat.verdict))) {
        throw new Error('invalid_integrity_response');
      }
      if (vivant) { etat = statut; lignes = rapport.lignes; erreur = ''; }
    } catch { if (vivant) erreur = 'integrity.unavailable'; }
    finally { lectureEnVol = false; }
  }
  async function agir(action: () => Promise<unknown>) {
    enVol = true;
    erreur = '';
    try { await action(); await relire(); }
    catch { erreur = 'integrity.actionFailed'; }
    finally { enVol = false; }
  }
  async function page(delta: number) { offset += delta; await relire(); }
  onMount(() => {
    vivant = true;
    void relire();
    const timer = setInterval(() => { void relire(); }, 2000);
    return () => { vivant = false; clearInterval(timer); };
  });
</script>

<section aria-label={$t('integrity.title')}>
  <h3>{$t('integrity.title')}</h3>
  <p>{$t('integrity.hint')}</p>
  {#if erreur}<p role="alert">{$t(erreur)}</p>{/if}
  {#if etat}
    <p aria-live="polite">{$t('integrity.state.' + etat.status)} · {etat.traites} / {etat.total} · {$t('integrity.mode.' + (etat.mode ?? 'full'))}</p>
    {#if etat.total > 0}<progress max={etat.total} value={etat.traites} aria-label={$t('integrity.progress')}></progress>{/if}
    {#if etat.lecture_prioritaire && etat.status === 'running'}<p>{$t('integrity.playback')}</p>{/if}
    {#if etat.erreur}<p role="alert">{etat.erreur}</p>{/if}
    <label>{$t('integrity.mode')}
      <select bind:value={mode} disabled={enVol || etat.status === 'running'}>
        <option value="full">{$t('integrity.mode.full')}</option>
        <option value="quick">{$t('integrity.mode.quick')}</option>
      </select>
    </label>
    {#if mode === 'quick' || etat.mode === 'quick'}<p>{$t('integrity.quickHint')}</p>{/if}
    <div class="actions">
      {#if etat.status === 'running'}
        <button disabled={enVol} onclick={() => agir(api.pauseIntegrity)}>{$t('integrity.pause')}</button>
      {:else}
        {#if etat.status === 'paused' || etat.status === 'error'}
          <button disabled={enVol} onclick={() => agir(() => api.startIntegrity(true))}>{$t('integrity.resume')}</button>
        {/if}
        <button disabled={enVol} onclick={() => agir(async () => { offset = 0; await api.startIntegrity(false, mode); })}>{$t(mode === 'quick' ? 'integrity.startQuick' : 'integrity.start')}</button>
      {/if}
      <button disabled={enVol || etat.traites === 0} onclick={() => agir(() => api.exportIntegrityCsv(verdict))}>{$t('integrity.export')}</button>
    </div>
    <p>{$t('integrity.sain')}: {etat.sains} · {$t('integrity.corrompu')}: {etat.corrompus} · {$t('integrity.non_verifiable')}: {etat.non_verifiables}</p>
    {#if etat.alertes_taille > 0}<p>{$t('integrity.sizeChanged')}: {etat.alertes_taille}</p>{/if}
    <label>{$t('integrity.result')}
      <select bind:value={verdict} onchange={() => { offset = 0; void relire(); }}>
        <option value="">{$t('integrity.all')}</option>
        <option value="sain">{$t('integrity.sain')}</option>
        <option value="corrompu">{$t('integrity.corrompu')}</option>
        <option value="non_verifiable">{$t('integrity.non_verifiable')}</option>
      </select>
    </label>
    {#if lignes.length > 0}
      <div class="rapport">
        <table>
          <thead><tr><th>{$t('integrity.path')}</th><th>{$t('integrity.mode')}</th><th>{$t('integrity.result')}</th><th>{$t('integrity.error')}</th><th>{$t('integrity.position')}</th></tr></thead>
          <tbody>{#each lignes as ligne (ligne.id)}
            <tr>
              <td><button class="fichier" title={$t('trackTags.title')} onclick={() => fichierOuvert = ligne.id}>{ligne.chemin}</button></td>
              <td>{$t('integrity.mode.' + (ligne.mode ?? 'full'))}</td>
              <td>{$t('integrity.' + ligne.resultat.verdict)}</td>
              <td>
                {#if ligne.resultat.code === 'tronque'}{$t('integrity.truncated')}
                {:else if ligne.resultat.code === 'fin_de_flux_absente'}{$t('integrity.noEnd')}
                {:else if ligne.resultat.code === 'mode_rapide_non_applicable'}{$t('integrity.quickUnsupported')}
                {:else if ligne.resultat.code === 'md5_nul'}{$t('integrity.zeroMd5')}
                {:else if ['format_non_pris_en_charge', 'codec_non_pris_en_charge'].includes(ligne.resultat.code)}{$t('integrity.unsupported')}
                {:else if ligne.resultat.code === 'aucune_piste_audio'}{$t('integrity.noAudio')}
                {:else if ligne.resultat.code === 'modifie_pendant_audit'}{$t('integrity.changed')}
                {:else if ligne.resultat.code !== 'sain'}{ligne.resultat.erreur ?? ligne.resultat.code}{/if}
                {#if ligne.taille_sans_nouvelle_date}<p>{$t('integrity.sizeChanged')}</p>{/if}
              </td>
              <td>
                {#if ligne.resultat.localisation}
                  {$t('integrity.' + ligne.resultat.localisation.unite)} {ligne.resultat.localisation.numero} · {$t('integrity.byte')} {ligne.resultat.localisation.octet}
                {:else}{ligne.resultat.position_trames ?? $t('integrity.unknownPosition')}{/if}
                {#if ligne.resultat.fautes != null}<p>{$t('integrity.faults')}: {ligne.resultat.fautes}</p>{/if}
              </td>
            </tr>
          {/each}</tbody>
        </table>
      </div>
      <div class="actions">
        <button disabled={offset === 0 || enVol} onclick={() => page(-100)}>{$t('integrity.previous')}</button>
        <button disabled={offset + lignes.length >= totalFiltre || enVol} onclick={() => page(100)}>{$t('integrity.next')}</button>
      </div>
    {/if}
  {/if}
</section>
{#if fichierOuvert != null}
  {#key fichierOuvert}<TrackTagsDrawer trackId={fichierOuvert} onClose={() => fichierOuvert = null} />{/key}
{/if}

<style>
  /* web#2656 — le texte n'avait aucune taille : il héritait des 16 px du
     document, plus gros que tout le reste de Réglages › Bibliothèque. Mêmes
     tailles que les lignes de la page (`.lbl` 13,5 px, `.hint` 11,5 px). */
  section { margin-block: 16px; font-size: calc(12.5px * var(--v2-txt-echelle, 1)); line-height: 1.45; }
  h3 { font: 500 calc(13.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt); }
  p { color: var(--v2-txt2); margin-block: 8px; font-size: calc(12.5px * var(--v2-txt-echelle, 1)); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2); border-radius: 999px; padding: 6px 13px; cursor: pointer; font: 600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); }
  button.fichier { border: 0; border-radius: 0; padding: 0; text-align: start; text-decoration: underline; overflow-wrap: anywhere; }
  button:disabled { opacity: 0.5; cursor: default; }
  progress { width: 100%; accent-color: var(--v2-acc2); }
  .rapport { overflow-x: auto; margin-block: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { font-size: calc(12px * var(--v2-txt-echelle, 1)); text-align: start; padding: 8px; border-bottom: 1px solid var(--v2-line2); overflow-wrap: anywhere; }
</style>
