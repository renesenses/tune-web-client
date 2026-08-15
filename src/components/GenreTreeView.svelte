<script lang="ts">
  import { onMount } from 'svelte';
  import { dialogs } from '../lib/stores/dialogs';
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { t } from '../lib/i18n';

  type Tree = Record<string, string[]>;

  let tree = $state<Tree>({});
  let originalJson = $state('{}');
  let loading = $state(true);
  let saving = $state(false);
  let helpOpen = $state(false);
  let dirty = $derived(JSON.stringify(tree) !== originalJson);
  let newParent = $state('');
  let knownGenres = $state<string[]>([]);

  async function load() {
    loading = true;
    try {
      const r = await api.getGenreTree();
      tree = r.tree ?? {};
      originalJson = JSON.stringify(tree);
      // Best-effort: pull all distinct genres from the library to feed
      // the autocomplete datalist. Falls back to an empty list quietly.
      try {
        const albums = await api.getAllAlbums();
        const set = new Set<string>();
        for (const a of albums) if (a.genre) set.add(a.genre);
        knownGenres = [...set].sort((a, b) => a.localeCompare(b));
      } catch {
        knownGenres = [];
      }
    } catch (e: any) {
      notifications.error(`${$t('genreTree.loadError')} : ${e?.message || e}`);
    }
    loading = false;
  }

  async function save() {
    saving = true;
    try {
      await api.putGenreTree(tree);
      originalJson = JSON.stringify(tree);
      notifications.success($t('genreTree.saved'));
    } catch (e: any) {
      notifications.error(`${$t('genreTree.saveError')} : ${e?.message || e}`);
    }
    saving = false;
  }

  function addParent() {
    const p = newParent.trim();
    if (!p) return;
    if (tree[p]) { notifications.error($t('genreTree.alreadyExists').replace('{name}', p)); return; }
    tree = { ...tree, [p]: [] };
    newParent = '';
  }

  // Persist the current tree to the server immediately. Used by the delete
  // actions so a removed branch/child can't be silently lost when the user
  // navigates away without pressing "Enregistrer" (forum "Arbre des genres" :
  // « la suppression ne fonctionne pas »). Add/rename edits still batch under
  // the Save button; only the destructive × persists on the spot.
  async function persistTree() {
    try {
      await api.putGenreTree(tree);
      originalJson = JSON.stringify(tree);
    } catch (e: any) {
      notifications.error(`${$t('genreTree.saveError')} : ${e?.message || e}`);
    }
  }

  async function removeParent(parent: string) {
    if (!tree[parent]) return;
    if (!(await dialogs.confirm($t('genreTree.confirmRemoveBranch').replace('{name}', parent).replace('{count}', String(tree[parent].length)), { danger: true }))) return;
    const { [parent]: _, ...rest } = tree;
    tree = rest;
    await persistTree();
  }

  async function renameParent(oldName: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const newName = input.value.trim();
    if (!newName || newName === oldName) {
      input.value = oldName;
      return;
    }
    // Renaming a branch renames the GENRE across the WHOLE library (the album +
    // track tags), not just this overlay — otherwise a mis-spelled genre stayed
    // on the tracks and kept reappearing / cluttering Oxygen (Jean Marie). If
    // the target already exists this is a MERGE (Rok → Rock). Confirm because it
    // rewrites tags, then reload the server truth (tags + tree both updated
    // server-side).
    if (
      !(await dialogs.confirm(
        $t('genreTree.confirmRenameLibrary').replace('{from}', oldName).replace('{to}', newName),
        { danger: true }
      ))
    ) {
      input.value = oldName;
      return;
    }
    saving = true;
    try {
      const r = await api.renameGenre(oldName, newName);
      notifications.success(
        $t('genreTree.renameDone')
          .replace('{albums}', String(r.albums ?? 0))
          .replace('{tracks}', String(r.tracks ?? 0))
      );
      await load();
    } catch (e: any) {
      notifications.error(`${$t('genreTree.saveError')} : ${e?.message || e}`);
      input.value = oldName;
    }
    saving = false;
  }

  function addChild(parent: string, child: string) {
    const c = (child || '').trim();
    if (!c) return;
    if (tree[parent].some(x => x.toLowerCase() === c.toLowerCase())) {
      notifications.error($t('genreTree.childAlreadyIn').replace('{child}', c).replace('{parent}', parent));
      return;
    }
    tree = { ...tree, [parent]: [...tree[parent], c] };
  }

  async function removeChild(parent: string, child: string) {
    tree = { ...tree, [parent]: tree[parent].filter(c => c !== child) };
    await persistTree();
  }

  // Rename/merge a genre AT THE SOURCE (rewrites album + track tags library-wide),
  // unlike renaming a tree branch which only relabels the grouping. Fixes a
  // mis-spelled genre so it stops reappearing (forum "Arbre des genres").
  let renaming = $state<string | null>(null);
  async function mergeGenre(genre: string) {
    const to = ((await dialogs.prompt($t('genreTree.renameGenrePrompt').replace('{genre}', genre), genre)) || '').trim();
    if (!to || to === genre) return;
    renaming = genre;
    try {
      const r = await api.renameGenre(genre, to);
      notifications.success(
        $t('genreTree.renameGenreDone')
          .replace('{from}', genre)
          .replace('{to}', to)
          .replace('{albums}', String(r.albums))
          .replace('{tracks}', String(r.tracks)),
      );
      // Tags + server-side tree changed — reload from scratch.
      await load();
    } catch (e: any) {
      notifications.error(`${$t('genreTree.renameGenreError')} : ${e?.message || e}`);
    }
    renaming = null;
  }

  // Drag & drop state — track what's being dragged + which target is hovered
  let dragSource = $state<{ parent: string; child: string } | null>(null);
  let dragHoverTarget = $state<string | null>(null);

  function onDragStart(parent: string, child: string, ev: DragEvent) {
    dragSource = { parent, child };
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', `${parent}::${child}`);
    }
  }

  function onDragOver(target: string, ev: DragEvent) {
    if (!dragSource) return;
    if (dragSource.parent === target) return; // no-op
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    dragHoverTarget = target;
  }

  function onDragLeave() {
    dragHoverTarget = null;
  }

  function onDrop(targetParent: string, ev: DragEvent) {
    ev.preventDefault();
    dragHoverTarget = null;
    const src = dragSource;
    dragSource = null;
    if (!src) return;
    if (src.parent === targetParent) return;
    // Remove from old parent + add to new parent (avoid dup if target already has it).
    const newSrc = (tree[src.parent] ?? []).filter(c => c !== src.child);
    const targetExisting = tree[targetParent] ?? [];
    const newTarget = targetExisting.some(c => c.toLowerCase() === src.child.toLowerCase())
      ? targetExisting
      : [...targetExisting, src.child];
    tree = { ...tree, [src.parent]: newSrc, [targetParent]: newTarget };
  }

  function onDragEnd() {
    dragSource = null;
    dragHoverTarget = null;
  }

  async function reset() {
    if (!(await dialogs.confirm($t('genreTree.confirmReset'), { danger: true }))) return;
    tree = JSON.parse(originalJson);
  }

  onMount(load);
