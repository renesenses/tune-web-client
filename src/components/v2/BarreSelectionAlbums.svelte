<script lang="ts">
  /**
   * web#3258 (Rob, VIP, réunion du 18/11 ; go de Bertrand le 19/11) — LA
   * BARRE D'ACTIONS de la sélection multiple d'albums de la Bibliothèque.
   *
   * Elle ne choisit rien : `LibraryV2` tient les cases et lui passe les
   * identifiants cochés, dans l'ordre affiché. Elle applique ensuite une
   * action groupée, chacune par une route QUI EXISTE déjà côté serveur :
   *
   * - Ajouter un tag : `POST /tags/{id}/items/batch` (`api.batchTag`, qui
   *   n'avait aucun appelant jusqu'ici), `item_type=album`, UN appel.
   * - Ajouter à la file : `album_id` par album, dans l'ordre affiché — le
   *   chemin du menu « … » d'un album (le serveur y applique le rattrapage
   *   de la ligne sœur).
   * - Ajouter à une playlist : la fenêtre partagée (`demandeAjoutPlaylist`),
   *   avec les pistes de tous les albums, lues au geste.
   * - Convertir : le Convertisseur, pré-rempli (`demandeConversion`), où le
   *   format se choisit et d'où part `POST /converter/start`.
   * - Modifier en lot : `POST /library/albums/batch-update`, le geste de la
   *   barre de l'écran Métadonnées. Il ÉCRASE des valeurs : confirmation par
   *   `dialogs.confirm`, Annuler par défaut.
   */
  import * as api from '../../lib/api';
  import { t, tn } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import { activeView } from '../../lib/stores/navigation';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { demandeAjoutPlaylist } from '../../lib/demandeAjoutPlaylist';
  import { demanderConversion } from '../../lib/demandeConversion';
  import { mettreAJourAlbum } from '../../lib/stores/albumsPagines';
  import { etatGreffons, entreeStudioVisible } from '../../lib/stores/greffonsStudio';
  import type { UserTag } from '../../lib/types';

  interface Props {
    /** Les albums cochés, dans l'ordre affiché. */
    ids: number[];
    /** Le nombre d'albums sélectionnables de la vue filtrée. */
    total: number;
    onToutSelectionner: () => void;
    onToutDeselectionner: () => void;
    onTerminer: () => void;
  }
  let { ids, total, onToutSelectionner, onToutDeselectionner, onTerminer }: Props = $props();

  type Panneau = 'tag' | 'edition' | null;
  let panneau = $state<Panneau>(null);
  let travail = $state(false);

  const n = $derived(ids.length);
  const vide = $derived(n === 0);
  /** Le Convertisseur est un greffon : pas d'entrée s'il est absent. */
  const convertisseur = $derived(entreeStudioVisible($etatGreffons?.converter));

  function basculer(p: Exclude<Panneau, null>) {
    panneau = panneau === p ? null : p;
    if (panneau === 'tag') void chargerTags();
  }

  /** Échap ferme d'abord le panneau ouvert, pas le mode sélection. */
  function echap(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !panneau) return;
    e.preventDefault();
    e.stopPropagation();
    panneau = null;
  }

  // ── Tag ──────────────────────────────────────────────────────────────
  let tags = $state<UserTag[] | null>(null);
  let nouveauTag = $state('');
  async function chargerTags() {
    try {
      const liste = await api.getTags();
      tags = Array.isArray(liste) ? liste : [];
    } catch {
      tags = [];
    }
  }

  async function poserTag(tag: { id: number | null; name: string }) {
    const lot = [...ids];
    if (tag.id == null || !lot.length || travail) return;
    const succes = $t('bibliotheque.selection.tagDone' as any);
    const echec = $t('bibliotheque.selection.tagError' as any);
    travail = true;
    try {
      await api.batchTag(tag.id, 'album', lot);
      notifications.success(succes.replace('{tag}', tag.name).replace('{n}', String(lot.length)));
      panneau = null;
    } catch {
      notifications.error(echec);
    }
    travail = false;
  }

  async function creerEtPoser() {
    const nom = nouveauTag.trim();
    if (!nom || travail) return;
    const echec = $t('bibliotheque.selection.tagError' as any);
    let id: number;
    try {
      ({ id } = await api.createTag(nom));
    } catch {
      notifications.error(echec);
      return;
    }
    nouveauTag = '';
    await poserTag({ id, name: nom });
  }

  // ── File et playlist ─────────────────────────────────────────────────
  async function enfiler() {
    const lot = [...ids];
    if (!lot.length || travail) return;
    const zid = zoneRequise();
    if (zid == null) return;
    const succes = $t('bibliotheque.selection.queueDone' as any);
    const echec = $t('v2.pa.queueError' as any);
    travail = true;
    let ajoutes = 0;
    try {
      // Un album après l'autre : la file garde l'ordre affiché.
      for (const id of lot) {
        await api.addToQueue(zid, { album_id: id });
        ajoutes++;
      }
      notifications.success(succes.replace('{n}', String(ajoutes)));
    } catch {
      notifications.error(echec);
    }
    travail = false;
  }

  function versPlaylist() {
    const lot = [...ids];
    if (!lot.length) return;
    demandeAjoutPlaylist.set({
      nom: $tn('bibliotheque.selection.count', lot.length),
      pistes: async () => (await api.getAlbumTracksBatch(lot)).tracks,
    });
  }

  // ── Conversion ───────────────────────────────────────────────────────
  function convertir() {
    if (vide) return;
    demanderConversion(ids);
    activeView.set('converter');
  }

  // ── Modifier en lot ──────────────────────────────────────────────────
  let genre = $state('');
  let annee = $state('');
  let artiste = $state('');
  let label = $state('');
  let compilation = $state<'' | 'oui' | 'non'>('');

  /** Les champs renseignés, tels que `batch-update` les attend. */
  function champs(): { updates: Parameters<typeof api.batchUpdateAlbums>[1]; noms: string[] } | null {
    const updates: Parameters<typeof api.batchUpdateAlbums>[1] = {};
    const noms: string[] = [];
    if (genre.trim()) { updates.genre = genre.trim(); noms.push($t('bibliotheque.selection.editGenre' as any)); }
    const y = Number(annee.trim());
    if (annee.trim()) {
      if (!Number.isInteger(y) || y < 1000 || y > 9999) return null;
      updates.year = y; noms.push($t('bibliotheque.selection.editYear' as any));
    }
    if (artiste.trim()) { updates.artist_name = artiste.trim(); noms.push($t('bibliotheque.selection.editArtist' as any)); }
    if (label.trim()) { updates.label = label.trim(); noms.push($t('bibliotheque.selection.editLabel' as any)); }
    if (compilation) { updates.is_compilation = compilation === 'oui'; noms.push($t('bibliotheque.selection.editCompil' as any)); }
    return noms.length ? { updates, noms } : null;
  }

  async function appliquerEdition(e: SubmitEvent) {
    e.preventDefault();
    const lot = [...ids];
    if (!lot.length || travail) return;
    const c = champs();
    if (!c) { notifications.error($t('bibliotheque.selection.editEmpty' as any)); return; }
    const message = $tn('bibliotheque.selection.editConfirm', lot.length).replace('{fields}', c.noms.join(', '));
    const ok = await dialogs.confirm(message, {
      danger: true,
      annulerParDefaut: true,
      valider: $t('bibliotheque.selection.editValider' as any),
    });
    if (!ok) return;
    const succes = $t('bibliotheque.selection.editDone' as any);
    const echec = $t('bibliotheque.selection.editError' as any);
    travail = true;
    try {
      const r = await api.batchUpdateAlbums(lot, c.updates);
      // Report dans la grille : le genre, l'année… changent sans relecture.
      const { artist_id: _ignore, ...visibles } = c.updates;
      for (const id of lot) mettreAJourAlbum({ id, ...visibles });
      notifications.success(succes.replace('{updated}', String(r?.updated ?? lot.length)).replace('{total}', String(r?.total ?? lot.length)));
      genre = ''; annee = ''; artiste = ''; label = ''; compilation = '';
      panneau = null;
    } catch {
      notifications.error(echec);
    }
    travail = false;
  }
