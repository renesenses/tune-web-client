<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import * as api from '../lib/api';
  import { onMount, onDestroy } from 'svelte';
  import { t as tr } from '../lib/i18n';
  import { ouvertureParDefaut, estUnServeurTune, RAYONS_TUNE } from '../lib/mediaServerHome';
  import { filtrerLocalement } from '../lib/rechercheServeurMedia';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import type {
    MediaServer,
    MediaServerBrowseResult,
    MediaServerItem,
    MediaServerSearchResult,
  } from '../lib/types';
  import { saveDetailScroll, restoreDetailScroll } from '../lib/stores/navigation';
  import { declarerPorteeDeVue, ouvrirNiveau, reculerDansLaVue, niveauDeVue } from '../lib/historiqueNavigation';

  let zone = $derived($currentZone);
  let loading = $state(false);

  // Navigation state
  let servers = $state<MediaServer[]>([]);
  let selectedServer = $state<MediaServer | null>(null);
  let browseResult = $state<MediaServerBrowseResult | null>(null);
  let navigationStack = $state<Array<{ objectId: string; title: string }>>([]);

  // --- Recherche DANS le serveur -------------------------------------------
  //
  // Parcourir une arborescence de plusieurs milliers d'entrées pour y trouver
  // un titre est intenable : `Search` demande au serveur de chercher dans SON
  // index. Tous ne savent pas le faire — la route rend alors `supported:
  // false`, et on filtre le dossier affiché en le DISANT, plutôt que de laisser
  // croire à une recherche complète.
  let requete = $state('');
  let toutLeServeur = $state(true);
  let resultatRecherche = $state<MediaServerSearchResult | null>(null);
  let rechercheEnCours = $state(false);
  let repliLocal = $state(false);
  let minuterieRecherche: ReturnType<typeof setTimeout> | null = null;

  /** Ce qu'on affiche : les résultats s'il y en a, sinon le dossier courant. */
  const RESULTAT_VIDE: MediaServerBrowseResult = {
    object_id: '0',
    containers: [],
    items: [],
    total_matches: 0,
    number_returned: 0,
  };

  // Jamais `null` : ce bloc n'est rendu que serveur ouvert, et un type
  // nullable ici obligerait a garder chaque acces dans le gabarit.
  let affichage = $derived.by<MediaServerBrowseResult>(() => {
    if (!requete.trim()) return browseResult ?? RESULTAT_VIDE;
    if (resultatRecherche && !repliLocal) {
      return {
        object_id: resultatRecherche.container,
        containers: resultatRecherche.containers,
        items: resultatRecherche.items,
        total_matches: resultatRecherche.total_matches,
        number_returned: resultatRecherche.number_returned,
      };
    }
    // Repli : on filtre ce qui est déjà à l'écran, avec le même repli
    // d'accents que la recherche de la bibliothèque (module testé).
    if (!browseResult) return RESULTAT_VIDE;
    return filtrerLocalement(browseResult, requete);
  });

  function surSaisieRecherche() {
    if (minuterieRecherche) clearTimeout(minuterieRecherche);
    // 300 ms : assez pour ne pas interroger à chaque touche, assez court pour
    // que la liste suive la frappe.
    minuterieRecherche = setTimeout(lancerRecherche, 300);
  }

  async function lancerRecherche() {
    const q = requete.trim();
    if (!selectedServer || !q) {
      resultatRecherche = null;
      repliLocal = false;
      return;
    }
    rechercheEnCours = true;
    try {
      const res = await api.searchMediaServer(
        selectedServer.id,
        q,
        toutLeServeur ? '0' : currentObjectId()
      );
      resultatRecherche = res;
      repliLocal = !res.supported;
    } catch (e) {
      console.error('Recherche serveur média :', e);
      // Une panne de la route ne doit pas laisser l'écran vide : on filtre ce
      // qu'on a déjà.
      resultatRecherche = null;
      repliLocal = true;
    }
    rechercheEnCours = false;
  }

  function effacerRecherche() {
    if (minuterieRecherche) clearTimeout(minuterieRecherche);
    requete = '';
    resultatRecherche = null;
    repliLocal = false;
  }

  // Breadcrumbs derived from navigation stack
  let breadcrumbs = $derived.by(() => {
    if (!selectedServer) return [];
    const crumbs: Array<{ title: string; objectId: string | null }> = [];
    crumbs.push({ title: $tr('mediaservers.title'), objectId: null });
    crumbs.push({ title: selectedServer.name, objectId: '0' });
    for (const entry of navigationStack) {
      crumbs.push({ title: entry.title, objectId: entry.objectId });
    }
    return crumbs;
  });

  async function loadServers() {
    loading = true;
    try {
      servers = await api.getMediaServers();
    } catch (e) {
      console.error('Media servers error:', e);
    }
    loading = false;
  }

  // Hierarchical DLNA browser: scroll position is kept per container level
  // (objectId) so going back up returns to the same spot.
  let msEl = $state<HTMLDivElement | null>(null);
  const msKey = (objectId: string) => 'ms:' + (selectedServer?.id ?? '') + ':' + objectId;
  const currentObjectId = () => navigationStack.length ? navigationStack[navigationStack.length - 1].objectId : '0';

  // Un serveur Tune se reconnait a ce qu'il annonce (MozAIk Labs / Tune) : on
  // ne connait la racine QUE de celui-la, et proposer ses rayons a un serveur
  // tiers afficherait des dossiers qui n'existent pas chez lui.
  let estServeurTune = $derived(!!selectedServer && estUnServeurTune(selectedServer));

  /**
   * Aller directement a un rayon, sans repasser par la racine.
   *
   * On REMPLACE la pile de navigation au lieu d'empiler : passer des albums
   * aux artistes n'est pas descendre d'un cran, c'est changer de rayon. Sans
   * cela, « Retour » ramenerait aux albums plutot qu'a la racine, et le fil
   * d'Ariane s'allongerait a chaque va-et-vient.
   */
  async function allerAuRayon(objectId: string, titre: string) {
    if (!selectedServer) return;
    navigationStack = [];
    await browseTo(objectId, titre);
  }

  async function selectServer(server: MediaServer) {
    selectedServer = server;
    navigationStack = [];
    await browseTo('0', server.name);

    // Un autre serveur Tune n'est pas un inconnu : sa racine est
    // Artists / Albums / Genres / All Tracks / Radio. On ouvre donc
    // directement sur les albums, comme la bibliothèque locale s'ouvre sur les
    // albums — la racine reste à un clic dans le fil d'Ariane.
    //
    // Et on ne le fait QUE si les albums répondent : un dossier ouvert
    // d'autorité et vide se lirait comme une bibliothèque cassée, alors que la
    // racine, elle, marche toujours. Le repli est donc le comportement d'avant.
    const ouverture = ouvertureParDefaut(server);
    if (ouverture && (browseResult?.containers?.length ?? 0) > 0) {
      const avant = browseResult;
      await browseTo(ouverture.objectId, ouverture.titre);
      const vide =
        (browseResult?.containers?.length ?? 0) === 0 &&
        (browseResult?.items?.length ?? 0) === 0;
      if (vide) {
        navigationStack = [];
        browseResult = avant;
        publierLeNiveau();
      }
    }
  }

  async function browseTo(objectId: string, title?: string) {
    if (!selectedServer) return;
    saveDetailScroll(msKey(currentObjectId()), msEl);
    loading = true;
    try {
      browseResult = await api.browseMediaServer(selectedServer.id, objectId);
      // Only push to stack if not root and not already at this level
      if (title && objectId !== '0') {
        navigationStack = [...navigationStack, { objectId, title }];
      }
    } catch (e) {
      console.error('Browse error:', e);
    }
    loading = false;
    restoreDetailScroll(msKey(objectId), msEl);
    publierLeNiveau();
  }

  /**
   * Le niveau de cette vue, c'est le serveur ouvert PLUS le chemin parcouru
   * dedans. Chaque descente devient une entree d'historique : le bouton du
   * navigateur remonte d'un cran dans l'arborescence au lieu de quitter la vue
   * -- ce que faisait deja le bouton de l'ecran, mais lui seul.
   */
  function publierLeNiveau() {
    if (restaurationEnCours) return;
    if (!selectedServer) { niveauDeVue.set(null); return; }
    ouvrirNiveau('mediaservers', { server: selectedServer, stack: navigationStack });
  }

  let restaurationEnCours = false;

  /** Repose un niveau atteint par l'historique, sans re-empiler. */
  async function reprendreLeNiveau(etat: any) {
    restaurationEnCours = true;
    try {
      if (!etat?.server) { goToServers(); return; }
      selectedServer = etat.server;
      navigationStack = etat.stack ?? [];
      const cible = navigationStack.length
        ? navigationStack[navigationStack.length - 1].objectId
        : '0';
      loading = true;
      try {
        browseResult = await api.browseMediaServer(etat.server.id, cible);
      } catch (e) {
        console.error('Browse error:', e);
      }
      loading = false;
      restoreDetailScroll(msKey(cible), msEl);
    } finally {
      restaurationEnCours = false;
    }
  }

  $effect(() => declarerPorteeDeVue('mediaservers', {
    retablir(etat: any) { void reprendreLeNiveau(etat); },
  }));

  function navigateToBreadcrumb(objectId: string | null) {
    if (objectId === null) {
      goToServers();
      return;
    }
    if (objectId === '0' && selectedServer) {
      navigationStack = [];
      browseTo('0', selectedServer.name);
      return;
    }
    // Find the index and truncate stack
    const idx = navigationStack.findIndex(e => e.objectId === objectId);
    if (idx >= 0) {
      saveDetailScroll(msKey(currentObjectId()), msEl);
      navigationStack = navigationStack.slice(0, idx + 1);
      if (selectedServer) {
        loading = true;
        api.browseMediaServer(selectedServer.id, objectId).then(res => {
          browseResult = res;
          loading = false;
          restoreDetailScroll(msKey(objectId), msEl);
        }).catch(() => { loading = false; });
      }
    }
  }

  function goBack() {
    // Un seul chemin de retour : l'historique. La pile parallele
    // `navigationStack` reste la structure de la vue, mais ce n'est plus ELLE
    // qui decide du retour -- l'entree atteinte porte le chemin a reposer.
    saveDetailScroll(msKey(currentObjectId()), msEl);
    reculerDansLaVue();
  }

  function goToServers() {
    selectedServer = null;
    browseResult = null;
    navigationStack = [];
  }

  export function getMediaServerState() {
    if (!selectedServer) return null;
    return {
      serverId: selectedServer.id,
      serverName: selectedServer.name,
      navigationStack: [...navigationStack],
    };
  }

  async function handleShortcutRestore(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (!detail?.mediaServer) return;
    const { serverId, serverName, navigationStack: stack } = detail.mediaServer;
    if (!serverId) return;
    await loadServers();
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    selectedServer = server;
    navigationStack = [];
    loading = true;
    try {
      browseResult = await api.browseMediaServer(serverId, '0');
      for (const entry of (stack || [])) {
        navigationStack = [...navigationStack, entry];
        browseResult = await api.browseMediaServer(serverId, entry.objectId);
      }
    } catch (e) {
      console.error('restore_media_server_error', e);
    }
    loading = false;
  }

  onMount(() => {
    (window as any).__tuneMediaServerState = getMediaServerState;
    window.addEventListener('tune:shortcut-restore-mediaserver', handleShortcutRestore);
  });
  onDestroy(() => {
    delete (window as any).__tuneMediaServerState;
    window.removeEventListener('tune:shortcut-restore-mediaserver', handleShortcutRestore);
  });

  async function playItem(item: MediaServerItem) {
    if (!zone?.id || !item.res_url) return;
    try {
      const body: Record<string, unknown> = {
        source: 'upnp',
        source_id: item.res_url,
      };
      if (item.title) body.title = item.title;
      if (item.artist) body.artist_name = item.artist;
      if (item.album) body.album_title = item.album;
      if (item.album_art_uri) body.cover_path = item.album_art_uri;
      if (item.duration_ms) body.duration_ms = item.duration_ms;
      await playAndSync(zone.id, body as any);
    } catch (e) {
      console.error('Play media server item error:', e);
    }
  }

  async function addItemToQueue(item: MediaServerItem) {
    if (!zone?.id || !item.res_url) return;
    try {
      const body: Record<string, unknown> = {
        source: 'upnp',
        source_id: item.res_url,
      };
      if (item.title) body.title = item.title;
      if (item.artist) body.artist_name = item.artist;
      if (item.album) body.album_title = item.album;
      if (item.album_art_uri) body.cover_path = item.album_art_uri;
      if (item.duration_ms) body.duration_ms = item.duration_ms;
      await api.addToQueue(zone.id, body as any);
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  /// Jouer un conteneur (album) depuis sa pochette, sans y naviguer —
  /// le geste de la bibliothèque : la carte ouvre, le survol joue.
  async function jouerConteneur(container: { id: string }) {
    if (!zone?.id || !selectedServer) return;
    try {
      const res = await api.browseMediaServer(selectedServer.id, container.id);
      const items = (res.items ?? []).filter((i: any) => i.res_url);
      if (items.length === 0) return;
      await playItem(items[0]);
      for (let i = 1; i < items.length; i++) {
        await addItemToQueue(items[i]);
      }
    } catch (e) {
      console.error('Play container error:', e);
    }
  }

  async function playAllItems() {
    if (!zone?.id || !browseResult) return;
    const items = browseResult.items.filter(i => i.res_url);
    if (items.length === 0) return;
    try {
      await playItem(items[0]);
      for (let i = 1; i < items.length; i++) {
        await addItemToQueue(items[i]);
      }
    } catch (e) {
      console.error('Play all items error:', e);
    }
  }

  async function shuffleAllItems() {
    if (!zone?.id || !browseResult) return;
    const items = browseResult.items.filter(i => i.res_url);
    if (items.length === 0) return;
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    try {
      await playItem(shuffled[0]);
      for (let i = 1; i < shuffled.length; i++) {
        await addItemToQueue(shuffled[i]);
      }
    } catch (e) {
      console.error('Shuffle all items error:', e);
    }
  }

  async function addAllItemsToQueue() {
    if (!zone?.id || !browseResult) return;
    const items = browseResult.items.filter(i => i.res_url);
    try {
      for (const item of items) {
        await addItemToQueue(item);
      }
    } catch (e) {
      console.error('Add all to queue error:', e);
    }
  }

  function parseItemAudio(item: MediaServerItem): { format?: string; sample_rate?: number; bit_depth?: number } | null {
    if (!item.res_url) return null;
    const url = item.res_url.toLowerCase();
    let fmt = '';
    if (url.includes('.flac')) fmt = 'flac';
    else if (url.includes('.wav')) fmt = 'wav';
    else if (url.includes('.mp3')) fmt = 'mp3';
    else if (url.includes('.m4a') || url.includes('.aac')) fmt = 'aac';
    else if (url.includes('.ogg')) fmt = 'ogg';
    else if (url.includes('.dsf') || url.includes('.dsd')) fmt = 'dsd';
    else if (url.includes('.aiff') || url.includes('.aif')) fmt = 'aiff';

    // Parse Asset UPnP URL pattern: /content/c2/b16/f44100/
    const match = url.match(/\/c(\d+)\/b(\d+)\/f(\d+)\//);
    if (match) {
      return { format: fmt || undefined, bit_depth: parseInt(match[2]), sample_rate: parseInt(match[3]) };
    }
    return fmt ? { format: fmt } : null;
  }

  // Load servers on mount
  loadServers();
</script>

<div class="mediaservers-view" bind:this={msEl}>
  {#if selectedServer && browseResult}
    <!-- Browsing a server -->
    <div class="ms-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <nav class="breadcrumbs">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}
            <span class="breadcrumb-sep">/</span>
          {/if}
          {#if i < breadcrumbs.length - 1}
            <button class="breadcrumb-link" onclick={() => navigateToBreadcrumb(crumb.objectId)}>
              {crumb.title}
            </button>
          {:else}
            <span class="breadcrumb-current">{crumb.title}</span>
          {/if}
        {/each}
      </nav>
      <button class="refresh-btn" onclick={() => selectedServer && browseTo(browseResult?.object_id ?? '0')} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        {$tr('mediaservers.refresh')}
      </button>
    </div>

    <div class="ms-recherche">
      <input
        class="ms-recherche-champ"
        type="search"
        bind:value={requete}
        oninput={surSaisieRecherche}
        placeholder={$tr('mediaservers.searchPlaceholder')}
        aria-label={$tr('mediaservers.searchPlaceholder')}
      />
      <div class="ms-portee" role="group" aria-label={$tr('mediaservers.searchResults')}>
        <button
          class="ms-portee-btn"
          class:actif={toutLeServeur}
          onclick={() => { toutLeServeur = true; lancerRecherche(); }}>{$tr('mediaservers.searchScopeServer')}</button
        >
        <button
          class="ms-portee-btn"
          class:actif={!toutLeServeur}
          onclick={() => { toutLeServeur = false; lancerRecherche(); }}>{$tr('mediaservers.searchScopeFolder')}</button
        >
      </div>
      {#if requete}
        <button class="ms-recherche-effacer" onclick={effacerRecherche} aria-label={$tr('common.close')}>×</button>
      {/if}
    </div>

    {#if requete.trim() && repliLocal}
      <!-- Le serveur ne sait pas chercher : le dire, plutot que de laisser
           croire que la recherche a porte sur toute la bibliotheque. -->
      <p class="ms-repli">{$tr('mediaservers.searchLocalFallback')}</p>
    {/if}

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
      </div>
    {:else}
      <!-- Containers: grid with covers if albums, list if folders -->
      {#if estServeurTune}
        <!-- Les rayons d'un serveur Tune, en onglets : sans eux, passer des
             albums aux artistes imposait de remonter à la racine. C'est ce qui
             séparait « une grille d'albums » de la vue bibliothèque. -->
        <div class="rayons">
          {#each RAYONS_TUNE as r (r.objectId)}
            <button
              class="rayon"
              class:actif={currentObjectId() === r.objectId}
              onclick={() => allerAuRayon(r.objectId, $tr(r.cle as any))}>{$tr(r.cle as any)}</button
            >
          {/each}
        </div>
      {/if}

      {#if affichage.containers.length > 0}
        {@const categoryNames = new Set(['Album Artist', 'Album', 'Title', 'Composer', 'Genre', 'Dynamic Browsing', 'TuneIn Internet Radio', 'Additional', 'New Albums', 'Jukebox Track Selection', 'Top Artists', 'Top Albums', 'All Albums', 'All Artists', '[All Albums]', '[All Artists]'])}
        {@const isCategoryLevel = affichage.containers.every(c => categoryNames.has(c.title) || c.title.match(/^\[.*\]$/))}
        {@const isAlbumGrid = !isCategoryLevel && affichage.containers.some(c => c.album_art_uri)}
        {#if isAlbumGrid}
          <div class="album-grid">
            {#each affichage.containers as container}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="album-grid-card" onclick={() => browseTo(container.id, container.title)}>
                <div class="album-grid-art-wrap">
                  {#if container.album_art_uri}
                    <img src={container.album_art_uri} alt="" class="album-grid-art" loading="lazy" />
                  {/if}
                  <!-- Le geste de la bibliothèque : la carte OUVRE l'album, le
                       survol de la pochette le JOUE — iso Library/Albums
                       (Bertrand, 25/08). -->
                  <button
                    class="play-overlay"
                    onclick={(e) => { e.stopPropagation(); jouerConteneur(container); }}
                    title={$tr('mediaservers.playAll')}
                  >
                    <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
                <span class="album-grid-title truncate">{container.title}</span>
                {#if container.artist}
                  <!-- Le serveur envoyait `dc:creator` depuis toujours ; c'est
                       notre analyseur DIDL qui le jetait pour les conteneurs.
                       Une grille d'albums sans artiste n'est pas une
                       bibliothèque. -->
                  <span class="album-grid-artist truncate">{container.artist}</span>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="container-list">
            {#each affichage.containers as container}
              <button class="container-item" onclick={() => browseTo(container.id, container.title)}>
                <svg class="container-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="container-name">{container.title}</span>
                {#if container.child_count > 0}
                  <span class="container-count">{container.child_count}</span>
                {/if}
                <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- Items (tracks) -->
      {#if affichage.items.length > 0}
        <div class="items-header">
          <span class="items-count">{affichage.items.length} {$tr('mediaservers.items')}</span>
          <div class="items-actions">
            <button class="play-all-btn" onclick={() => playAllItems()}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
              {$tr('mediaservers.playAll')}
            </button>
            <button class="play-all-btn" onclick={() => shuffleAllItems()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              {$tr('mediaservers.shuffle')}
            </button>
            <button class="add-all-btn" onclick={() => addAllItemsToQueue()}>{$tr('mediaservers.addAll')}</button>
          </div>
        </div>
        <div class="item-list">
          {#each affichage.items as item, index}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="item-row" class:clickable={!!item.res_url} onclick={() => item.res_url && playItem(item)}>
              <span class="item-num">{index + 1}</span>
              <span class="item-thumb">
                {#if item.album_art_uri}
                  <img src={item.album_art_uri} alt="" loading="lazy" />
                {:else}
                  <span class="item-thumb-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                  </span>
                {/if}
              </span>
              <div class="item-info">
                <span class="item-title truncate">{item.title}</span>
                <span class="item-meta truncate">
                  {#if item.artist}<span>{item.artist}</span>{/if}
                  {#if item.artist && item.album}<span class="item-sep"> — </span>{/if}
                  {#if item.album}<span>{item.album}</span>{/if}
                </span>
              </div>
              {#if parseItemAudio(item)}
                <span class="audio-format">{formatAudioBadge(parseItemAudio(item))}</span>
              {/if}
              {#if item.duration_ms}
                <span class="item-duration">{formatTime(item.duration_ms)}</span>
              {/if}
              {#if item.res_url}
                <button class="item-add-queue" onclick={(e) => { e.stopPropagation(); addItemToQueue(item); }} title={$tr('queue.addToQueue')}>+</button>
              {/if}
            </div>
          {/each}
        </div>
      {:else if affichage.containers.length === 0}
        <div class="empty">{$tr('mediaservers.noContent')}</div>
      {/if}
    {/if}

  {:else}
    <!-- Server list -->
    <div class="ms-header">
      <h2>{$tr('mediaservers.title')}</h2>
      <button class="refresh-btn" onclick={loadServers} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        {$tr('mediaservers.refresh')}
      </button>
    </div>

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('mediaservers.searching')}
      </div>
    {:else if servers.length === 0}
      <div class="empty">{$tr('mediaservers.noServers')}</div>
    {:else}
      <div class="server-list">
        {#each servers as server}
          <button class="server-item" onclick={() => selectServer(server)}>
            <svg class="server-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <div class="server-info">
              <span class="server-name">{server.name}</span>
              <span class="server-detail truncate">{server.manufacturer} &middot; {server.host}:{server.port}</span>
            </div>
            <!-- Depuis le serveur 0.9.118, le contrat s'appelle `reachable`.
                 `false` est le seul signal qui autorise « indisponible » ; un
                 champ absent vient d'un ancien serveur et reste inconnu. Ne
                 pas le rabattre sur l'ancien `available`, qui n'a jamais été
                 émis par cette route (#2139, garde de régression #1122). -->
            {#if server.reachable === true}
              <span class="server-status available" aria-hidden="true"></span>
            {:else if server.reachable === false}
              <span class="server-status unavailable">{$tr('mediaservers.unavailable')}</span>
            {/if}
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .mediaservers-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .ms-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .ms-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .ms-recherche {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 10px;
  }
  .ms-recherche-champ {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--tune-border);
    background: var(--tune-bg-elevated, var(--tune-bg));
    color: var(--tune-text);
    font-size: 0.9rem;
  }
  .ms-portee {
    display: flex;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm, 6px);
    overflow: hidden;
    flex-shrink: 0;
  }
  .ms-portee-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    padding: 6px 10px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .ms-portee-btn.actif {
    background: var(--tune-accent);
    color: #fff;
  }
  .ms-recherche-effacer {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .ms-repli {
    margin: 0 16px 10px;
    padding: 8px 10px;
    border-radius: var(--radius-sm, 6px);
    background: var(--tune-accent-bg, rgba(99, 102, 241, 0.12));
    color: var(--tune-text-muted);
    font-size: 0.85rem;
  }

  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 13px;
    min-width: 0;
    overflow: hidden;
  }

  .breadcrumb-sep {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .breadcrumb-link {
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 0;
    font-family: var(--font-body);
    font-size: 13px;
    white-space: nowrap;
    transition: color 0.12s;
  }

  .breadcrumb-link:hover {
    color: var(--tune-accent);
  }

  .breadcrumb-current {
    color: var(--tune-text);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
    margin-left: auto;
  }

  .refresh-btn:hover:not(:disabled) {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Server list */
  .server-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .server-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 14px 20px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    color: var(--tune-text);
    transition: all 0.12s ease-out;
    margin-bottom: var(--space-sm);
  }

  .server-item:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }

  .server-icon {
    flex-shrink: 0;
    opacity: 0.6;
  }

  .server-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .server-name {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .server-detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .server-status {
    font-family: var(--font-body);
    font-size: 12px;
    flex-shrink: 0;
  }

  .server-status.available::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
  }

  .server-status.unavailable {
    color: var(--tune-text-muted);
  }

  /* Album grid */
  /* Iso Bibliothèque / Albums : mêmes colonnes, mêmes cartes, même survol
     (Bertrand, 25/08). Les valeurs viennent de LibraryView — si l'une
     change là-bas, elle doit changer ici. */
  .album-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--album-col-min, 140px), 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg);
    align-items: start;
    margin-bottom: var(--space-lg);
  }

  .album-grid-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 6px);
    cursor: pointer;
    min-width: 0;
    color: var(--tune-text);
  }

  .album-grid-art-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .album-grid-art-wrap::before {
    content: "♪";
    position: absolute;
    font-size: 32px;
    color: var(--tune-text-muted, #555);
    opacity: 0.3;
    z-index: 0;
  }

  .album-grid-art {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    position: relative;
    z-index: 1;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.15s ease-out;
    border: none;
    cursor: pointer;
    z-index: 2;
  }

  .album-grid-art-wrap:hover .play-overlay {
    opacity: 1;
  }

.rayons { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 0 0 0.9rem; }
  .rayon {
    padding: 0.3rem 0.85rem; border-radius: 999px; font-size: 0.8125rem;
    background: var(--surface, #1b1b1b); color: var(--text-muted, #aaa);
  }
  .rayon.actif { background: var(--accent, #2b7); color: #fff; }
  /* L'artiste se lit sous le titre, plus discret que lui — comme dans la
     bibliotheque locale. */
  .album-grid-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }
  .album-grid-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  /* Container list */
  .container-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: var(--space-lg);
  }

  .container-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-body);
    font-size: 14px;
    transition: background 0.12s ease-out;
    border-radius: var(--radius-sm);
  }

  .container-item:hover {
    background: var(--tune-surface-hover);
  }

  .container-icon {
    flex-shrink: 0;
    color: var(--tune-text-secondary);
    opacity: 0.7;
  }

  .container-name {
    flex: 1;
    font-weight: 600;
  }

  .container-count {
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .chevron {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Items section */
  .items-header {
    display: flex;
    align-items: center;
    padding: var(--space-sm) 0;
    margin-bottom: var(--space-sm);
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-md);
  }

  .items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .items-count {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .items-actions {
    display: flex;
    gap: 8px;
  }

  .play-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tune-accent);
    color: white;
    border: none;
    padding: 6px 16px;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s;
  }

  .play-all-btn:hover {
    opacity: 0.85;
  }

  .add-all-btn {
    background: none;
    color: var(--tune-text-secondary);
    border: 1px solid var(--tune-border);
    padding: 6px 14px;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .add-all-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .item-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 20px;
    transition: background 0.12s ease-out;
  }

  .item-row.clickable {
    cursor: pointer;
  }

  .item-row:hover {
    background: var(--tune-surface-hover);
  }

  .item-thumb {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .item-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .item-thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-surface);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .item-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .item-add-queue {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    font-size: 14px;
    font-weight: 600;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s, border-color 0.12s;
  }

  .item-row:hover .item-add-queue {
    opacity: 1;
  }

  .item-add-queue:hover {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
  }

  .item-num {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    color: var(--tune-text);
  }

  .item-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .item-sep {
    color: var(--tune-text-muted);
  }

  /* Loading / Empty */
  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
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

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
