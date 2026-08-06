<script lang="ts">
  // Geste « Signaler » unique pour toute donnée enrichie (pochette, image ou
  // bio d'artiste, crédit…). Un drapeau + un choix de raison ; l'appel part sur
  // POST /library/reports, qui enregistre en local et transmet au cloud
  // communautaire quand le partage est activé.
  import * as api from '../lib/api';
  import type { ReportEntity } from '../lib/api';
  import { t as tr } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';

  interface Props {
    entity: ReportEntity;
    entityId?: number;
    mbid?: string;
    field?: string;
    value?: string;
    /** Raisons proposées (clés i18n `report.reason.*`). */
    reasons?: string[];
    /** Appelé après un signalement accepté (rafraîchir l'affichage). */
    onReported?: () => void;
    compact?: boolean;
  }
  let {
    entity,
    entityId,
    mbid,
    field,
    value,
    reasons = ['incorrect', 'wrong_entity', 'poor_quality', 'offensive'],
    onReported,
    compact = false,
  }: Props = $props();

  let open = $state(false);
  let sending = $state(false);

  async function send(reason: string) {
    open = false;
    sending = true;
    try {
      const res = await api.reportMetadata({ entity, entity_id: entityId, mbid, field, value, reason });
      notifications.success(
        res.pushed ? $tr('report.sentShared') : $tr('report.sentLocal')
      );
      onReported?.();
    } catch (e) {
      console.error('Report error:', e);
      notifications.error($tr('report.failed'));
    }
    sending = false;
  }
</script>

<div class="report-wrap">
  <button
    class="report-btn"
    class:compact
    title={$tr('report.action')}
    aria-label={$tr('report.action')}
    disabled={sending}
    onclick={() => (open = !open)}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
    {#if !compact}<span>{$tr('report.action')}</span>{/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="report-backdrop" onclick={() => (open = false)}></div>
    <div class="report-menu">
      <div class="report-menu-title">{$tr('report.chooseReason')}</div>
      {#each reasons as reason}
        <button class="report-menu-item" onclick={() => send(reason)}>
          {$tr(`report.reason.${reason}` as any)}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .report-wrap { position: relative; display: inline-flex; }

  .report-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--tune-border);
    border-radius: 4px;
    background: transparent;
    color: var(--tune-text-muted);
    cursor: pointer;
    font-size: 11px;
    opacity: 0.6;
    transition: opacity 0.15s, color 0.15s;
  }
  .report-btn:hover:not(:disabled) { opacity: 1; color: var(--tune-accent); }
  .report-btn:disabled { cursor: default; opacity: 0.35; }
  .report-btn.compact { padding: 4px; }

  .report-backdrop { position: fixed; inset: 0; z-index: 40; }

  .report-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 41;
    min-width: 190px;
    padding: 4px;
    border: 1px solid var(--tune-border);
    border-radius: 6px;
    background: var(--tune-bg-elevated, var(--tune-bg));
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  }

  .report-menu-title {
    padding: 6px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--tune-text-muted);
  }

  .report-menu-item {
    display: block;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--tune-text);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .report-menu-item:hover { background: var(--tune-bg-hover, rgba(127, 127, 127, 0.14)); }
</style>