</script>

<div class="barre-selection" role="toolbar" aria-label={$t('bibliotheque.selection.barre' as any)} data-barre-selection onkeydown={echap} tabindex="-1">
  <div class="rangee">
    <span class="compte" data-selection-compte aria-live="polite">{$tn('bibliotheque.selection.count', n)}</span>
    <button class="v2-btn lien" data-selection-tout onclick={onToutSelectionner} disabled={travail}>
      {$t('bibliotheque.selection.selectAll' as any).replace('{n}', String(total))}
    </button>
    {#if !vide}
      <button class="v2-btn lien" data-selection-rien onclick={onToutDeselectionner} disabled={travail}>
        {$t('bibliotheque.selection.clear' as any)}
      </button>
    {/if}
    <span class="espace"></span>
    <button class="v2-btn" data-selection-action="tag" aria-expanded={panneau === 'tag'} onclick={() => basculer('tag')} disabled={vide || travail}>
      {$t('bibliotheque.selection.addTag' as any)}
    </button>
    <button class="v2-btn" data-selection-action="file" onclick={enfiler} disabled={vide || travail}>
      {$t('bibliotheque.selection.queue' as any)}
    </button>
    <button class="v2-btn" data-selection-action="playlist" onclick={versPlaylist} disabled={vide || travail}>
      {$t('bibliotheque.selection.playlist' as any)}
    </button>
    {#if convertisseur}
      <button class="v2-btn" data-selection-action="convertir" onclick={convertir} disabled={vide || travail}>
        {$t('bibliotheque.selection.convert' as any)}
      </button>
    {/if}
    <button class="v2-btn" data-selection-action="edition" aria-expanded={panneau === 'edition'} onclick={() => basculer('edition')} disabled={vide || travail}>
      {$t('bibliotheque.selection.edit' as any)}
    </button>
    <button class="v2-btn primaire" data-selection-terminer onclick={onTerminer}>
      {$t('bibliotheque.selection.done' as any)}
    </button>
  </div>

  {#if panneau === 'tag'}
    <div class="panneau" data-selection-panneau="tag">
      {#if tags == null}
        <span class="discret">…</span>
      {:else}
        {#if !tags.length}<span class="discret">{$t('bibliotheque.selection.tagNone' as any)}</span>{/if}
        <div class="tags">
          {#each tags as tag (tag.id)}
            <button class="tag" data-tag-lot={tag.id} style:--c={tag.color || 'var(--tune-accent)'} onclick={() => poserTag(tag)} disabled={travail}>
              {tag.name}
            </button>
          {/each}
        </div>
      {/if}
      <form class="nouveau" onsubmit={(e) => { e.preventDefault(); void creerEtPoser(); }}>
        <input type="text" bind:value={nouveauTag} placeholder={$t('bibliotheque.selection.tagNew' as any)} aria-label={$t('bibliotheque.selection.tagNew' as any)} />
        <button class="v2-btn" type="submit" disabled={!nouveauTag.trim() || travail}>{$t('bibliotheque.selection.tagCreate' as any)}</button>
      </form>
    </div>
  {:else if panneau === 'edition'}
    <form class="panneau edition" data-selection-panneau="edition" onsubmit={appliquerEdition}>
      <label>{$t('bibliotheque.selection.editGenre' as any)}<input type="text" data-champ="genre" bind:value={genre} /></label>
      <label>{$t('bibliotheque.selection.editYear' as any)}<input type="text" inputmode="numeric" data-champ="annee" bind:value={annee} /></label>
      <label>{$t('bibliotheque.selection.editArtist' as any)}<input type="text" data-champ="artiste" bind:value={artiste} /></label>
      <label>{$t('bibliotheque.selection.editLabel' as any)}<input type="text" data-champ="label" bind:value={label} /></label>
      <label>{$t('bibliotheque.selection.editCompil' as any)}
        <select data-champ="compilation" bind:value={compilation}>
          <option value="">{$t('bibliotheque.selection.editUnchanged' as any)}</option>
          <option value="oui">{$t('bibliotheque.selection.editYes' as any)}</option>
          <option value="non">{$t('bibliotheque.selection.editNo' as any)}</option>
        </select>
      </label>
      <p class="discret">{$t('bibliotheque.selection.editHint' as any)}</p>
      <div class="pied">
        <button class="v2-btn" type="button" onclick={() => (panneau = null)}>{$t('bibliotheque.selection.cancel' as any)}</button>
        <button class="v2-btn primaire" type="submit" data-selection-appliquer disabled={travail}>{$t('bibliotheque.selection.editApply' as any)}</button>
      </div>
    </form>
  {/if}
</div>

<style>
  .barre-selection {
    position: sticky; top: 0; z-index: 6;
    display: flex; flex-direction: column; gap: 8px;
    margin: 0 0 12px; padding: 8px 12px;
    background: var(--tune-surface, var(--tune-bg));
    border: 1px solid var(--tune-accent);
    border-radius: 10px;
    outline: none;
  }
  .rangee { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .compte { font-weight: 600; margin-right: 6px; }
  .espace { flex: 1; }
  .lien { background: none; border-color: transparent; text-decoration: underline; }
  .primaire { background: var(--tune-accent); color: var(--tune-on-accent, #fff); border-color: var(--tune-accent); }
  .panneau { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-top: 6px; border-top: 1px solid var(--tune-border, rgba(127,127,127,.25)); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    border: 1px solid var(--c); color: inherit; background: transparent;
    border-radius: 999px; padding: 3px 10px; cursor: pointer; font: inherit;
  }
  .tag:hover, .tag:focus-visible { background: color-mix(in srgb, var(--c) 20%, transparent); }
  .nouveau { display: flex; gap: 6px; }
  .edition label { display: flex; flex-direction: column; gap: 2px; font-size: .85em; }
  .edition input, .edition select, .nouveau input { min-width: 9em; }
  .pied { display: flex; gap: 6px; margin-left: auto; }
  .discret { opacity: .7; font-size: .85em; flex-basis: 100%; margin: 0; }
  @media (max-width: 640px) {
    .espace { display: none; }
    .edition label { flex-basis: 100%; }
  }
</style>