</script>

<section class="gt-view">
  <header>
    <h1>{$t('genreTree.title')}</h1>
    <p class="lede">
      {$t('genreTree.ledePart1')}
      <code>genre branch_of "Jazz"</code> {$t('genreTree.ledePart2')} <em>"Jazz"</em>
      {$t('genreTree.ledePart3')} <code>albums.genre</code>
      {$t('genreTree.ledePart4')}
    </p>
    <!-- Mode d'emploi dépliable (point 8, revue 2026-08-15) : les gestes de
         la vue — glisser-déposer, renommage, suppression immédiate — étaient
         invisibles sans les découvrir par accident. Pattern accordéon repris
         de ServiceTokensView. -->
    <button class="help-toggle" onclick={() => (helpOpen = !helpOpen)}>
      {helpOpen ? '▾' : '▸'} {$t('genreTree.helpToggle')}
    </button>
    {#if helpOpen}
      <ol class="help-steps">
        <li>{$t('genreTree.helpStep1')}</li>
        <li>{$t('genreTree.helpStep2')}</li>
        <li>{$t('genreTree.helpStep3')}</li>
        <li>{$t('genreTree.helpStep4')}</li>
        <li>{$t('genreTree.helpStep5')}</li>
      </ol>
    {/if}
  </header>

  <!-- Barre d'outils épinglée. `.actions` vivait DANS le <header> : un sticky
       est borné par la boîte de son parent, pas par le conteneur de
       défilement, si bien que les boutons décrochaient dès que l'en-tête
       sortait de l'écran — bien avant la fin de la liste des branches
       (#463, Jean Valjean : « les 2 lignes disparaissent, À jour et Nouvelle
       branche »). Sortis du <header>, ils sont bornés par `.gt-view`, donc
       par toute la vue. `.add-parent` les rejoint : c'est la seconde ligne
       signalée, et la regrouper évite d'avoir à chiffrer en dur la hauteur de
       la première pour les empiler. -->
  <div class="gt-toolbar">
    <div class="actions">
      <button class="btn-save" disabled={saving || !dirty} onclick={save}>
        {saving ? $t('genreTree.savingProgress') : dirty ? $t('common.save') : $t('genreTree.upToDate')}
      </button>
      <button class="btn-secondary" disabled={!dirty} onclick={reset}>{$t('common.cancel')}</button>
    </div>

    {#if !loading}
      <div class="add-parent">
        <input type="text" placeholder={$t('genreTree.newBranchPlaceholder')} bind:value={newParent} onkeydown={(e) => { if (e.key === 'Enter') addParent(); }} />
        <button class="btn-add" onclick={addParent} disabled={!newParent.trim()}>{$t('genreTree.addBranch')}</button>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="state">…</div>
  {:else}
    <div class="grid">
      {#each Object.keys(tree).sort((a, b) => a.localeCompare(b)) as parent (parent)}
        <div
          class="branch"
          class:drop-target={dragHoverTarget === parent}
          ondragover={(e) => onDragOver(parent, e)}
          ondragleave={onDragLeave}
          ondrop={(e) => onDrop(parent, e)}
        >
          <div class="branch-head">
            <input
              type="text"
              class="parent-input"
              value={parent}
              onblur={(e) => renameParent(parent, e)}
            />
            <span class="count">{tree[parent].length} {tree[parent].length > 1 ? $t('genreTree.subGenresPlural') : $t('genreTree.subGenre')}</span>
            <button class="btn-del" onclick={() => removeParent(parent)} title={$t('genreTree.removeBranchTitle')}>×</button>
          </div>
          <div class="children">
            {#each tree[parent] as child (child)}
              <span
                class="child"
                draggable="true"
                ondragstart={(e) => onDragStart(parent, child, e)}
                ondragend={onDragEnd}
                title={$t('genreTree.dragHint')}
              >
                <span class="child-grip">⋮⋮</span>
                {child}
                <button class="child-rename" onclick={() => mergeGenre(child)} disabled={renaming === child} title={$t('genreTree.renameGenreTitle')}>✎</button>
                <button class="child-del" onclick={() => removeChild(parent, child)} title={$t('genreTree.removeChildTitle')}>×</button>
              </span>
            {/each}
          </div>
          <input
            type="text"
            class="add-child-input"
            placeholder={$t('genreTree.addChildPlaceholder')}
            list="known-genres"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                const t = e.target as HTMLInputElement;
                addChild(parent, t.value);
                t.value = '';
              }
            }}
          />
        </div>
      {/each}
    </div>

    <datalist id="known-genres">
      {#each knownGenres as g}<option value={g}></option>{/each}
    </datalist>
  {/if}
</section>

<style>
  .gt-view { padding: 24px; max-width: 1100px; margin: 0 auto; }
  header h1 { margin: 0 0 4px; font-size: 1.5rem; color: var(--tune-text); }
  .lede { color: var(--tune-text-muted); font-size: 13px; margin: 0 0 14px; max-width: 760px; line-height: 1.45; }
  .lede code { background: var(--tune-bg); padding: 1px 6px; border-radius: 4px; font-family: monospace; font-size: 11px; }
  .help-toggle { background: none; border: 0; color: var(--tune-accent); font: inherit; font-size: 13px; padding: 0; margin: 0 0 10px; cursor: pointer; }
  .help-steps { color: var(--tune-text-muted); font-size: 13px; line-height: 1.5; margin: 0 0 14px; padding-left: 20px; max-width: 760px; }
  .help-steps li { margin-bottom: 4px; }
  /* Boutons figés au défilement — le vrai « haut utile » de cette vue (#1237). */
  /* L'ancrage vit sur la barre, pas sur chaque ligne : `.gt-view` est un bloc
     simple qui défile dans `.view-scroller` — lui aussi un bloc simple depuis
     #1282 — donc Firefox honore ce sticky. */
  .gt-toolbar { position: sticky; top: 0; z-index: 20; background: var(--tune-bg); padding: 10px 0; margin-top: -10px; }
  .actions { display: flex; gap: 8px; margin-bottom: 16px; }
  .btn-save, .btn-secondary, .btn-add {
    padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
    cursor: pointer; border: none;
  }
  .btn-save { background: var(--tune-accent); color: white; }
  .btn-save:disabled { opacity: 0.4; cursor: default; }
  .btn-secondary { background: transparent; color: var(--tune-text-muted); border: 1px solid var(--tune-border); }
  .btn-secondary:disabled { opacity: 0.4; cursor: default; }
  .btn-add { background: rgba(var(--tune-accent-rgb,99,102,241),0.15); color: var(--tune-accent); }
  .btn-add:disabled { opacity: 0.4; cursor: default; }

  .add-parent { display: flex; gap: 8px; margin-bottom: 18px; max-width: 480px; }
  .add-parent input {
    flex: 1; background: var(--tune-bg); border: 1px solid var(--tune-border);
    border-radius: 6px; padding: 6px 10px; color: var(--tune-text); font-size: 13px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }
  .branch {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .branch-head { display: flex; align-items: center; gap: 8px; }
  .parent-input {
    flex: 1; background: transparent; border: none; padding: 2px 0;
    color: var(--tune-text); font-size: 14px; font-weight: 600;
    border-bottom: 1px solid transparent;
  }
  .parent-input:focus { outline: none; border-bottom-color: var(--tune-accent); }
  .count { font-size: 11px; color: var(--tune-text-muted); white-space: nowrap; }
  .btn-del {
    background: none; border: none; color: var(--tune-text-muted);
    font-size: 18px; cursor: pointer; line-height: 1; padding: 0 4px;
  }
  .btn-del:hover { color: #ef4444; }

  .children {
    display: flex; flex-wrap: wrap; gap: 4px;
    min-height: 22px;
  }
  .child {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(var(--tune-accent-rgb,99,102,241),0.12);
    color: var(--tune-text);
    border-radius: 12px; padding: 2px 4px 2px 6px; font-size: 11px;
    cursor: grab;
    user-select: none;
  }
  .child:active { cursor: grabbing; }
  .child-grip {
    color: var(--tune-text-muted);
    font-size: 10px; letter-spacing: -2px;
    padding-right: 2px;
  }
  .branch.drop-target {
    border: 2px dashed var(--tune-accent, #6366f1);
    background: rgba(var(--tune-accent-rgb,99,102,241),0.08);
  }
  .child-del {
    background: none; border: none; color: var(--tune-text-muted);
    cursor: pointer; padding: 0 4px; font-size: 14px; line-height: 1;
  }
  .child-del:hover { color: #ef4444; }

  .child-rename {
    background: none; border: none; color: var(--tune-text-muted);
    cursor: pointer; padding: 0 2px; font-size: 11px; line-height: 1;
  }
  .child-rename:hover { color: var(--tune-accent); }
  .child-rename:disabled { opacity: 0.4; cursor: default; }

  .add-child-input {
    background: var(--tune-bg); border: 1px dashed var(--tune-border);
    border-radius: 6px; padding: 4px 8px;
    color: var(--tune-text); font-size: 11px;
  }
  .add-child-input:focus { border-style: solid; border-color: var(--tune-accent); outline: none; }

  .state { padding: 24px; text-align: center; color: var(--tune-text-muted); }
</style>
