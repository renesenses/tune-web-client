<script lang="ts">
  /**
   * Écoute hors ligne — section des Réglages v2 (onglet Bibliothèque).
   *
   * Porté depuis `OfflineView.svelte` avant la phase 5 (web#1257), qui retire
   * l'ancienne interface : sans ce bloc, plus aucun écran n'atteignait
   * `getOfflineStatus`, `getOfflineDownloads`, `syncOffline`,
   * `removeOfflineDownload` ni `clearOffline`. Les cinq routes existent et
   * répondent (`tune-server/src/routes/offline.rs`).
   *
   * La lecture du contrat vit dans `lib/horsLigne` : l'ancien écran lisait des
   * champs que le serveur n'envoie pas (voir ce module).
   */
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { errText } from '../../lib/utils';
  import {
    lireEtat, lireTelechargements, tailleLisible,
    type EtatHorsLigne, type StatutHorsLigne, type TelechargementHorsLigne,
  } from '../../lib/horsLigne';

  let etat = $state<EtatHorsLigne | null>(null);
  let liste = $state<TelechargementHorsLigne[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);
  let synchro = $state(false);
  let effacement = $state(false);
  let retrait = $state<string | null>(null);

  const CLE_STATUT: Record<StatutHorsLigne, string> = {
    complete: 'v2.offline.stDone',
    downloading: 'v2.offline.stDownloading',
    pending: 'v2.offline.stPending',
    error: 'v2.offline.stError',
    missing: 'v2.offline.stMissing',
    autre: 'v2.offline.stPending',
  };

  async function charger() {
    chargement = true;
    erreur = null;
    try {
      const [s, d] = await Promise.all([api.getOfflineStatus(), api.getOfflineDownloads()]);
      etat = lireEtat(s);
      liste = lireTelechargements(d);
    } catch (e) {
      erreur = errText(e) ?? get(t)('common.error' as any);
    } finally {
      chargement = false;
    }
  }

  async function synchroniser() {
    synchro = true;
    try {
      await api.syncOffline();
      notifications.success(get(t)('offline.syncStarted' as any));
      await charger();
    } catch (e) {
      notifications.error(errText(e) || get(t)('offline.syncError' as any));
    } finally {
      synchro = false;
    }
  }

  async function toutEffacer() {
    if (!(await dialogs.confirm(get(t)('offline.clearConfirm' as any), { danger: true }))) return;
    effacement = true;
    try {
      await api.clearOffline();
      notifications.success(get(t)('offline.allCleared' as any));
      await charger();
    } catch (e) {
      notifications.error(errText(e) ?? get(t)('common.error' as any));
    } finally {
      effacement = false;
    }
  }

  async function retirer(id: string) {
    retrait = id;
    try {
      await api.removeOfflineDownload(id);
      liste = liste.filter((d) => d.id !== id);
      try { etat = lireEtat(await api.getOfflineStatus()); } catch { /* l'état se relira au prochain passage */ }
    } catch (e) {
      notifications.error(errText(e) ?? get(t)('common.error' as any));
    } finally {
      retrait = null;
    }
  }

  $effect(() => { charger(); });
</script>

<div class="hl">
  <p class="hint">{$t('v2.offline.hint' as any)}</p>

  {#if etat}
    <div class="chiffres">
      <span class="pastille">{etat.total} {etat.total !== 1 ? $t('common.tracks' as any) : $t('offline.trackSingular' as any)}</span>
      <span class="pastille">{tailleLisible(etat.taille)}</span>
      {#if etat.enAttente > 0}
        <span class="pastille attente">{etat.enAttente} {$t('offline.pending' as any)}</span>
      {/if}
    </div>
  {/if}

  <div class="inline">
    <button class="lnk synchro" disabled={synchro || chargement} onclick={synchroniser}>
      {synchro ? $t('common.loading' as any) : $t('offline.sync' as any)}
    </button>
    <button class="lnk danger effacer" disabled={effacement || !liste.length} onclick={toutEffacer}>
      {$t('offline.clearAll' as any)}
    </button>
  </div>

  {#if erreur}
    <div class="errline">{erreur}</div>
  {:else if chargement}
    <p class="hint">{$t('common.loading' as any)}</p>
  {:else if !liste.length}
    <p class="hint">{$t('offline.empty' as any)} — {$t('offline.emptyHint' as any)}</p>
  {:else}
    <ul class="pistes">
      {#each liste as d (d.id)}
        <li class="piste" class:ko={d.statut === 'error' || d.statut === 'missing'}>
          <span class="txt">
            <span class="titre">{d.titre || '—'}</span>
            <span class="meta">{d.artiste}{d.album ? ` — ${d.album}` : ''}</span>
          </span>
          <span class="statut" title={d.erreur ?? ''}>{$t(CLE_STATUT[d.statut] as any)}</span>
          {#if d.taille}<span class="taille">{tailleLisible(d.taille)}</span>{/if}
          <button class="lnk retirer" disabled={retrait === d.id} onclick={() => retirer(d.id)}>
            {$t('common.delete' as any)}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .hl { display: flex; flex-direction: column; gap: 10px; }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .errline { font-size: 13px; color: var(--v2-danger); }
  .chiffres { display: flex; flex-wrap: wrap; gap: 8px; }
  .pastille {
    font-size: 12px; color: var(--v2-txt2); border: 1px solid var(--v2-line);
    border-radius: 999px; padding: 2px 10px;
  }
  .pastille.attente { color: var(--v2-acc1); border-color: var(--v2-acc1); }
  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.5; cursor: default; }
  .lnk.danger { color: var(--v2-danger); }
  .pistes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .piste {
    display: flex; align-items: center; gap: 12px; padding: 6px 0;
    border-bottom: 1px solid var(--v2-line);
  }
  .piste.ko .statut { color: var(--v2-danger); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .titre, .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .titre { font-size: 13px; color: var(--v2-txt); }
  .meta { font-size: 12px; color: var(--v2-txt3); }
  .statut, .taille { font-size: 12px; color: var(--v2-txt3); white-space: nowrap; }
</style>
