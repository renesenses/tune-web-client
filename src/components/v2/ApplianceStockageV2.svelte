<script lang="ts">
  /**
   * Stockage de l'appliance Tune OS — PORTÉ de l'ancienne interface
   * (`SettingsView`, onglet Système, « Emplacement des données »), avant que
   * la phase 5 ne la retire (web#1257, inventaire
   * `docs/capacites-sans-chemin-phase5.md`).
   *
   * Trois gestes, les mêmes routes, les mêmes messages :
   *  · déplacer les données Tune (base, pochettes) vers un autre volume —
   *    `getApplianceDataStatus`, `getApplianceStorage`, `applianceRelocateData` ;
   *  · monter une partition inutilisée comme dossier musique —
   *    `applianceMountVolume` puis `addMusicDir` ;
   *  · installer Tune OS sur un disque interne (efface le disque) —
   *    `applianceInstallToDisk`, `applianceInstallStatus`.
   *
   * Les deux gestes destructifs passent par le bus `dialogs` (jamais une boîte
   * native) : confirmation `danger` pour le déplacement, saisie du mot
   * EFFACER pour l'installation — le serveur exige ce même mot.
   *
   * Monté par `SettingsV2` dans la section « Emplacement des données »,
   * UNIQUEMENT sur une appliance : ailleurs ces routes rendent 404.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';

  /** Pas de sondage des tâches longues. Réglable pour les témoins. */
  let { delaiSondage = 2000 }: { delaiSondage?: number } = $props();

  let statut = $state<api.ApplianceDataStatus | null>(null);
  let volumes = $state<api.ApplianceVolume[]>([]);
  let disques = $state<api.ApplianceDisk[]>([]);
  let partitions = $state<api.ApplianceUnmountedPartition[]>([]);
  let charge = $state(false);
  let erreurChargement = $state('');

  let deplacement = $state(false);
  let deplacementFini = $state(false);
  let erreurDeplacement = $state('');

  let montage = $state('');
  let messageMontage = $state('');
  let erreurMontage = $state(false);

  let installation = $state(false);
  let installationFinie = $state(false);
  let octetsEcrits = $state(0);
  let erreurInstallation = $state('');

  let vivant = true;
  $effect(() => () => { vivant = false; });

  const pause = () => new Promise((r) => setTimeout(r, delaiSondage));
  const message = (e: unknown) => (e as any)?.message ?? String(e);

  /** Disques internes proposables : ni le disque de démarrage, ni une clé USB. */
  const cibles = $derived(disques.filter((d) => !d.is_boot && d.tran !== 'usb'));

  async function charger() {
    try {
      statut = await api.getApplianceDataStatus();
      const s = await api.getApplianceStorage();
      volumes = s.volumes ?? [];
      disques = s.disks ?? [];
      partitions = s.unmounted_partitions ?? [];
      erreurChargement = '';
    } catch (e) {
      erreurChargement = message(e);
    } finally {
      charge = true;
    }
  }
  $effect(() => { charger(); });

  function taille(n: number): string {
    if (!n) return '0 o';
    const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
  }

  async function deplacer(vol: api.ApplianceVolume) {
    if (!vol.uuid || deplacement) return;
    const nom = vol.label || vol.device;
    if (!(await dialogs.confirm($t('settings.dataMoveConfirm' as any).replace('{disk}', nom), { danger: true }))) return;
    // La modale rend la main : un second clic a pu passer le garde entre-temps.
    if (deplacement) return;
    deplacement = true;
    erreurDeplacement = '';
    deplacementFini = false;
    try {
      await api.applianceRelocateData(vol.uuid);
      while (vivant) {
        await pause();
        statut = await api.getApplianceDataStatus();
        const j = statut?.job;
        if (!j) continue;
        if (j.phase === 'done') {
          deplacementFini = true;
          // Le serveur doit rouvrir la base à son nouvel emplacement.
          await api.restartServer().catch(() => {});
          break;
        }
        if (j.phase === 'failed') {
          erreurDeplacement = j.error || $t('common.error' as any);
          break;
        }
      }
    } catch (e) {
      erreurDeplacement = message(e);
    }
    deplacement = false;
  }

  async function monter(p: api.ApplianceUnmountedPartition) {
    if (montage) return;
    montage = p.uuid;
    messageMontage = '';
    erreurMontage = false;
    try {
      const r = await api.applianceMountVolume(p.uuid);
      await api.addMusicDir(r.mount_path);
      messageMontage = $t('settings.diskMusicAdded' as any).replace('{name}', p.label || p.name);
      await charger();
    } catch (e) {
      messageMontage = message(e);
      erreurMontage = true;
    }
    montage = '';
  }

  async function installer(d: api.ApplianceDisk) {
    if (installation) return;
    const saisi = await dialogs.prompt(
      $t('settings.installConfirmPrompt' as any).replace('{disk}', `${d.name} (${d.size} ${d.model})`.trim()),
    );
    // Le mot est celui que le serveur exige (`confirm: 'EFFACER'`), dans toutes les langues.
    if (saisi?.trim() !== 'EFFACER') return;
    if (installation) return;
    installation = true;
    erreurInstallation = '';
    installationFinie = false;
    try {
      await api.applianceInstallToDisk(d.name);
      while (vivant) {
        await pause();
        const st = await api.applianceInstallStatus();
        octetsEcrits = st.written_bytes;
        if (st.phase === 'done') { installationFinie = true; break; }
        if (st.phase === 'failed') { erreurInstallation = st.error || $t('common.error' as any); break; }
      }
    } catch (e) {
      erreurInstallation = message(e);
    }
    installation = false;
  }
