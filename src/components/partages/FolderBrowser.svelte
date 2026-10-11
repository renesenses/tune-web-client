<script lang="ts">
  import { bulleTexte } from '../../lib/infobulleTexte';
  /**
   * Sélecteur de dossier du SERVEUR (#1275, fil forum 2171).
   *
   * Le dialogue natif est proscrit dans les webviews, et le dossier à
   * désigner est de toute façon celui du serveur, pas du navigateur : c'est
   * le serveur qui liste (`GET /system/browse-dirs`, admin et périmètre hors
   * arbres système). Sous Windows, la racine est la liste des lecteurs.
   *
   * Passe par `api.browseServerDirs` et non par `fetch` nu : sans le jeton,
   * la route — `RequireAdmin` — refusait tout dès que l'authentification
   * était activée.
   */
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { DossierServeur } from '../../lib/api';

  let { onSelect, onClose, initialPath = '' }: {
    onSelect: (path: string) => void;
    onClose: () => void;
    initialPath?: string;
  } = $props();

  let currentPath = $state('');
  let selected = $state('');
  let drives = $state(false);
  let dirs = $state<DossierServeur[]>([]);
  let parentPath = $state<string | null>(null);
  let loading = $state(false);
  let error = $state('');

  async function browse(path?: string) {
    loading = true;
    error = '';
    try {
      const data = await api.browseServerDirs(path);
      dirs = Array.isArray(data?.dirs) ? data.dirs : [];
      parentPath = data?.parent ?? null;
      drives = data?.drives === true;
      currentPath = data?.current || path || '';
      selected = drives ? '' : currentPath;
      if (data?.error) error = $t('folderBrowser.error' as any);
    } catch {
      error = $t('folderBrowser.error' as any);
    }
    loading = false;
  }

  // Part du chemin déjà saisi s'il y en a un, sinon de la racine du serveur.
  $effect(() => { browse(initialPath.trim() || undefined); });

  function select() {
    if (selected) onSelect(selected);
  }
</script>

<div class="folder-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1">
  <div class="folder-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}
    role="dialog" aria-modal="true" aria-labelledby="folder-browser-title" tabindex="-1">
    <header>
      <h3 id="folder-browser-title">{$t('ingest.selectFolder')}</h3>
      <button class="close-btn" onclick={onClose} aria-label={$t('common.close' as any)}>&times;</button>
    </header>

    <div class="breadcrumb" use:bulleTexte>
      <span class="current-path">{drives ? $t('folderBrowser.drives' as any) : currentPath}</span>
    </div>

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    <div class="dir-list">
      {#if parentPath !== null}
        <button class="dir-item parent" onclick={() => browse(parentPath!)} aria-label={$t('folderBrowser.parent' as any)}>
          <span class="icon">⬆</span>
          <span class="name" use:bulleTexte>..</span>
        </button>
      {/if}

      {#if loading}
        <div class="loading">{$t('folderBrowser.loading' as any)}</div>
      {:else}
        {#each dirs as dir (dir.path)}
          <div class="dir-row" class:selected={selected === dir.path}>
            <button
              class="dir-item"
              ondblclick={() => browse(dir.path)}
              onclick={() => { selected = dir.path; }}
              onkeydown={(e) => { if (e.key === 'ArrowRight') browse(dir.path); }}
            >
              <span class="icon">{drives ? '💽' : dir.has_children ? '📁' : '📂'}</span>
              <span class="name" use:bulleTexte>{dir.name}</span>
            </button>
            {#if dir.has_children || drives}
              <button class="open" onclick={() => browse(dir.path)}
                aria-label={$t('folderBrowser.open' as any).replace('{name}', dir.name)}
                title={$t('folderBrowser.open' as any).replace('{name}', dir.name)}>›</button>
            {/if}
          </div>
        {/each}
        {#if dirs.length === 0 && !error}
          <div class="empty">{$t('folderBrowser.empty' as any)}</div>
        {/if}
      {/if}
    </div>

    <p class="hint">{$t('folderBrowser.hint' as any)}</p>

    <footer>
      <span class="selected-path" use:bulleTexte>{selected}</span>
      <div class="actions">
        <button class="cancel-btn" onclick={onClose}>{$t('common.cancel' as any)}</button>
        <button class="select-btn" onclick={select} disabled={!selected}>{$t('folderBrowser.select' as any)}</button>
      </div>
    </footer>
  </div>
</div>

<style>
  .folder-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    /* Ce sélecteur est TOUJOURS ouvert depuis un autre dialogue — ImportWizard
       (z-index 1100) ou FolderWizard (1000). Il doit donc passer au-dessus des
       deux, sans quoi il s'affiche DERRIÈRE celui qui vient de l'ouvrir : seul
       son bandeau de titre dépasse, la liste des dossiers est recouverte, et
       l'étape « Source » devient infranchissable (#2041, signalé par Yacine).
       Face à FolderWizard, à z-index égal, le rendu tenait à l'ordre du DOM —
       correct par accident, et cassable au premier remaniement. */
    z-index: 1200;
  }
  .folder-modal {
    background: var(--tune-bg-secondary, #1e1e1e);
    border-radius: 12px;
    width: min(600px, 90vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--tune-border, #333);
  }
  header h3 { margin: 0; font-size: 1.1rem; }
  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text, #fff);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 4px;
  }
  .breadcrumb {
    padding: 8px 20px;
    font-size: 0.85rem;
    color: var(--tune-text-muted, #888);
    border-bottom: 1px solid var(--tune-border, #333);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dir-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    min-height: 200px;
  }
  .dir-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--tune-text, #fff);
    font-size: 0.95rem;
    cursor: pointer;
    text-align: left;
  }
  .dir-item:hover { background: var(--tune-bg-hover, #2a2a2a); }
  .dir-row { display: flex; align-items: center; border-radius: 6px; }
  .dir-row .dir-item { flex: 1; width: auto; min-width: 0; }
  .dir-row.selected { background: var(--tune-bg-hover, #2a2a2a); outline: 1px solid var(--tune-accent, #f59e0b); }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open {
    flex-shrink: 0;
    padding: 4px 12px;
    border: none;
    background: transparent;
    font-size: 1.3rem;
    color: var(--tune-text-muted, #888);
    cursor: pointer;
  }
  .open:hover { color: var(--tune-accent, #f59e0b); }
  .hint { margin: 0; padding: 6px 20px; font-size: 0.8rem; color: var(--tune-text-muted, #888); }
  .dir-item.parent { color: var(--tune-accent, #f59e0b); }
  .icon { font-size: 1.1rem; flex-shrink: 0; }
  .loading, .empty, .error {
    padding: 20px;
    text-align: center;
    color: var(--tune-text-muted, #888);
  }
  .error { color: var(--tune-error, #ef4444); }
  footer {
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border, #333);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .selected-path {
    font-size: 0.8rem;
    color: var(--tune-text-muted, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .actions { display: flex; gap: 8px; flex-shrink: 0; }
  .cancel-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid var(--tune-border, #555);
    background: transparent;
    color: var(--tune-text, #fff);
    cursor: pointer;
  }
  .select-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    background: var(--tune-accent, #f59e0b);
    color: #000;
    font-weight: 600;
    cursor: pointer;
  }
  .select-btn:hover { opacity: 0.9; }
  .select-btn:disabled { opacity: 0.5; cursor: default; }
</style>
