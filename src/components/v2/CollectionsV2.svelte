<script lang="ts">
  /**
   * Collections — nouveau client.
   *
   * Écran ABSENT du client v2 jusqu'ici : la barre latérale n'y menait pas, et
   * aucun composant ne les rendait.
   *
   * DEUX ONGLETS, comme le client actuel (`CollectionsView`) : « Smart
   * Collections » puis « Collections ». J'avais d'abord mêlé les deux sortes
   * dans une liste unique, en jugeant que la distinction était de mécanique et
   * non d'usage ; Bertrand a tranché l'inverse le 02/09/2026, et l'ordre comme
   * les libellés sont ceux de l'écran actuel.
   *
   * ## Deux sortes, deux origines
   *
   * - NORMALE : une liste d'albums choisis à la main (`album_ids`). Stockée
   *   côté serveur dans un blob JSON de `settings`, pas dans une table.
   * - SMART : une RÈGLE, évaluée à la demande. Pas de table d'appartenance ;
   *   son contenu peut changer entre deux affichages, par construction.
   *
   * ## Les pochettes
   *
   * Chaque collection porte une mosaïque, comme les playlists — même règle,
   * même composant : toujours quatre cases, pour que l'assemblage se voie.
   *
   * Le serveur rend désormais le champ `covers` avec la liste (PR serveur
   * #3151). Tant qu'il n'est pas déployé, il est ABSENT, et on retombe sur les
   * albums de la collection — une requête par collection, exactement ce que la
   * PR serveur supprime. Ce repli disparaîtra une fois la version publiée ;
   * jusque-là, l'écran fonctionne contre les deux.
   */
  import { onMount } from 'svelte';
  import { setShortcutTarget, clearShortcutTarget } from '../../lib/stores/shortcuts';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { quatreDistinctes } from '../../lib/mosaique';
  import MosaiquePochettes from './MosaiquePochettes.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import RenommerModale from './RenommerModale.svelte';
  import AlbumArt from '../AlbumArt.svelte';

  type Sorte = 'normale' | 'smart';
  interface Entree {
    sorte: Sorte;
    id: number;
    nom: string;
    description?: string | null;
    albums: number | null;
    covers: string[];
  }

  type Onglet = 'smart' | 'manuelle';
  let onglet = $state<Onglet>('smart');
  let entrees = $state<Entree[]>([]);
  /** Ce que l'onglet courant montre. Le chargement, lui, reste COMMUN : les
   *  deux listes partent ensemble, sinon changer d'onglet relancerait tout. */
  const visibles = $derived(entrees.filter((e) => (onglet === 'smart' ? e.sorte === 'smart' : e.sorte === 'normale')));
  let chargement = $state(true);
  let ouverte = $state<Entree | null>(null);
  /** Collection en cours de renommage — le bouton haut-droit de la pochette. */
  let enEdition = $state<Entree | null>(null);

  /**
   * Lecture d'une collection entière.
   *
   * Il n'existe pas de route « lire la collection » : on lit ses albums, puis
   * on enchaîne le premier. C'est un aller-retour de plus, mais il n'y a pas
   * moyen de faire autrement sans une route serveur, et une pochette sans
   * bouton de lecture serait la seule de l'écran à ne pas en avoir.
   */
  async function lireCollection(e: Entree) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.col.noZone' as any));
      return;
    }
    try {
      const liste = ((e.sorte === 'smart'
        ? await api.getSmartCollectionAlbums(e.id)
        : await api.getCollectionAlbums(e.id)) as any[]) ?? [];
      const premier = liste.find((a) => a?.id != null);
      if (!premier) {
        notifications.error($t('v2.col.emptyCollection' as any));
        return;
      }
      await api.play(zid, { album_id: premier.id });
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
    }
  }
  let albums = $state<any[]>([]);
  let albumsChargement = $state(false);

  /**
   * Créer une collection — le geste manquait (Bertrand, 04/09/2026).
   *
   * `api.createCollection` existe depuis toujours et n'avait qu'un appelant :
   * `CollectionsView.svelte`, dans le client actuel. L'écran v2 savait
   * afficher, ouvrir, lire, modifier et étiqueter une collection — pas en
   * créer une. Il renvoyait donc l'utilisateur au client qu'il remplace
   * (« Créez-en une depuis l'écran Collections actuel »), ce qu'un client
   * livrable seul ne peut pas faire.
   *
   * On réutilise `RenommerModale` : nom + description, exactement les deux
   * champs que prend la route. Une modale de création qui ne serait pas celle
   * de la modification divergerait à la première correction.
   *
   * SEULEMENT sur l'onglet manuel : une collection INTELLIGENTE se définit par
   * des règles, pas par un nom — elle a son propre éditeur, non repris ici.
   * Proposer le même bouton sur les deux onglets promettrait une création qui
   * ne produirait pas ce qu'on regarde.
   */
  let creation = $state(false);

  async function charger() {
    chargement = true;
    const [n, s] = await Promise.allSettled([
      api.getCollections(),
      api.listSmartCollections(),
    ]);

    const liste: Entree[] = [];
    if (n.status === 'fulfilled') {
      for (const c of (n.value as any[]) ?? []) {
        liste.push({
          sorte: 'normale',
          id: c.id,
          nom: c.name,
          description: c.description,
          albums: Array.isArray(c.album_ids) ? c.album_ids.length : null,
          covers: Array.isArray(c.covers) ? c.covers : [],
        });
      }
    }
    if (s.status === 'fulfilled') {
      for (const c of (s.value as any[]) ?? []) {
        liste.push({
          sorte: 'smart',
          id: c.id,
          nom: c.name,
          description: c.description,
          albums: typeof c.album_count === 'number' ? c.album_count : null,
          covers: Array.isArray((c as any).covers) ? (c as any).covers : [],
        });
      }
    }
    entrees = liste;
    chargement = false;

    // Repli : le serveur ne rend pas encore `covers`. On va les chercher, mais
    // seulement pour celles qui en manquent, et APRÈS l'affichage — la grille
    // est déjà à l'écran avec ses cadres, les mosaïques la rejoignent.
    void completerPochettes();
  }

  async function completerPochettes(): Promise<void> {
    const manquantes = entrees.filter((e) => !e.covers.length);
    if (!manquantes.length) return;
    await Promise.allSettled(
      manquantes.map(async (e) => {
        const liste =
          e.sorte === 'smart'
            ? await api.getSmartCollectionAlbums(e.id)
            : await api.getCollectionAlbums(e.id);
        const covers = quatreDistinctes((liste as any[]) ?? []);
        if (!covers.length) return;
        entrees = entrees.map((x) =>
          x.sorte === e.sorte && x.id === e.id ? { ...x, covers } : x,
        );
      }),
    );
  }

  /**
   * CLE D'UN RACCOURCI vers une collection.
   *
   * Bertrand, 05/09/2026 : « bug du raccourci sur la mauvaise cible pas
   * traite ». Poser un raccourci sur une collection precise ramenait sur la
   * LISTE : le mecanisme generique existait — `setShortcutTarget` a
   * l'ouverture, `tune:shortcut-restore` au retour — mais AUCUN ecran du
   * nouveau client n'y participait. Le raccourci ne pouvait donc que poser la
   * vue et s'arreter la.
   *
   * `smartcollections:` est la meme cle que l'ecran du client actuel : un
   * raccourci pose d'un cote se rouvre de l'autre.
   */
  const cleCible = (e: Entree) =>
    `${e.sorte === 'smart' ? 'smartcollections' : 'collections'}:${e.id}`;

  $effect(() => {
    const auRetour = async (ev: Event) => {
      const cible = (ev as CustomEvent).detail?.target;
      const cle: string | undefined = cible?.key;
      if (!cle || !/^(smart)?collections:/.test(cle)) return;
      const id = cible.restore?.id;
      if (id == null) return;
      const smart = cle.startsWith('smartcollections:');
      // L'onglet doit suivre, sinon on rouvrirait une fiche sous un onglet qui
      // ne la contient pas — et la fermer retomberait sur la mauvaise liste.
      onglet = smart ? 'smart' : 'manuelle';
      let e = entrees.find((x) => x.id === id && (x.sorte === 'smart') === smart);
      if (!e) { await charger(); e = entrees.find((x) => x.id === id && (x.sorte === 'smart') === smart); }
      if (e) ouvrir(e);
    };
    window.addEventListener('tune:shortcut-restore', auRetour);
    return () => window.removeEventListener('tune:shortcut-restore', auRetour);
  });

  // Quitter l'ecran doit oublier la cible : sinon le raccourci suivant
  // capturerait une collection qu'on ne regarde plus.
  $effect(() => () => clearShortcutTarget());

  async function ouvrir(e: Entree) {
    ouverte = e;
    setShortcutTarget({ key: cleCible(e), restore: { id: e.id, name: e.nom }, label: e.nom });
    albums = [];
    albumsChargement = true;
    try {
      albums =
        ((e.sorte === 'smart'
          ? await api.getSmartCollectionAlbums(e.id)
          : await api.getCollectionAlbums(e.id)) as any[]) ?? [];
    } catch {
      albums = [];
    }
    albumsChargement = false;
  }

  async function lireAlbum(a: any, ev: MouseEvent) {
    ev.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.col.noZone' as any));
      return;
    }
    try {
      await api.play(zid, { album_id: a.id });
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  onMount(() => {
    void charger();
  });
</script>

<section class="v2-collections tune-v2">
  {#if ouverte}
    <header class="top">
      <button class="back" onclick={() => { ouverte = null; clearShortcutTarget(); }}>← {$t('common.back' as any)}</button>
      <div class="eyebrow">{ouverte.sorte === 'smart' ? $t('v2.col.smart' as any) : $t('v2.col.manual' as any)}</div>
      <h1>{ouverte.nom}</h1>
      {#if ouverte.description}<p class="sub">{ouverte.description}</p>{/if}
    </header>

    {#if albumsChargement}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if !albums.length}
      <div class="state">{$t('v2.col.emptyCollection' as any)}</div>
    {:else}
      <div class="grid">
        {#each albums as a (a.id)}
          <button class="card" onclick={(ev) => lireAlbum(a, ev)}>
            <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} fallbackInitials={a.title?.slice(0, 1)} /></span>
            <span class="ct" title={a.title}>{a.title}</span>
            <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
          </button>
        {/each}
      </div>
    {/if}

  {:else}
    <header class="top">
      <div class="eyebrow">{$t('v2.col.eyebrow' as any)}</div>
      <h1>{$t('v2.col.title' as any)}</h1>
      {#if onglet === 'manuelle'}
        <button class="neuve" onclick={() => (creation = true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          {$t('v2.col.create' as any)}
        </button>
      {/if}
    </header>

    <nav class="tabs" role="tablist">
      <button class="tab" class:active={onglet === 'smart'} role="tab"
        aria-selected={onglet === 'smart'} onclick={() => (onglet = 'smart')}>{$t('v2.col.tabSmart' as any)}</button>
      <button class="tab" class:active={onglet === 'manuelle'} role="tab"
        aria-selected={onglet === 'manuelle'} onclick={() => (onglet = 'manuelle')}>{$t('v2.col.tabManual' as any)}</button>
    </nav>

    {#if chargement}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if !visibles.length}
      <!-- Vide de CET onglet : l'autre peut fort bien être plein, la phrase ne
           doit donc pas dire « aucune collection » tout court. -->
      <div class="state">
        {$t('v2.col.noneInTab' as any)}
        {#if onglet === 'manuelle'}
          <button class="lnkcrea" onclick={() => (creation = true)}>{$t('v2.col.create' as any)}</button>
        {/if}
      </div>
    {:else}
      <div class="grid">
        {#each visibles as e (e.sorte + ':' + e.id)}
          <div class="card">
            <span class="cv">
              <!-- Les deux sortes portent des `item_type` DISTINCTS : leurs
                   identifiants se recouvrent (l'id 1 est à la fois la
                   collection « favorites » et l'intelligente « Audiophile »
                   sur le serveur de Bertrand). Un type unique mettrait l'une
                   en favori en croyant viser l'autre. -->
              <PochetteActions
                favori={e.sorte === 'smart' ? { smartCollectionId: e.id } : { collectionId: e.id }}
                etiquettes={{ itemType: e.sorte === 'smart' ? 'smart_collection' : 'collection', itemId: e.id }}
                onEditer={e.sorte === 'normale' ? () => (enEdition = e) : null}
                onLire={() => lireCollection(e)}
                onOuvrir={() => ouvrir(e)}
                nom={e.nom}
              >
                <MosaiquePochettes pochettes={e.covers} initiales={e.nom?.slice(0, 1)} alt={e.nom} />
              </PochetteActions>
            </span>
            <button class="meta" onclick={() => ouvrir(e)}>
              <span class="ct" title={e.nom}>{e.nom}</span>
              <!-- Plus d'étiquette « Intelligente » par carte : l'onglet le dit
                   déjà, et la répéter sur chaque vignette serait du bruit. -->
              <span class="ca" title={String(e.albums ?? 0)}>{e.albums ?? 0}</span>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if enEdition}
    {@const cible = enEdition}
    <RenommerModale
      titre={$t('v2.edit.collection' as any)}
      nom={cible.nom}
      description={cible.description}
      enregistrer={(v) => api.updateCollection(cible.id, v)}
      onClose={() => (enEdition = null)}
      onSaved={charger}
    />
  {/if}

  {#if creation}
    <RenommerModale
      titre={$t('v2.col.create' as any)}
      nom=""
      description=""
      enregistrer={(v) => api.createCollection(v.name, v.description)}
      onClose={() => (creation = false)}
      onSaved={() => { creation = false; charger(); }}
    />
  {/if}
</section>

<style>
  .v2-collections{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:24px 30px 12px}
  .neuve{display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 16px;
    border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12.5px var(--v2-sans); white-space:nowrap}
  .neuve:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .neuve svg{width:16px; height:16px}
  .lnkcrea{display:block; margin-top:12px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; border-radius:999px; padding:6px 14px; font:600 11.5px var(--v2-sans)}
  .lnkcrea:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .sub{color:var(--v2-txt2); font-size:13.5px; margin-top:6px; max-width:60ch}
  .back{background:transparent; border:0; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:0 0 8px}
  .back:hover{color:var(--v2-txt)}
  .tabs{display:flex; gap:4px; padding:4px 30px 0}
  .tab{background:transparent; border:0; border-bottom:2px solid transparent; cursor:pointer;
    color:var(--v2-txt3); font:600 13.5px var(--v2-sans); padding:10px 12px}
  .tab:hover{color:var(--v2-txt2)}
  .tab.active{color:var(--v2-txt); border-bottom-color:var(--v2-acc1)}
  .state{padding:30px; color:var(--v2-txt3); font-size:13.5px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:18px; padding:12px 30px 30px}
  .card{display:flex; flex-direction:column; gap:6px; background:transparent; border:0; padding:0; text-align:left; color:inherit}
  /* La carte n'est plus un `<button>` : elle contient les cinq boutons
     d'action de la pochette, et des boutons imbriqués sont du HTML invalide. */
  .meta{display:flex; flex-direction:column; gap:6px; width:100%; border:0; background:transparent;
    padding:0; text-align:left; color:inherit; font:inherit; cursor:pointer}
  /* Le cadre porte le carré : la mosaïque le remplit, une pochette seule aussi. */
  .cv{display:block; aspect-ratio:1; width:100%; border-radius:var(--v2-r-card); overflow:hidden; background:var(--v2-surface)}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .ct{font-weight:600; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ca{font:11px var(--v2-mono); color:var(--v2-txt3); display:flex; align-items:center; gap:6px}
  .tag{font-style:normal; padding:1px 6px; border-radius:var(--v2-r-pill); background:var(--v2-surface2); color:var(--v2-txt2)}
</style>
