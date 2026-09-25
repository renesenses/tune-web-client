<script lang="ts">
  /**
   * Arbre des RAYONS de collections — tune-server-rust#4853.
   *
   * Deux usages, un composant :
   *  - l'onglet « Rayons » de l'écran Collections (`compact` faux) : tout
   *    l'arbre, les collections hors rayon, les gestes (nouveau, renommer,
   *    déplacer vers…, supprimer, glisser-déposer) ;
   *  - la barre latérale (`compact` vrai) : les rayons et leurs collections,
   *    repliables, en lecture — un clic ouvre la collection.
   *
   * Le mot « dossier » est pris deux fois dans l'interface (les dossiers de
   * musique du disque, et le nom que les testeurs donnent aux collections
   * simples) : d'où « rayon », comme chez un disquaire.
   *
   * Les refus (cycle, profondeur, nom vide) sont ceux du SERVEUR, affichés
   * avec son motif : `lib/api` passe par `erreurDepuisReponse`.
   */
  import * as api from '../../lib/api';
  import type { ArbreCollections, CollectionRangee, RayonCollections } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import {
    TYPE_GLISSE,
    decoderGlisse,
    destinationsDeLaCollection,
    destinationsDuRayon,
    ecrireReplis,
    encoderGlisse,
    lireReplis,
    peutContenirUnSousRayon,
    type Glisse,
  } from '../../lib/rayonsCollections';

  interface Props {
    arbre: ArbreCollections;
    compact?: boolean;
    /** Le libellé AFFICHÉ d'une collection (une collection livrée se traduit). */
    libelle?: (c: CollectionRangee) => string;
    onOuvrir: (kind: CollectionRangee['kind'], id: number) => void;
    /** Relire l'arbre après une écriture. */
    onChange?: () => void | Promise<void>;
  }
  let { arbre, compact = false, libelle, onOuvrir, onChange }: Props = $props();

  const nomDe = (c: CollectionRangee) => (libelle ? libelle(c) : (c.name ?? ''));

  let replis = $state<Set<number>>(lireReplis());
  function basculer(id: number) {
    const s = new Set(replis);
    if (s.has(id)) s.delete(id); else s.add(id);
    replis = s;
    ecrireReplis(s);
  }

  /** Le menu ouvert : celui d'un rayon, ou le « Déplacer vers… » d'une collection. */
  let menu = $state<
    | { type: 'rayon'; id: number; deplacer: boolean }
    | { type: 'collection'; kind: CollectionRangee['kind']; id: number; dossier: number | null }
    | null
  >(null);

  async function ecrire(geste: () => Promise<unknown>) {
    menu = null;
    try {
      await geste();
    } catch (e: any) {
      notifications.error(`${$t('v2.rayons.error' as any)} : ${e?.message ?? ''}`);
    }
    await onChange?.();
  }

  async function nouveauRayon(parent: number | null) {
    menu = null;
    const nom = await dialogs.prompt($t('v2.rayons.namePrompt' as any));
    if (nom == null || !nom.trim()) return;
    await ecrire(() => api.createCollectionFolder(nom.trim(), parent));
  }

  async function renommer(f: RayonCollections) {
    menu = null;
    const nom = await dialogs.prompt($t('v2.rayons.namePrompt' as any), f.name);
    if (nom == null || !nom.trim() || nom.trim() === f.name) return;
    await ecrire(() => api.renameCollectionFolder(f.id, nom.trim()));
  }

  async function supprimer(f: RayonCollections) {
    menu = null;
    const ok = await dialogs.confirm(
      $t('v2.rayons.confirmDelete' as any).replace('{name}', f.name),
      { danger: true },
    );
    if (!ok) return;
    await ecrire(() => api.deleteCollectionFolder(f.id));
  }

  const nomDestination = (d: RayonCollections | null) =>
    d ? `${'· '.repeat(Math.max(0, d.depth - 1))}${d.name}` : $t('v2.rayons.root' as any);

  /* ------------------------------ glisser-déposer ------------------------------ */
  let survol = $state<number | 'racine' | null>(null);

  function commencer(ev: DragEvent, g: Glisse) {
    if (compact || !ev.dataTransfer) return;
    ev.dataTransfer.setData(TYPE_GLISSE, encoderGlisse(g));
    ev.dataTransfer.effectAllowed = 'move';
  }
  function passer(ev: DragEvent, cible: number | 'racine') {
    if (compact) return;
    ev.preventDefault();
    survol = cible;
  }
  async function deposer(ev: DragEvent, cible: number | null) {
    if (compact) return;
    ev.preventDefault();
    survol = null;
    const g = decoderGlisse(ev.dataTransfer?.getData(TYPE_GLISSE));
    if (!g) return;
    if (g.type === 'rayon') {
      if (g.id === cible) return;
      await ecrire(() => api.moveCollectionFolder(g.id, cible));
    } else {
      await ecrire(() => api.placeCollectionInFolder(g.kind, g.id, cible));
    }
  }
