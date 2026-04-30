<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  type Tree = Record<string, string[]>;

  let tree = $state<Tree>({});
  let originalJson = $state('{}');
  let loading = $state(true);
  let saving = $state(false);
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
      notifications.error(`Chargement : ${e?.message || e}`);
    }
    loading = false;
  }

  async function save() {
    saving = true;
    try {
      await api.putGenreTree(tree);
      originalJson = JSON.stringify(tree);
      notifications.success('Arbre des genres enregistré.');
    } catch (e: any) {
      notifications.error(`Échec : ${e?.message || e}`);
    }
    saving = false;
  }

  function addParent() {
    const p = newParent.trim();
    if (!p) return;
    if (tree[p]) { notifications.error(`"${p}" existe déjà.`); return; }
    tree = { ...tree, [p]: [] };
    newParent = '';
  }

  function removeParent(parent: string) {
    if (!confirm(`Supprimer la branche "${parent}" et ses ${tree[parent].length} sous-genres ?`)) return;
    const { [parent]: _, ...rest } = tree;
    tree = rest;
  }

  function renameParent(oldName: string, ev: Event) {
    const newName = (ev.target as HTMLInputElement).value.trim();
    if (!newName || newName === oldName) return;
    if (tree[newName]) {
      notifications.error(`"${newName}" existe déjà.`);
      (ev.target as HTMLInputElement).value = oldName;
      return;
    }
    const next: Tree = {};
    for (const [k, v] of Object.entries(tree)) {
      next[k === oldName ? newName : k] = v;
    }
    tree = next;
  }

  function addChild(parent: string, child: string) {
    const c = (child || '').trim();
    if (!c) return;
    if (tree[parent].some(x => x.toLowerCase() === c.toLowerCase())) {
      notifications.error(`"${c}" est déjà dans "${parent}".`);
      return;
    }
    tree = { ...tree, [parent]: [...tree[parent], c] };
  }

  function removeChild(parent: string, child: string) {
    tree = { ...tree, [parent]: tree[parent].filter(c => c !== child) };
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

  function reset() {
    if (!confirm('Annuler les modifications non enregistrées ?')) return;
    tree = JSON.parse(originalJson);
  }

  onMount(load);
</script>

<section class="gt-view">
  <header>
    <h1>Arbre des genres</h1>
    <p class="lede">
      Définit les regroupements parent → sous-genres pour le filtrage hiérarchique.
      Une Smart Playlist <code>genre branch_of "Jazz"</code> matchera <em>"Jazz"</em>
      et tous ses sous-genres listés ici. Les noms de genre dans <code>albums.genre</code>
      restent inchangés (pas de migration).
    </p>
    <div class="actions">
      <button class="btn-save" disabled={saving || !dirty} onclick={save}>
        {saving ? 'Enregistre…' : dirty ? 'Enregistrer' : 'À jour'}
      </button>
      <button class="btn-secondary" disabled={!dirty} onclick={reset}>Annuler</button>
    </div>
  </header>

  {#if loading}
    <div class="state">…</div>
  {:else}
    <div class="add-parent">
      <input type="text" placeholder="Nouvelle branche (ex: Reggae)" bind:value={newParent} onkeydown={(e) => { if (e.key === 'Enter') addParent(); }} />
      <button class="btn-add" onclick={addParent} disabled={!newParent.trim()}>+ Ajouter une branche</button>
    </div>

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
            <span class="count">{tree[parent].length} sous-genre{tree[parent].length > 1 ? 's' : ''}</span>
            <button class="btn-del" onclick={() => removeParent(parent)} title="Supprimer la branche">×</button>
          </div>
          <div class="children">
            {#each tree[parent] as child (child)}
              <span
                class="child"
                draggable="true"
                ondragstart={(e) => onDragStart(parent, child, e)}
                ondragend={onDragEnd}
                title="Glisse vers une autre branche pour déplacer"
              >
                <span class="child-grip">⋮⋮</span>
                {child}
                <button class="child-del" onclick={() => removeChild(parent, child)} title="Retirer">×</button>
              </span>
            {/each}
          </div>
          <input
            type="text"
            class="add-child-input"
            placeholder="+ sous-genre"
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

  .add-child-input {
    background: var(--tune-bg); border: 1px dashed var(--tune-border);
    border-radius: 6px; padding: 4px 8px;
    color: var(--tune-text); font-size: 11px;
  }
  .add-child-input:focus { border-style: solid; border-color: var(--tune-accent); outline: none; }

  .state { padding: 24px; text-align: center; color: var(--tune-text-muted); }
</style>
