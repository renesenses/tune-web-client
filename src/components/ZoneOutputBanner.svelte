<script lang="ts">
  /**
   * Dit à l'utilisateur que le son de cette zone ne va nulle part (#1499).
   *
   * Une zone sans sortie, ou une zone navigateur qu'aucun onglet n'écoute,
   * se comporte en tout point comme une lecture réussie : la file se remplit,
   * la position avance, les commandes répondent. Seul le son manque. Le
   * serveur ne le disait que dans ses journaux — Bilou a ouvert deux fils
   * forum sur un défaut BluOS inexistant avant qu'on les lise.
   *
   * Le message dit quoi faire, pas seulement ce qui ne va pas.
   */
  import { t } from '../lib/i18n';
  import { activeView } from '../lib/stores/navigation';
  import type { Zone } from '../lib/types';

  let { zone }: { zone: Zone | null } = $props();

  // Un serveur plus ancien n'envoie pas le champ : pas de champ, pas de
  // bandeau. On ne devine rien à partir de `online`.
  let reach = $derived(zone?.output_reach);
  let visible = $derived(reach === 'no_output' || reach === 'browser_unattended');
</script>

{#if visible}
  <div class="zone-output-banner" role="status">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
    <span>
      {reach === 'no_output'
        ? $t('zone.noOutputBanner')
        : $t('zone.browserUnattendedBanner')}
    </span>
    {#if reach === 'no_output'}
      <button class="zone-output-banner-action" onclick={() => activeView.set('zonemanager')}>
        {$t('zone.noOutputBannerAction')}
      </button>
    {/if}
  </div>
{/if}

<style>
  .zone-output-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.9rem;
    margin: 0 0 0.75rem;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: var(--text, #e6e6e6);
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .zone-output-banner svg {
    flex: 0 0 auto;
    color: #f59e0b;
  }
  .zone-output-banner span {
    flex: 1 1 auto;
  }
  .zone-output-banner-action {
    flex: 0 0 auto;
    background: transparent;
    border: 1px solid rgba(245, 158, 11, 0.55);
    color: inherit;
    border-radius: 999px;
    padding: 0.25rem 0.7rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .zone-output-banner-action:hover {
    background: rgba(245, 158, 11, 0.2);
  }
</style>
