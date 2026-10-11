<script lang="ts">
  /**
   * Réglages › Système › Sauvegarde dans le cloud
   * (renesenses/tune-server-rust#5654, renesenses/tune-web-client#902).
   *
   * Le serveur Tune prend seul ses instantanés (au plus un par jour, et après
   * chaque changement passé un délai d'attente) et les chiffre avec une clé
   * que mozaiklabs ne connaît pas ; le site en garde trois par machine et
   * cinq machines par compte. Réservé au Premium. Cet écran dit où en est
   * la sauvegarde, l'active (phrase de passe, puis clé de secours montrée UNE
   * fois), et restaure un instantané en fusionnant ou en remplaçant — en
   * avertissant que les profils reviennent SANS leur mot de passe.
   *
   * 🔴 La phrase de passe et la clé de secours ne vivent que dans l'état de
   * ce composant le temps du geste, puis sont vidées. Rien ne les écrit dans
   * le stockage du navigateur ni dans une URL.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t, locale } from '../../lib/i18n';
  import { dateEtHeure } from '../../lib/dates';
  import { notifications } from '../../lib/stores/notifications';
  import {
    RefusSauvegarde,
    motifPhraseRefusee,
    secretAttendu,
    peutLister,
    tailleLisible,
    lignesDuBilan,
    profilsSansMotDePasse,
    type EtatSauvegardeCloud,
    type InstantaneCloud,
    type ModeRestauration,
    type ResultatRestauration,
  } from '../../lib/sauvegardeCloud';

  let etat = $state<EtatSauvegardeCloud | null>(null);
  let instantanes = $state<InstantaneCloud[]>([]);
  let chargement = $state(true);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  // Activation
  let phrase = $state('');
  let phrase2 = $state('');
  let motifPhrase = $state<string | null>(null);
  let cleDeSecours = $state<string | null>(null);
  let cleNotee = $state(false);

  // Restauration
  let cible = $state<InstantaneCloud | null>(null);
  let mode = $state<ModeRestauration>('merge');
  let secret = $state('');
  let secretDemande = $state(false);
  let secretFaux = $state(false);
  let bilan = $state<ResultatRestauration | null>(null);

  const tr = (k: string) => $t(k as any);

  function messageDe(e: any): string {
    if (e instanceof RefusSauvegarde) {
      if (e.code === 'cloud_unreachable') return tr('cloudBackup.cloudUnreachable');
      if (e.code === 'account_not_linked') return tr('cloudBackup.stateNotLinked');
    }
    return tr('cloudBackup.error').replace('{error}', e?.message ?? String(e));
  }

  async function charger() {
    chargement = true;
    erreur = null;
    try {
      etat = await api.getCloudBackupStatus();
      if (peutLister(etat)) {
        instantanes = (await api.listCloudBackups()).backups ?? [];
      } else {
        instantanes = [];
      }
    } catch (e: any) {
      erreur = messageDe(e);
    }
    chargement = false;
  }

  onMount(charger);

  async function activer() {
    erreur = null;
    let corps: string | undefined;
    if (!etat?.key_configured) {
      motifPhrase = motifPhraseRefusee(phrase, phrase2);
      if (motifPhrase) return;
      corps = phrase;
    }
    occupe = true;
    try {
      const r = await api.enableCloudBackup(corps);
      cleDeSecours = r.recovery_key ?? null;
      cleNotee = false;
      await charger();
    } catch (e: any) {
      erreur = messageDe(e);
    } finally {
      phrase = '';
      phrase2 = '';
      occupe = false;
    }
  }

  async function desactiver() {
    occupe = true;
    erreur = null;
    try {
      await api.disableCloudBackup();
      await charger();
    } catch (e: any) {
      erreur = messageDe(e);
    }
    occupe = false;
  }

  async function sauvegarderMaintenant() {
    occupe = true;
    erreur = null;
    try {
      const r = await api.backupCloudNow();
      notifications.success(tr(r.skipped_unchanged ? 'cloudBackup.backupUnchanged' : 'cloudBackup.backupDone'));
      await charger();
    } catch (e: any) {
      erreur = messageDe(e);
    }
    occupe = false;
  }

  function ouvrir(i: InstantaneCloud) {
    cible = i;
    mode = 'merge';
    secret = '';
    secretDemande = secretAttendu(i);
    secretFaux = false;
    bilan = null;
    erreur = null;
  }

  function fermer() {
    cible = null;
    secret = '';
    secretDemande = false;
    secretFaux = false;
  }

  async function restaurer() {
    if (!cible) return;
    occupe = true;
    erreur = null;
    secretFaux = false;
    try {
      bilan = await api.restoreCloudBackup(cible.id, mode, secretDemande ? secret : null);
      notifications.success(tr('cloudBackup.restoreDone'));
      fermer();
      await charger();
    } catch (e: any) {
      if (e instanceof RefusSauvegarde && e.code === 'secret_required') {
        secretDemande = true;
      } else if (e instanceof RefusSauvegarde && e.code === 'wrong_secret') {
        secretDemande = true;
        secretFaux = true;
      } else {
        erreur = messageDe(e);
      }
    } finally {
      secret = '';
      occupe = false;
    }
  }
</script>

<div class="sc">
  <p class="hint">{tr('cloudBackup.intro')}</p>

  {#if chargement && !etat}
    <p class="hint">{tr('common.loading')}</p>
  {:else if etat}
    {#if !etat.premium}
      <p class="etat">{tr('cloudBackup.statePremium')}</p>
    {:else if !etat.account_linked}
      <p class="etat">{tr('cloudBackup.stateNotLinked')}</p>
    {:else}
      <p class="etat">
        {#if etat.enabled}
          {tr('cloudBackup.stateEnabled').replace('{n}', String(etat.debounce_minutes))}
        {:else}
          {tr('cloudBackup.stateDisabled')}
        {/if}
      </p>
      <p class="hint">
        {#if etat.last_backup_at}
          {tr('cloudBackup.lastBackup').replace('{date}', $dateEtHeure(etat.last_backup_at))}
        {:else}
          {tr('cloudBackup.lastBackupNever')}
        {/if}
      </p>
      {#if etat.pending_since}
        <p class="hint">{tr('cloudBackup.pending').replace('{date}', $dateEtHeure(etat.pending_since))}</p>
      {/if}
      {#if etat.last_error}
        <p class="errline">{tr('cloudBackup.lastError').replace('{error}', etat.last_error)}</p>
      {/if}

      {#if cleDeSecours}
        <div class="boite">
          <p class="titre">{tr('cloudBackup.recoveryTitle')}</p>
          <p class="cle mono">{cleDeSecours}</p>
          <p class="hint">{tr('cloudBackup.recoveryHint')}</p>
          <label class="case">
            <input type="checkbox" bind:checked={cleNotee} />
            {tr('cloudBackup.recoveryAck')}
          </label>
          <button class="lnk primaire" disabled={!cleNotee} onclick={() => { cleDeSecours = null; }}>
            {tr('cloudBackup.recoveryDone')}
          </button>
        </div>
      {:else if !etat.enabled}
        {#if !etat.key_configured}
          <div class="champs">
            <label>
              <span>{tr('cloudBackup.passphraseLabel')}</span>
              <input type="password" autocomplete="new-password" bind:value={phrase} />
            </label>
            <label>
              <span>{tr('cloudBackup.passphraseConfirm')}</span>
              <input type="password" autocomplete="new-password" bind:value={phrase2} />
            </label>
            <p class="hint">{tr('cloudBackup.passphraseHint')}</p>
            {#if motifPhrase}<p class="errline">{tr(motifPhrase)}</p>{/if}
          </div>
        {/if}
        <div class="inline">
          <button class="lnk primaire" disabled={occupe} onclick={activer}>{tr('cloudBackup.enable')}</button>
        </div>
      {:else}
        <div class="inline">
          <button class="lnk primaire" disabled={occupe} onclick={sauvegarderMaintenant}>{tr('cloudBackup.backupNow')}</button>
          <button class="lnk" disabled={occupe} onclick={desactiver}>{tr('cloudBackup.disable')}</button>
        </div>
      {/if}

      <p class="titre">{tr('cloudBackup.snapshotsTitle')}</p>
      {#if !instantanes.length}
        <p class="hint">{tr('cloudBackup.snapshotsEmpty')}</p>
      {:else}
        <ul class="liste">
          {#each instantanes as i (i.id)}
            <li>
              <span class="quand">{$dateEtHeure(i.created_at)}</span>
              <span class="hint">
                {i.server_label ?? ''} ({i.this_server ? $t('cloudBackup.snapshotThisServer') : $t('cloudBackup.snapshotOther')})
                · {tailleLisible(i.size_bytes, $locale)}
              </span>
              <button class="lnk" disabled={occupe} onclick={() => ouvrir(i)}>{tr('cloudBackup.restore')}</button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if cible}
        <div class="boite">
          <p class="titre">{$dateEtHeure(cible.created_at)}</p>
          <label class="case">
            <input type="radio" name="mode-restauration" value="merge" bind:group={mode} />
            <span><b>{tr('cloudBackup.modeMerge')}</b> — {tr('cloudBackup.modeMergeHint')}</span>
          </label>
          <label class="case">
            <input type="radio" name="mode-restauration" value="replace" bind:group={mode} />
            <span><b>{tr('cloudBackup.modeReplace')}</b> — {tr('cloudBackup.modeReplaceHint')}</span>
          </label>
          <p class="hint">{tr('cloudBackup.restoreSafety')}</p>
          <p class="alerte" role="note">{tr('cloudBackup.passwordsWarning')}</p>
          {#if secretDemande}
            <label class="champ">
              <span>{tr('cloudBackup.secretLabel')}</span>
              <input type="password" autocomplete="off" bind:value={secret} />
            </label>
            <p class="hint">{tr('cloudBackup.secretNeeded')}</p>
            {#if secretFaux}<p class="errline">{tr('cloudBackup.wrongSecret')}</p>{/if}
          {/if}
          <div class="inline">
            <button class="lnk primaire" disabled={occupe || (secretDemande && !secret.trim())} onclick={restaurer}>
              {tr('cloudBackup.confirmRestore')}
            </button>
            <button class="lnk" disabled={occupe} onclick={fermer}>{tr('common.cancel')}</button>
          </div>
        </div>
      {/if}

      {#if bilan}
        <div class="boite">
          <p class="titre">{tr('cloudBackup.restoreDone')}</p>
          <ul class="bilan">
            {#each lignesDuBilan(bilan.report) as l (l.cle)}
              <li>{tr(l.cle).replace('{n}', String(l.n))}</li>
            {/each}
          </ul>
          {#if profilsSansMotDePasse(bilan.report).length}
            <p class="alerte" role="note">
              {tr('cloudBackup.reportNoPassword').replace('{names}', profilsSansMotDePasse(bilan.report).join(', '))}
            </p>
            <p class="hint">{tr('cloudBackup.passwordsWarning')}</p>
          {/if}
          {#if bilan.key_adopted}<p class="hint">{tr('cloudBackup.keyAdopted')}</p>{/if}
          {#if bilan.report.warnings?.length}
            <details class="details">
              <summary>{tr('cloudBackup.reportWarnings')} ({bilan.report.warnings.length})</summary>
              <ul>{#each bilan.report.warnings as w}<li>{w}</li>{/each}</ul>
            </details>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}

  {#if erreur}<p class="errline">{erreur}</p>{/if}
</div>

<style>
  .sc { display: flex; flex-direction: column; gap: 10px; }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .hint { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--v2-txt3); }
  .etat { margin: 0; font-size: 13px; color: var(--v2-txt); }
  .titre { margin: 4px 0 0; font-size: 13px; font-weight: 600; color: var(--v2-txt); }
  .errline { margin: 0; font-size: 12.5px; color: var(--v2-danger); }
  .alerte {
    margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--v2-txt);
    border-left: 3px solid var(--v2-warn, var(--v2-danger)); padding: 4px 0 4px 10px;
  }
  .mono { font-family: var(--v2-mono); }
  .cle { margin: 0; font-size: 15px; letter-spacing: 0.04em; color: var(--v2-txt); user-select: all; }
  .boite {
    display: flex; flex-direction: column; gap: 8px;
    border: 1px solid var(--v2-line); border-radius: 10px; padding: 12px 14px;
  }
  .champs, .champ { display: flex; flex-direction: column; gap: 6px; }
  .champs label, .champ { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--v2-txt2); }
  input[type='password'] {
    max-width: 360px; padding: 6px 8px; border-radius: 6px;
    border: 1px solid var(--v2-line); background: transparent; color: var(--v2-txt);
  }
  .case { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--v2-txt2); }
  .liste, .bilan { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .liste li { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .quand { font-size: 13px; color: var(--v2-txt); }
  .bilan li { font-size: 12.5px; color: var(--v2-txt2); }
  .details { font-size: 12px; color: var(--v2-txt2); }
  .details summary { cursor: pointer; }
  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }
  .lnk.primaire { border-color: var(--v2-acc1); color: var(--v2-acc1); }
</style>