</script>

<div class="st">
  {#if erreurChargement}
    <div class="errline">{erreurChargement}</div>
  {/if}

  {#if statut}
    <p class="hint mono">
      {statut.db_path} · {taille(statut.data_size_bytes)} ·
      {statut.on_external ? $t('settings.dataOnDisk' as any) : $t('settings.dataOnKey' as any)}
    </p>
  {/if}
  {#if deplacementFini}<p class="okline">{$t('settings.dataMoveDone' as any)}</p>{/if}
  {#if erreurDeplacement}<div class="errline">{erreurDeplacement}</div>{/if}

  {#if deplacement && statut?.job}
    <p class="hint">{$t('settings.dataMoving' as any)} — {taille(statut.job.copied_bytes)} / {taille(statut.job.total_bytes)}</p>
  {:else if !deplacementFini && volumes.length}
    <div class="liste">
      {#each volumes as vol (vol.device)}
        <div class="ligne">
          <span class="nom">{vol.label || vol.device}</span>
          <span class="meta">{vol.fs}</span>
          <span class="meta">{$t('settings.dataFree' as any).replace('{free}', taille(vol.free_bytes)).replace('{size}', taille(vol.size_bytes))}</span>
          {#if vol.is_data_target}
            <span class="actuel">{$t('settings.dataCurrent' as any)}</span>
          {:else if vol.uuid}
            <button class="lnk deplacer" disabled={deplacement} onclick={() => deplacer(vol)}>{$t('settings.dataMove' as any)}</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if partitions.length}
    <h4>{$t('settings.disksDetected' as any)}</h4>
    {#if messageMontage}
      <p class:okline={!erreurMontage} class:errline={erreurMontage}>{messageMontage}</p>
    {/if}
    <div class="liste">
      {#each partitions as p (p.uuid)}
        <div class="ligne">
          <span class="nom">{p.label || p.name}</span>
          <span class="meta">{p.fstype} · {p.disk_model || p.disk}{p.tran === 'usb' ? ' · USB' : ''}</span>
          <span class="meta">{p.size}</span>
          <button class="lnk monter" disabled={!!montage} onclick={() => monter(p)}>
            {montage === p.uuid ? '…' : $t('settings.diskUseAsMusic' as any)}
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if cibles.length}
    <h4>{$t('settings.installTitle' as any)}</h4>
    <p class="hint">{$t('settings.installHint' as any)}</p>
    {#if installationFinie}
      <p class="okline">{$t('settings.installDone' as any)}</p>
    {:else if installation}
      <p class="hint">{$t('settings.installWriting' as any)} — {taille(octetsEcrits)}</p>
    {:else}
      {#if erreurInstallation}<div class="errline">{erreurInstallation}</div>{/if}
      <div class="liste">
        {#each cibles as d (d.name)}
          <div class="ligne">
            <span class="nom">{d.name}</span>
            <span class="meta">{d.model}</span>
            <span class="meta">{d.size}</span>
            <button class="lnk danger installer" onclick={() => installer(d)}>{$t('settings.installButton' as any)}</button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if charge && !erreurChargement && !volumes.length && !partitions.length && !cibles.length}
    <p class="hint">—</p>
  {/if}
</div>

<style>
  .st { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
  h4 { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--v2-txt); }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .mono { font-family: ui-monospace, monospace; word-break: break-all; }
  .okline { margin: 0; font-size: 13px; color: var(--v2-acc1); }
  .errline { margin: 0; font-size: 13px; color: var(--v2-danger); }
  .liste { display: flex; flex-direction: column; gap: 6px; }
  .ligne {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    padding: 8px 10px; border: 1px solid var(--v2-line); border-radius: 6px;
  }
  .nom { font-size: 13px; color: var(--v2-txt); font-weight: 600; }
  .meta { font-size: 12px; color: var(--v2-txt3); }
  .actuel { margin-left: auto; font-size: 12px; color: var(--v2-acc1); }
  .lnk {
    margin-left: auto;
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.5; cursor: default; }
  .lnk.danger { color: var(--v2-danger); }
  .lnk.danger:hover:not(:disabled) { border-color: var(--v2-danger); color: var(--v2-danger); }
</style>
