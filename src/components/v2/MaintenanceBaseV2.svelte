<script lang="ts">
  /**
   * Entretien de la base — Réglages › Système › Base de données.
   *
   * Phase 5 (web#1257) : ces gestes n'existaient que dans l'ancienne interface,
   * répartis entre `SettingsView` (export, import, index de recherche) et
   * `MetadataView` (sauvegardes). Sans ce bloc, retirer `?v2=0` retirait avec
   * lui le seul moyen de restaurer une sauvegarde depuis l'interface.
   *
   * Les deux gestes qui REMPLACENT la base (restaurer une sauvegarde, importer
   * un fichier) passent par la confirmation `danger` du nouveau client, jamais
   * par `window.confirm` (#166 : muette dans les webviews).
   *
   * Sauvegardes : SQLite seulement — le serveur rend une liste vide et refuse
   * la création sur PostgreSQL (`routes/system/backup.rs`, `require_sqlite_store`).
   * L'écran le dit au lieu d'offrir un bouton qui échouerait.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { get } from 'svelte/store';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { dateSimple } from '../../lib/dates';
  import type { BackupInfo } from '../../lib/types';

  let { moteur = null }: { moteur?: string | null } = $props();
  const sqlite = $derived(moteur === 'sqlite');

  let sauvegardes = $state<BackupInfo[]>([]);
  let creation = $state(false);
  let restauration = $state<string | null>(null);
  let msgSauvegarde = $state<{ texte: string; ok: boolean } | null>(null);

  let importEnCours = $state(false);
  let msgImport = $state<{ texte: string; ok: boolean } | null>(null);

  let reconstruction = $state(false);
  let msgIndex = $state<{ texte: string; ok: boolean } | null>(null);

  async function chargerSauvegardes() {
    try { sauvegardes = (await api.getBackups()) ?? []; }
    catch { sauvegardes = []; }
  }
  $effect(() => { if (sqlite) void chargerSauvegardes(); });

  function taille(octets: number): string {
    if (octets < 1024) return `${octets} B`;
    if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} KB`;
    return `${(octets / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function creer() {
    const tr = get(t);
    creation = true;
    msgSauvegarde = null;
    try {
      await api.createBackup();
      await chargerSauvegardes();
      msgSauvegarde = { texte: tr('maintenance.backupCreated' as any), ok: true };
    } catch {
      msgSauvegarde = { texte: tr('maintenance.backupError' as any), ok: false };
    } finally {
      creation = false;
    }
  }

  async function restaurer(fichier: string) {
    const tr = get(t);
    if (!(await dialogs.confirm(tr('maintenance.restoreConfirm' as any), { danger: true }))) return;
    restauration = fichier;
    msgSauvegarde = null;
    try {
      await api.restoreBackup(fichier);
      msgSauvegarde = { texte: `${tr('maintenance.restoreSuccess' as any)}. ${tr('settings.restartToApply' as any)}`, ok: true };
    } catch {
      msgSauvegarde = { texte: tr('maintenance.restoreError' as any), ok: false };
    } finally {
      restauration = null;
    }
  }

  async function importer(e: Event) {
    const tr = get(t);
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const ok = await dialogs.confirm(tr('settings.importDbConfirm' as any).replace('{name}', f.name), { danger: true });
    if (!ok) return;
    importEnCours = true;
    msgImport = null;
    try {
      const r = await api.importDatabase(f);
      msgImport = {
        texte: `${tr('settings.importDbSuccess' as any)} (${(r.size / 1024 / 1024).toFixed(1)} MB). ${tr('settings.restartToApply' as any)}`,
        ok: true,
      };
    } catch (err: any) {
      msgImport = { texte: `${tr('settings.importDbError' as any)} : ${err?.message ?? ''}`, ok: false };
    } finally {
      importEnCours = false;
    }
  }

  async function reconstruire() {
    const tr = get(t);
    reconstruction = true;
    msgIndex = null;
    try {
      const r = await api.rebuildFts();
      msgIndex = { texte: `${tr('settings.ftsRebuilt' as any)} : ${r.rows_indexed} ${tr('settings.recordsIndexed' as any)}`, ok: true };
    } catch (err: any) {
      msgIndex = { texte: `${tr('common.error' as any)} : ${err?.message ?? ''}`, ok: false };
      notifications.error(tr('common.error' as any));
    } finally {
      reconstruction = false;
    }
  }
</script>

<div class="mb">
  <!-- Sauvegardes -->
  <div class="bloc">
    <h4>{$t('maintenance.backupRestore' as any)}</h4>
    {#if !sqlite}
      <p class="hint">{$t('v2.maint.backupsSqliteOnly' as any)}</p>
    {:else}
      <div class="inline">
        <button class="lnk creer" disabled={creation} onclick={creer}>
          {creation ? $t('common.loading' as any) : $t('maintenance.createBackup' as any)}
        </button>
      </div>
      {#if !sauvegardes.length}
        <p class="hint">{$t('maintenance.noBackups' as any)}</p>
      {:else}
        <ul class="liste">
          {#each sauvegardes as b (b.filename)}
            <li class="sauvegarde">
              <span class="nom mono">{b.filename}</span>
              <span class="meta">{$dateSimple(b.created_at)} · {taille(b.size)}</span>
              <button class="lnk danger restaurer" disabled={restauration !== null}
                onclick={() => restaurer(b.filename)}>
                {restauration === b.filename ? $t('common.loading' as any) : $t('maintenance.restore' as any)}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if msgSauvegarde}<div class={msgSauvegarde.ok ? 'okline' : 'errline'}>{msgSauvegarde.texte}</div>{/if}
    {/if}
  </div>

  <!-- Export / import de la base -->
  <div class="bloc">
    <h4>{$t('v2.maint.importExport' as any)}</h4>
    <div class="inline">
      <a class="lnk exporter" href={api.exportDatabaseUrl()} download>{$t('settings.exportDatabase' as any)}</a>
      <label class="lnk fichier" class:off={importEnCours}>
        {importEnCours ? $t('settings.importInProgress' as any) : $t('settings.importFile' as any)}
        <input class="importer" type="file" accept=".db,.sqlite,.sqlite3,.sql" disabled={importEnCours} onchange={importer} />
      </label>
    </div>
    {#if msgImport}<div class={msgImport.ok ? 'okline' : 'errline'}>{msgImport.texte}</div>{/if}
  </div>

  <!-- Index de recherche -->
  <div class="bloc">
    <h4>{$t('settings.searchIndex' as any)}</h4>
    <p class="hint">{$t('settings.rebuildIndexHint' as any)}</p>
    <div class="inline">
      <button class="lnk reconstruire" disabled={reconstruction} onclick={reconstruire}>
        {reconstruction ? $t('settings.rebuilding' as any) : $t('settings.rebuildIndex' as any)}
      </button>
    </div>
    {#if msgIndex}<div class={msgIndex.ok ? 'okline' : 'errline'}>{msgIndex.texte}</div>{/if}
  </div>
</div>

<style>
  .mb { display: flex; flex-direction: column; gap: 16px; margin-top: 14px; }
  .bloc { display: flex; flex-direction: column; gap: 8px; }
  h4 { margin: 0; font-size: 13px; font-weight: 600; color: var(--v2-txt); }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .okline { font-size: 13px; color: var(--v2-acc1); }
  .errline { font-size: 13px; color: var(--v2-danger); }
  .mono { font-family: var(--v2-mono); }

  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
    text-decoration: none;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled, .lnk.off { opacity: 0.45; cursor: default; }
  .lnk.danger { color: var(--v2-danger); }
  .lnk.danger:hover:not(:disabled) { border-color: var(--v2-danger); color: var(--v2-danger); }

  /* Le sélecteur de fichier natif est masqué : c'est le label qui porte le bouton. */
  .fichier { position: relative; overflow: hidden; }
  .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  .liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .sauvegarde {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    border: 1px solid var(--v2-line); border-radius: 6px; padding: 6px 10px;
  }
  .nom { font-size: 12px; flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
  .meta { font-size: 12px; color: var(--v2-txt3); }
</style>
