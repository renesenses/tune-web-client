<script lang="ts">
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  // --- Changelog data per version (hardcoded, latest first) ---
  interface ChangelogEntry {
    version: string;
    date: string;
    features: string[];
    fixes: string[];
    improvements: string[];
  }

  let changelog = $state<ChangelogEntry[]>([]);
  let serverVersion = $state<string | null>(null);
  let loading = $state(true);

  $effect(() => {
    Promise.all([
      api.checkForUpdate().then((r) => { serverVersion = r?.current_version ?? null; }).catch(() => {}),
      fetch(`/api/v1/system/changelog?limit=10`)
        .then(r => r.ok ? r.json() : Promise.reject('not ok'))
        .then((data: any) => {
          const entries = data?.entries ?? data;
          if (!Array.isArray(entries)) return;
          changelog = entries.map((e: any) => {
            if (e.features || e.fixes || e.improvements) return e;
            const sections = e.sections ?? [];
            const find = (titles: string[]) => sections.find((s: any) => titles.some(t => (s.title || '').toLowerCase().includes(t)))?.items ?? [];
            return {
              version: e.version ?? '',
              date: e.date ?? '',
              features: find(['nouveaut', 'feature', 'new']),
              fixes: find(['correction', 'fix', 'bug']),
              improvements: find(['amélioration', 'improvement', 'perf', 'optim']),
            };
          }).filter((e: any) => e.version);
        })
        .catch(() => {}),
    ]).finally(() => { loading = false; });
  });

  let currentEntry = $derived(
    serverVersion
      ? changelog.find((e) => e.version === serverVersion) ?? changelog[0]
      : changelog[0]
  );

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function close() {
    // Mark current version as seen
    const ver = serverVersion ?? changelog[0]?.version;
    if (ver) {
      localStorage.setItem('tune_last_seen_version', ver);
    }
    onClose();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="whatsnew-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <div class="whatsnew-modal">
    <div class="whatsnew-header">
      <div class="whatsnew-title-row">
        <svg class="whatsnew-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        <h2>{$t('whatsnew.title')}</h2>
      </div>
      <button class="whatsnew-close-btn" onclick={close} title={$t('whatsnew.close')} aria-label={$t('whatsnew.close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="whatsnew-body">
      {#if loading}
        <div class="whatsnew-loading">
          <div class="spinner"></div>
          <span>{$t('whatsnew.loading')}</span>
        </div>
      {:else}
        {#each changelog as entry, i}
          <div class="whatsnew-version" class:current={entry.version === currentEntry?.version}>
            <div class="version-badge">
              <span class="version-tag">v{entry.version}</span>
              <span class="version-date">{entry.date}</span>
              {#if i === 0}
                <span class="version-latest-badge">Latest</span>
              {/if}
            </div>

            {#if entry.features.length > 0}
              <div class="change-group">
                <h4 class="change-group-title features-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {$t('whatsnew.newFeatures')}
                </h4>
                <ul class="change-list">
                  {#each entry.features as item}
                    <li class="change-item feature">{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if entry.improvements.length > 0}
              <div class="change-group">
                <h4 class="change-group-title improvements-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  {$t('whatsnew.improvements')}
                </h4>
                <ul class="change-list">
                  {#each entry.improvements as item}
                    <li class="change-item improvement">{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if entry.fixes.length > 0}
              <div class="change-group">
                <h4 class="change-group-title fixes-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  {$t('whatsnew.fixes')}
                </h4>
                <ul class="change-list">
                  {#each entry.fixes as item}
                    <li class="change-item fix">{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>

          {#if i < changelog.length - 1}
            <div class="version-separator"></div>
          {/if}
        {/each}
      {/if}
    </div>

    <div class="whatsnew-footer">
      <button class="whatsnew-close-action" onclick={close}>
        {$t('whatsnew.close')}
      </button>
    </div>
  </div>
</div>

<style>
  .whatsnew-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 210;
    animation: fadeIn 0.15s ease-out;
    backdrop-filter: blur(4px);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .whatsnew-modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-xl);
    width: 480px;
    max-width: 92vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s ease-out;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1) inset;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .whatsnew-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--tune-border);
  }

  .whatsnew-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .whatsnew-icon {
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .whatsnew-header h2 {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  .whatsnew-close-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    transition: color 0.12s;
  }

  .whatsnew-close-btn:hover {
    color: var(--tune-text);
  }

  .whatsnew-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    scrollbar-width: thin;
    scrollbar-color: var(--tune-border) transparent;
  }

  .whatsnew-body::-webkit-scrollbar {
    width: 6px;
  }
  .whatsnew-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .whatsnew-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 0;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .whatsnew-version {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .whatsnew-version.current {
    /* subtle highlight for the current version */
  }

  .version-badge {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .version-tag {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 700;
    color: var(--tune-text);
    background: rgba(107, 110, 217, 0.15);
    padding: 3px 10px;
    border-radius: var(--radius-md);
    letter-spacing: 0.02em;
  }

  .version-date {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .version-latest-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-accent);
    background: rgba(107, 110, 217, 0.12);
    padding: 2px 8px;
    border-radius: 999px;
  }

  .version-separator {
    height: 1px;
    background: var(--tune-border);
    margin: 20px 0;
  }

  .change-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .change-group-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin: 0;
  }

  .features-title {
    color: #4ade80;
  }

  .improvements-title {
    color: #60a5fa;
  }

  .fixes-title {
    color: #fbbf24;
  }

  .change-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .change-item {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    padding-left: 20px;
    position: relative;
    line-height: 1.5;
  }

  .change-item::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .change-item.feature::before {
    background: #4ade80;
  }

  .change-item.improvement::before {
    background: #60a5fa;
  }

  .change-item.fix::before {
    background: #fbbf24;
  }

  .whatsnew-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--tune-border);
    display: flex;
    justify-content: flex-end;
  }

  .whatsnew-close-action {
    padding: 8px 24px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
  }

  .whatsnew-close-action:hover {
    background: var(--tune-accent-hover);
  }

  @media (max-width: 768px) {
    .whatsnew-modal {
      width: 100%;
      max-width: 100%;
      max-height: 100%;
      height: 100%;
      border-radius: 0;
    }
  }
</style>