</script>

{#snippet ligneCollection(c: CollectionRangee)}
  <li class="col" draggable={!compact}
    ondragstart={(ev) => commencer(ev, { type: 'collection', kind: c.kind, id: c.id })}>
    <button class="ouvre" onclick={() => onOuvrir(c.kind, c.id)} title={nomDe(c)}>
      <span class="pastille" style={c.color ? `background:${c.color}` : undefined}></span>
      <span class="nom">{nomDe(c)}</span>
      {#if c.kind === 'smart' && !compact}<span class="sorte">{$t('v2.rayons.smartBadge' as any)}</span>{/if}
    </button>
    {#if !compact}
      <button class="geste" aria-label={$t('v2.rayons.move' as any)} title={$t('v2.rayons.move' as any)}
        onclick={() => (menu = menu?.type === 'collection' && menu.id === c.id && menu.kind === c.kind
          ? null : { type: 'collection', kind: c.kind, id: c.id, dossier: c.folder_id })}>⋯</button>
      {#if menu?.type === 'collection' && menu.id === c.id && menu.kind === c.kind}
        {@const dossier = menu.dossier}
        <div class="menu" role="menu">
          <div class="titre-menu">{$t('v2.rayons.move' as any)}</div>
          {#each destinationsDeLaCollection(arbre, dossier) as d (d?.id ?? 'racine')}
            <button role="menuitem" onclick={() => ecrire(() => api.placeCollectionInFolder(c.kind, c.id, d?.id ?? null))}>{nomDestination(d)}</button>
          {/each}
          {#if dossier !== null}
            <button role="menuitem" onclick={() => ecrire(() => api.removeCollectionFromFolder(c.kind, c.id))}>{$t('v2.rayons.removeFromFolder' as any)}</button>
          {/if}
        </div>
      {/if}
    {/if}
  </li>
{/snippet}

{#snippet noeud(f: RayonCollections)}
  {@const replie = replis.has(f.id)}
  <li class="rayon" data-rayon={f.id}>
    <div class="tete" class:survol={survol === f.id} draggable={!compact}
      role="treeitem" aria-expanded={!replie} aria-selected="false" tabindex="-1"
      ondragstart={(ev) => commencer(ev, { type: 'rayon', id: f.id })}
      ondragover={(ev) => passer(ev, f.id)}
      ondragleave={() => (survol = survol === f.id ? null : survol)}
      ondrop={(ev) => deposer(ev, f.id)}>
      <button class="pli" onclick={() => basculer(f.id)}
        aria-label={replie ? $t('v2.rayons.expand' as any) : $t('v2.rayons.collapse' as any)}>
        <svg viewBox="0 0 24 24" class:ferme={replie}><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" /></svg>
      </button>
      <button class="nomrayon" onclick={() => basculer(f.id)}>{f.name}</button>
      <span class="compte">{f.collections.length}</span>
      {#if !compact}
        <button class="geste" aria-label={$t('v2.rayons.actions' as any)} title={$t('v2.rayons.actions' as any)}
          onclick={() => (menu = menu?.type === 'rayon' && menu.id === f.id ? null : { type: 'rayon', id: f.id, deplacer: false })}>⋯</button>
      {/if}
    </div>
    {#if !compact && menu?.type === 'rayon' && menu.id === f.id}
      <div class="menu" role="menu">
        {#if menu.deplacer}
          <div class="titre-menu">{$t('v2.rayons.move' as any)}</div>
          {#each destinationsDuRayon(arbre, f.id) as d (d?.id ?? 'racine')}
            <button role="menuitem" onclick={() => ecrire(() => api.moveCollectionFolder(f.id, d?.id ?? null))}>{nomDestination(d)}</button>
          {/each}
        {:else}
          {#if peutContenirUnSousRayon(arbre, f)}
            <button role="menuitem" onclick={() => nouveauRayon(f.id)}>{$t('v2.rayons.newSub' as any)}</button>
          {/if}
          <button role="menuitem" onclick={() => renommer(f)}>{$t('v2.rayons.rename' as any)}</button>
          <button role="menuitem" onclick={() => (menu = { type: 'rayon', id: f.id, deplacer: true })}>{$t('v2.rayons.move' as any)}</button>
          <button role="menuitem" class="danger" onclick={() => supprimer(f)}>{$t('v2.rayons.delete' as any)}</button>
        {/if}
      </div>
    {/if}
    {#if !replie}
      <ul class="enfants">
        {#each f.folders as s (s.id)}{@render noeud(s)}{/each}
        {#each f.collections as c (c.kind + ':' + c.id)}{@render ligneCollection(c)}{/each}
        {#if !compact && !f.folders.length && !f.collections.length}
          <li class="vide">{$t('v2.rayons.emptyFolder' as any)}</li>
        {/if}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="arbre-rayons" class:compact>
  {#if !compact}
    <div class="barre">
      <button class="v2-btn" onclick={() => nouveauRayon(null)}>{$t('v2.rayons.new' as any)}</button>
    </div>
    {#if !arbre.folders.length}
      <p class="aucun">{$t('v2.rayons.empty' as any)}</p>
    {/if}
  {/if}
  <ul class="racine" role="tree">
    {#each arbre.folders as f (f.id)}{@render noeud(f)}{/each}
  </ul>
  {#if !compact}
    <!-- Hors rayon : la racine. Y déposer un rayon ou une collection l'y range. -->
    <section class="hors" class:survol={survol === 'racine'} aria-label={$t('v2.rayons.unfiled' as any)}
      ondragover={(ev) => passer(ev, 'racine')}
      ondragleave={() => (survol = survol === 'racine' ? null : survol)}
      ondrop={(ev) => deposer(ev, null)}>
      <h2>{$t('v2.rayons.unfiled' as any)}</h2>
      <p class="indice">{$t('v2.rayons.dropHint' as any)}</p>
      <ul>
        {#each arbre.collections as c (c.kind + ':' + c.id)}{@render ligneCollection(c)}{/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .arbre-rayons{padding:12px 30px 30px; color:var(--v2-txt); font-family:var(--v2-sans)}
  .arbre-rayons.compact{padding:0 0 4px 18px}
  .barre{display:flex; gap:8px; margin-bottom:12px}
  .aucun, .indice, .vide{color:var(--v2-txt3); font-size:12.5px; margin:4px 0}
  ul{list-style:none; margin:0; padding:0}
  .enfants{padding-left:18px}
  .compact .enfants{padding-left:12px}
  .rayon, .col{position:relative}
  .tete{display:flex; align-items:center; gap:4px; border-radius:8px; padding:2px 4px}
  .tete.survol, .hors.survol{outline:2px dashed var(--v2-acc1); outline-offset:1px}
  .pli, .geste{width:24px; height:24px; display:grid; place-items:center; padding:0; border:0;
    background:transparent; color:var(--v2-txt3); cursor:pointer; border-radius:6px}
  .pli svg{width:14px; height:14px; transition:transform .12s}
  .pli svg.ferme{transform:rotate(-90deg)}
  .pli:hover, .geste:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .nomrayon{flex:1; min-width:0; text-align:left; border:0; background:transparent; color:inherit;
    font:600 13.5px var(--v2-sans); cursor:pointer; padding:4px 2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .compact .nomrayon{font-size:12.5px; color:var(--v2-txt2)}
  .compte{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .col{display:flex; align-items:center; gap:4px}
  .ouvre{flex:1; min-width:0; display:flex; align-items:center; gap:8px; border:0; background:transparent;
    color:var(--v2-txt2); cursor:pointer; padding:4px 6px; border-radius:6px; font:13px var(--v2-sans); text-align:left}
  .compact .ouvre{font-size:12px; padding:3px 4px}
  .ouvre:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .nom{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .pastille{flex:none; width:8px; height:8px; border-radius:50%; background:var(--v2-line2)}
  .sorte{font:9.5px var(--v2-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--v2-txt3)}
  .menu{position:absolute; right:0; top:100%; z-index:20; min-width:200px; max-height:280px; overflow-y:auto;
    display:flex; flex-direction:column; padding:6px; border:1px solid var(--v2-line2); border-radius:10px;
    background:var(--v2-surface2); box-shadow:var(--v2-sh-card)}
  .menu button{border:0; background:transparent; color:var(--v2-txt2); text-align:left; padding:6px 8px;
    border-radius:6px; cursor:pointer; font:13px var(--v2-sans)}
  .menu button:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .menu button.danger{color:var(--v2-danger)}
  .titre-menu{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3); padding:4px 8px}
  .hors{margin-top:22px; padding:8px; border-radius:10px}
  .hors h2{font:600 12px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3); margin:0 0 4px}
</style>
