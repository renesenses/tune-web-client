<script lang="ts">
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import type { BrowseRootEntry } from '../lib/types';

  interface Props {
    onClose: () => void;
    onMusicDirsChanged: () => void;
  }
  let { onClose, onMusicDirsChanged }: Props = $props();

  let step = $state(1);
  const totalSteps = 3;

  // Step 1: Folder path
  let folderPath = $state('');
  let currentDirs = $state<BrowseRootEntry[]>([]);
  let loadingDirs = $state(false);

  // Step 2: Add & Scan
  let adding = $state(false);
  let added = $state(false);
  let addError = $state<string | null>(null);
  let scanningLibrary = $state(false);
  let scanStarted = $state(false);

  // Load current music dirs on init
  async function loadCurrentDirs() {
    loadingDirs = true;
    try {
      const br = await api.getBrowseRoots();
      currentDirs = br.roots || [];
    } catch {
      currentDirs = [];
    }
    loadingDirs = false;
  }

  loadCurrentDirs();

  function selectHint(path: string) {
    folderPath = path;
  }

  function canGoToStep2() {
    return folderPath.trim().length > 0;
  }

  async function addDirectory() {
    if (!folderPath.trim()) return;
    adding = true;
    addError = null;
    try {
      await api.addMusicDir(folderPath.trim());
      added = true;
      onMusicDirsChanged();
    } catch (e: any) {
      addError = e?.message || 'Erreur lors de l\'ajout du dossier';
    }
    adding = false;
  }

  async function startScan() {
    scanningLibrary = true;
    try {
      await api.triggerScan(folderPath.trim());
      scanStarted = true;
    } catch (e: any) {
      if (e?.message?.includes('409') || e?.message?.includes('already')) {
        scanStarted = true;
      } else {
        notifications.error(e?.message || 'Erreur lors du scan');
      }
    }
    scanningLibrary = false;
  }

  function goToStep(s: number) {
    if (s === 2 && !added) {
      addDirectory().then(() => {
        if (added) step = s;
      });
    } else {
      step = s;
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={handleOverlayClick}>
  <div class="modal-panel">
    <!-- Header -->
    <div class="wizard-header">
      <div class="wizard-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <h3>Ajouter un dossier local</h3>
      </div>
      <button class="close-btn" onclick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Progress -->
    <div class="wizard-progress">
      {#each Array(totalSteps) as _, i}
        <div class="progress-step" class:active={step === i + 1} class:done={step > i + 1}>
          <span class="step-number">{i + 1}</span>
        </div>
        {#if i < totalSteps - 1}
          <div class="progress-line" class:done={step > i + 1}></div>
        {/if}
      {/each}
    </div>

    <!-- Step 1: Select Folder -->
    {#if step === 1}
      <div class="wizard-body">
        <p class="wizard-desc">Entrez le chemin absolu du dossier contenant votre musique.</p>

        <div class="form-group">
          <label class="form-label">Chemin du dossier</label>
          <input
            type="text"
            class="auth-input"
            placeholder="/chemin/vers/votre/musique"
            bind:value={folderPath}
            onkeydown={(e) => { if (e.key === 'Enter' && canGoToStep2()) goToStep(2); }}
          />
        </div>

        <div class="hint-chips">
          <span class="hint-label">Chemins courants :</span>
          <div class="chips-row">
            <button class="hint-chip" onclick={() => selectHint('~/Music')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              ~/Music
              <span class="chip-platform">macOS</span>
            </button>
            <button class="hint-chip" onclick={() => selectHint('/home/user/Music')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              /home/user/Music
              <span class="chip-platform">Linux</span>
            </button>
            <button class="hint-chip" onclick={() => selectHint('C:\\Users\\User\\Music')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              C:\Users\...\Music
              <span class="chip-platform">Windows</span>
            </button>
          </div>
        </div>

        {#if currentDirs.length > 0}
          <div class="current-dirs">
            <span class="list-label">Dossiers actuels :</span>
            {#each currentDirs as dir}
              <div class="current-dir-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span class="dir-path">{dir.path}</span>
                <span class="dir-tracks">{dir.track_count} pistes</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="wizard-footer">
        <button class="btn-secondary" onclick={onClose}>Annuler</button>
        <button class="btn-primary" onclick={() => goToStep(2)} disabled={!canGoToStep2() || adding}>
          {#if adding}
            <div class="spinner small"></div>
            Ajout...
          {:else}
            Ajouter
          {/if}
        </button>
      </div>

    <!-- Step 2: Preview & Scan -->
    {:else if step === 2}
      <div class="wizard-body">
        {#if addError}
          <div class="wizard-error">{addError}</div>
          <button class="scan-btn" onclick={() => { addError = null; step = 1; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Modifier le chemin
          </button>
        {:else}
          <div class="wizard-success">
            Dossier ajoute !
            <span class="mount-path">{folderPath}</span>
          </div>

          {#if !scanStarted}
            <p class="wizard-desc">Lancez un scan pour indexer les fichiers audio de ce dossier.</p>
            <button class="scan-btn" onclick={startScan} disabled={scanningLibrary}>
              {#if scanningLibrary}
                <div class="spinner small"></div>
                Lancement du scan...
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Lancer le scan
              {/if}
            </button>
          {:else}
            <div class="wizard-success">Scan de la bibliotheque lance</div>
          {/if}
        {/if}
      </div>

      <div class="wizard-footer">
        <button class="btn-secondary" onclick={() => { step = 1; added = false; addError = null; }}>Retour</button>
        <button class="btn-primary" onclick={() => goToStep(3)}>
          Suivant
        </button>
      </div>

    <!-- Step 3: Done -->
    {:else if step === 3}
      <div class="wizard-body">
        <div class="done-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h4 class="done-title">Configuration terminee</h4>
        <div class="summary">
          <div class="summary-row">
            <span class="summary-label">Dossier</span>
            <span class="summary-value mono">{folderPath}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Bibliotheque</span>
            <span class="summary-value">{added ? 'Ajoute' : 'Non ajoute'}</span>
          </div>
          {#if scanStarted}
            <div class="summary-row">
              <span class="summary-label">Scan</span>
              <span class="summary-value">En cours</span>
            </div>
          {/if}
        </div>
      </div>

      <div class="wizard-footer">
        <button class="btn-primary" onclick={onClose}>Fermer</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal-panel {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    width: 520px;
    max-width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
  }

  .wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px 0;
  }

  .wizard-title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--tune-text);
  }

  .wizard-title h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .wizard-title svg {
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s;
  }

  .close-btn:hover {
    color: var(--tune-text);
  }

  /* Progress */
  .wizard-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 16px 20px 8px;
  }

  .progress-step {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--tune-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-muted);
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .progress-step.active {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(117, 116, 243, 0.1);
  }

  .progress-step.done {
    border-color: var(--tune-accent);
    background: var(--tune-accent);
    color: white;
  }

  .progress-line {
    width: 40px;
    height: 2px;
    background: var(--tune-border);
    transition: background 0.2s;
  }

  .progress-line.done {
    background: var(--tune-accent);
  }

  /* Body */
  .wizard-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    overflow-y: auto;
  }

  .wizard-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  /* Footer */
  .wizard-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 20px;
    border-top: 1px solid var(--tune-border);
  }

  /* Buttons */
  .scan-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .scan-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .scan-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .btn-primary {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    padding: 8px 20px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  .btn-secondary {
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 8px 20px;
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-secondary:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  /* Form */
  .auth-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.12s;
  }

  .auth-input:focus { border-color: var(--tune-accent); }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    font-weight: 500;
  }

  /* Hint chips */
  .hint-chips {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .hint-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .chips-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .hint-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text);
    transition: all 0.12s;
  }

  .hint-chip:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .hint-chip svg {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .chip-platform {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-grey2);
    padding: 1px 5px;
    border-radius: 3px;
  }

  /* Current dirs */
  .current-dirs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .list-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin-top: 4px;
  }

  .current-dir-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
  }

  .current-dir-item svg {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .dir-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dir-tracks {
    font-size: 11px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Mount path */
  .mount-path {
    display: block;
    font-family: monospace;
    font-size: 11px;
    color: var(--tune-text-muted);
    margin-top: 4px;
  }

  /* Status messages */
  .wizard-error {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    color: #ef4444;
    font-family: var(--font-body);
    font-size: 12px;
  }

  .wizard-success {
    padding: 8px 12px;
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: var(--radius-sm);
    color: #4ade80;
    font-family: var(--font-body);
    font-size: 12px;
  }

  /* Done */
  .done-icon {
    display: flex;
    justify-content: center;
    color: var(--tune-accent);
    margin-bottom: 4px;
  }

  .done-title {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    margin: 0;
    color: var(--tune-text);
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--tune-bg);
    border-radius: var(--radius-md);
    border: 1px solid var(--tune-border);
    margin-top: 4px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .summary-label {
    color: var(--tune-text-secondary);
  }

  .summary-value {
    color: var(--tune-text);
    font-weight: 500;
  }

  .summary-value.mono {
    font-family: monospace;
    font-size: 11px;
    color: var(--tune-text-muted);
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
