<script lang="ts">
  /**
   * Surveillance du serveur — monté dans Tune Health (vue `diagnostics`).
   *
   * Phase 5 (web#1257) : trois lectures n'avaient de chemin que par l'ancienne
   * coquille, et partent avec elle.
   *
   *  - `getHealthMonitor` : la pastille d'état de l'ancienne barre latérale
   *    (`Sidebar.svelte`, sondée toutes les 60 s). Ici : l'état, les contrôles
   *    et les alertes récentes, lus à l'ouverture de l'écran.
   *  - `getBackgroundTasks` : l'état initial du bandeau « tâche de fond » que
   *    montait `App.svelte`. Ici : la liste des tâches en cours.
   *  - `rearmAsioWarmScan` : le bandeau « balayage ASIO suspendu après un
   *    plantage » de `DiagnosticsView`. L'état vient de `getServerDiagnostics`,
   *    que Tune Health lit déjà : il est passé en propriété, pas relu.
   *
   * Un serveur qui ne connaît pas une route ne fait rien apparaître : chaque
   * bloc se tait plutôt que d'afficher un état inventé.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { get } from 'svelte/store';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { errText } from '../../lib/utils';
  import type { TacheDeFond } from '../../lib/tachesDeFond';

  let { asio = null }: { asio?: api.AsioWarmScanStatus | null } = $props();

  let moniteur = $state<api.HealthMonitorResponse | null>(null);
  let moniteurLu = $state(false);
  let taches = $state<TacheDeFond[] | null>(null);
  let rearmement = $state(false);
  let rearme = $state(false);

  $effect(() => {
    api.getHealthMonitor()
      .then((r) => { moniteur = r; })
      .catch(() => { moniteur = null; })
      .finally(() => { moniteurLu = true; });
    api.getBackgroundTasks()
      .then((r) => { taches = r?.tasks ?? []; })
      .catch(() => { taches = null; });
  });

  const ETAT: Record<string, string> = {
    ok: 'v2.sys.monitorOk',
    warning: 'v2.sys.monitorWarning',
    critical: 'v2.sys.monitorCritical',
  };

  async function rearmer() {
    const tr = get(t);
    if (!(await dialogs.confirm(tr('diagnostics.asioWarmConfirm' as any)))) return;
    rearmement = true;
    try {
      await api.rearmAsioWarmScan();
      rearme = true;
      notifications.success(tr('diagnostics.asioWarmRearmed' as any));
    } catch (e) {
      notifications.error(errText(e) ?? tr('common.error' as any));
    } finally {
      rearmement = false;
    }
  }

  const pct = (p?: { processed: number; total: number }) =>
    p && p.total > 0 ? Math.min(100, Math.round((p.processed / p.total) * 100)) : null;
</script>

{#if rearme}
  <section class="bloc asio pret" aria-live="polite">
    <strong>{$t('diagnostics.asioWarmRearmed' as any)}</strong>
  </section>
{:else if asio?.blocked_after_crash}
  <section class="bloc asio" role="alert">
    <div class="texte">
      <strong>{$t('diagnostics.asioWarmTitle' as any)}</strong>
      <span>{$t('diagnostics.asioWarmMessage' as any)}</span>
    </div>
    <button class="lnk rearmer" disabled={rearmement} onclick={rearmer}>
      {rearmement ? $t('diagnostics.asioWarmRearming' as any) : $t('diagnostics.asioWarmRearm' as any)}
    </button>
  </section>
{/if}

<section class="bloc surveillance">
  <h2>{$t('v2.sys.monitorTitle' as any)}</h2>
  {#if moniteur}
    <p class="etat {moniteur.status}">{$t((ETAT[moniteur.status] ?? 'v2.sys.monitorWarning') as any)}</p>
    {#if moniteur.checks && Object.keys(moniteur.checks).length}
      <div class="controles">
        {#each Object.entries(moniteur.checks) as [nom, c] (nom)}
          <span class="controle {c?.status ?? ''}">{nom}</span>
        {/each}
      </div>
    {/if}
    {#if moniteur.alerts?.length}
      <h3>{$t('v2.sys.alertsTitle' as any)}</h3>
      <ul class="alertes">
        {#each moniteur.alerts.slice(0, 10) as a, i (i)}
          <li class="alerte {a.level}">
            <span class="cat">{a.category}</span>
            <span class="msg">{a.message}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if moniteurLu}
    <p class="hint">{$t('v2.sys.monitorUnavailable' as any)}</p>
  {/if}
</section>

{#if taches !== null}
  <section class="bloc taches">
    <h2>{$t('v2.sys.tasksTitle' as any)}</h2>
    {#if !taches.length}
      <p class="hint">{$t('v2.sys.tasksNone' as any)}</p>
    {:else}
      <ul class="liste">
        {#each taches as tache (tache.id)}
          {@const p = pct(tache.progress)}
          <li class="tache">
            <span class="nom">{tache.label || $t('app.enrichmentRunning' as any)}</span>
            {#if tache.progress && tache.progress.total > 0}
              <span class="hint">{tache.progress.detail ? `${tache.progress.detail} · ` : ''}{tache.progress.processed} / {tache.progress.total}</span>
            {/if}
            {#if p !== null}
              <div class="barre"><span style="width:{p}%"></span></div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .bloc {
    display: flex; flex-direction: column; gap: 8px; margin-top: 18px;
    border: 1px solid var(--v2-line); border-radius: var(--v2-r-card); padding: 14px 16px;
    background: var(--v2-surface);
  }
  h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--v2-txt); }
  h3 { margin: 4px 0 0; font-size: 13px; font-weight: 600; color: var(--v2-txt2); }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }

  .asio { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; border-color: var(--v2-danger-bd); }
  .asio.pret { border-color: var(--v2-acc1); }
  .texte { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--v2-txt2); }
  .texte strong { color: var(--v2-txt); }

  .etat { margin: 0; font-size: 13px; font-weight: 600; }
  .etat.ok { color: var(--v2-acc1); }
  .etat.warning { color: var(--v2-acc2); }
  .etat.critical { color: var(--v2-danger); }

  .controles { display: flex; flex-wrap: wrap; gap: 6px; }
  .controle {
    font-size: 12px; padding: 2px 8px; border-radius: var(--v2-r-pill);
    border: 1px solid var(--v2-line); color: var(--v2-txt2);
  }
  .controle.ok { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .controle.warning { border-color: var(--v2-acc2); color: var(--v2-acc2); }
  .controle.critical { border-color: var(--v2-danger); color: var(--v2-danger); }

  .alertes, .liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .alerte { display: flex; gap: 8px; font-size: 12px; color: var(--v2-txt2); }
  .alerte.warning .cat { color: var(--v2-acc2); }
  .alerte.critical .cat { color: var(--v2-danger); }
  .cat { font-weight: 600; flex: 0 0 auto; }
  .msg { min-width: 0; overflow-wrap: anywhere; }

  .tache { display: flex; flex-direction: column; gap: 4px; }
  .nom { font-size: 13px; color: var(--v2-txt); }
  .barre { height: 4px; border-radius: 2px; background: var(--v2-line); overflow: hidden; }
  .barre span { display: block; height: 100%; background: var(--v2-acc1); }

  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }
</style>
