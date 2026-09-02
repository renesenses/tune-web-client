<script lang="ts">
  /**
   * Playlists du nouveau client (direction Levente). Cœur de nav, présent à
   * tous les niveaux. Densité par niveau :
   *   Essentiel → vos playlists locales, lecture et consultation.
   *   Avancé    → création d'une playlist + playlists importées des services.
   *   Expert    → renommer / supprimer une playlist, retirer un titre, ligne
   *               technique par piste (dans la fiche).
   *
   * Le clic ouvre l'overlay PlaylistDetailV2 (la section est `position:relative`).
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration } from '../../lib/utils';
  import type { Playlist, StreamingPlaylist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import MosaiquePochettes from './MosaiquePochettes.svelte';
  import { t } from '../../lib/i18n';
  import { quatreDistinctes } from '../../lib/mosaique';
  import { notifications } from '../../lib/stores/notifications';
  import PochetteActions from './PochetteActions.svelte';
  import RenommerModale from './RenommerModale.svelte';
  import PlaylistDetailV2 from './PlaylistDetailV2.svelte';
  import '../../styles/tune-v2.css';

  const showAdvanced = $derived(atLeast($preferences.settingsLevel, 'intermediate'));

  let local = $state<Playlist[]>([]);
  let services = $state<Record<string, StreamingPlaylist[]>>({});
  let loading = $state(true);
  let creating = $state(false);
  let newName = $state('');
  let opened = $state<
    | { kind: 'local'; pl: Playlist }
    | { kind: 'streaming'; service: string; pl: StreamingPlaylist }
    | null
  >(null);

  /**
   * Pochettes de mosaïque, par playlist locale.
   *
   * Le serveur ne rend AUCUNE pochette pour une playlist locale : `/playlists`
   * ne porte que `description, id, name, track_count`. Mesuré le 01/09/2026 —
   * le composant lisait `pl.cover_path`, toujours vide. Les pochettes se
   * trouvent donc dans les PISTES, une requête par playlist.
   */
  let mosaiques = $state<Record<number, string[]>>({});

  /**
   * Charge les pochettes APRÈS que la liste est affichée, jamais avant.
   *
   * ⚠️ C'est une requête PAR PLAYLIST. Treize sur le serveur de test, en
   * réseau local, à 8 ms — invisible. Chez un testeur avec cent playlists et un
   * serveur distant, ce sera cent requêtes. Elles ne bloquent donc rien : la
   * grille s'affiche avec ses pictogrammes, les mosaïques la rejoignent au fil
   * de l'eau, et un échec ne coûte que sa propre vignette.
   *
   * La vraie réponse est côté serveur — rendre les quatre pochettes avec la
   * playlist. Tant qu'elle n'existe pas, ceci reste correct mais ne passera pas
   * à l'échelle sans chargement à la demande.
   */
  async function chargerMosaiques(liste: Playlist[]): Promise<void> {
    await Promise.allSettled(
      liste.map(async (pl) => {
        if (pl.id == null) return;
        const pistes = await api.getPlaylistTracks(pl.id);
        // DISTINCTES et dans l'ordre de la playlist : deux titres du même album
        // ne doivent pas occuper deux cases.
        const vues: string[] = [];
        for (const t of pistes ?? []) {
          const c = (t as any)?.cover_path;
          if (c && !vues.includes(c)) vues.push(c);
          if (vues.length === 4) break;
        }
        if (vues.length) mosaiques = { ...mosaiques, [pl.id]: vues };
      }),
    );
  }

  /**
   * Charge les playlists LOCALES et celles de chaque service authentifié.
   *
   * 🔴 Cet écran n'a JAMAIS rien affiché. Il appelait `getAllPlaylists()`,
   * c'est-à-dire `GET /playlists/all`, et lisait `r.local` / `r.services` sur
   * la réponse. Or cette route rend un TABLEAU PLAT des playlists locales :
   * les deux champs valaient `undefined`, donc la liste locale était vide et
   * les groupes de services n'existaient pas.
   *
   * Constaté par Bertrand le 02/09/2026 — « il manque Qobuz et Tidal » — sur
   * un serveur qui porte 13 playlists locales et un compte Qobuz authentifié.
   *
   * Le chargement suit celui du hub du client actuel, le seul correct : les
   * playlists locales d'un côté, et de l'autre UN appel par service
   * authentifié. Il n'existe pas de route qui rende les deux d'un coup.
   */
  function load() {
    loading = true;
    mosaiques = {};
    Promise.all([
      api.getPlaylists().catch(() => [] as Playlist[]),
      api.getStreamingServices().catch(() => ({}) as Record<string, any>),
    ])
      .then(async ([locales, svc]) => {
        local = locales ?? [];
        void chargerMosaiques(local);

        // Seuls les services AUTHENTIFIÉS : interroger les autres rendrait une
        // erreur par service, et ferait apparaître des groupes vides.
        const noms = Object.entries(svc ?? {})
          .filter(([, s]: [string, any]) => s?.authenticated)
          .map(([n]) => n);
        const par: Record<string, StreamingPlaylist[]> = {};
        await Promise.all(
          noms.map(async (n) => {
            try {
              par[n] = (await api.getStreamingPlaylists(n)) ?? [];
            } catch {
              // Un service qui ne répond pas ne doit pas emporter les autres.
              par[n] = [];
            }
          }),
        );
        services = par;
      })
      .catch(() => {
        local = [];
        services = {};
      })
      .finally(() => {
        loading = false;
      });
  }
  $effect(() => { load(); });

  const svcEntries = $derived(Object.entries(services).filter(([, l]) => l.length));

  // `e` optionnel : appelée depuis les cartes historiques (qui propagent) et
  // depuis `PochetteActions`, qui a déjà arrêté le geste.
  function playLocal(pl: Playlist, e?: MouseEvent) {
    e?.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null || pl.id == null) return;
    api.play(zid, { playlist_id: pl.id }).catch(() => {});
  }
  /**
   * DEUX ONGLETS, comme les collections.
   *
   * Choix de Bertrand du 02/09/2026, le même qu'il avait fait pour les
   * collections : les playlists intelligentes sont une RÈGLE évaluée à la
   * demande, pas une liste qu'on remplit. Les mêler aux autres mettrait deux
   * mécaniques dans la même grille.
   *
   * Elles n'apparaissaient NULLE PART dans le nouveau client — quatre existent
   * sur son serveur (« 50 Random Tracks », « Most Played », « Never Played »,
   * « Recently Added »).
   */
  type Onglet = 'listes' | 'smart';
  let onglet = $state<Onglet>('listes');

  /**
   * DEUX NIVEAUX d'onglets, comme l'écran Streaming.
   *
   * Bertrand, 02/09/2026 : les groupes empilés — locales, puis Qobuz, puis
   * Tidal — n'étaient « pas lisibles ». Sur un compte fourni, il fallait
   * défiler pour savoir ce qu'il y avait plus bas, et rien n'annonçait les
   * sources disponibles.
   *
   * Premier niveau, en PASTILLES : la source. Second niveau, SOULIGNÉ : le
   * type. Exactement la disposition de `StreamingV2` — service en pastilles,
   * rubrique en dessous.
   *
   * Le second niveau n'existe que pour « cet appareil » : une playlist
   * intelligente est une règle locale, un service n'en a pas.
   */
  const LOCAL = '__local__';
  let source = $state<string>(LOCAL);

  /** Les sources offertes : cet appareil, puis chaque service qui a des
   *  playlists. Un service authentifié mais sans playlist n'ouvre pas une
   *  pastille vide. */
  const sources = $derived([LOCAL, ...svcEntries.map(([n]) => n)]);

  // La source choisie peut disparaître — service déconnecté, playlists vidées.
  // Sans ce repli l'écran resterait sur une pastille qui n'existe plus.
  $effect(() => {
    if (!sources.includes(source)) source = LOCAL;
  });

  let smart = $state<any[]>([]);
  let smartCharge = false;
  let smartMosaiques = $state<Record<number, string[]>>({});

  async function chargerSmart() {
    if (smartCharge) return;
    smartCharge = true;
    try {
      smart = (await api.getSmartPlaylists()) ?? [];
    } catch {
      smart = [];
    }
    // Les pochettes APRÈS la grille : les cadres sont déjà à l'écran, les
    // mosaïques les rejoignent. Une règle peut viser des milliers de pistes,
    // on n'en lit donc que le début.
    for (const sp of smart) {
      if (sp?.id == null) continue;
      try {
        const pistes = (await api.getSmartPlaylistTracks(sp.id)) ?? [];
        const covers = quatreDistinctes(pistes.slice(0, 60) as any[]);
        if (covers.length) smartMosaiques = { ...smartMosaiques, [sp.id]: covers };
      } catch {
        /* une règle illisible ne doit pas vider la grille */
      }
    }
  }

  $effect(() => {
    if (onglet === 'smart') void chargerSmart();
  });

  function lireSmart(sp: any) {
    const zid = $currentZoneId;
    if (zid == null || sp?.id == null) return;
    // Pas de route « lire la playlist intelligente » : on lit ses pistes et on
    // enfile la liste. Une règle n'a pas d'identité de file côté serveur.
    api
      .getSmartPlaylistTracks(sp.id)
      .then((pistes) => {
        const ids = (pistes ?? []).map((t: any) => t.id).filter((x: any) => x != null);
        if (ids.length) return api.play(zid, { track_ids: ids.slice(0, 500) });
      })
      .catch(() => {});
  }

  // ── Sauvegardes ──────────────────────────────────────────────────────────
  //
  // Bertrand les garde SUR cet écran (02/09/2026) : c'est ici qu'on risque de
  // perdre une playlist, donc ici que le filet doit se voir.
  let panneauSauvegardes = $state(false);
  let instantanes = $state<any[]>([]);
  let sauvegardeEnCours = $state(false);
  let restauration = $state<number | null>(null);

  async function chargerInstantanes() {
    try {
      instantanes = (await api.listPlaylistSnapshots()) ?? [];
    } catch {
      instantanes = [];
    }
  }

  async function sauvegarder() {
    if (sauvegardeEnCours) return;
    sauvegardeEnCours = true;
    try {
      await api.backupPlaylists();
      await chargerInstantanes();
      notifications.success($t('v2.pl.backupDone' as any));
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    sauvegardeEnCours = false;
  }

  async function restaurer(snap: any) {
    if (restauration != null) return;
    restauration = snap.id;
    try {
      await api.restorePlaylistSnapshot(snap.id);
      notifications.success($t('v2.pl.restoreDone' as any));
      load();
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    restauration = null;
  }

  // ── Import M3U ───────────────────────────────────────────────────────────
  let importEnCours = $state(false);
  async function importer(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = ''; // sinon le même fichier ne peut pas être rechoisi
    if (!f || importEnCours) return;
    importEnCours = true;
    try {
      const r = await api.importPlaylistFile(f);
      // On annonce ce qui est RAPPROCHÉ, pas « importé » : une ligne du M3U
      // qui ne correspond à aucun fichier de la bibliothèque n'entre pas.
      notifications.success(
        `${$t('v2.pl.importDone' as any)} — ${r.matched ?? 0}/${(r.matched ?? 0) + (r.missing ?? 0)}`,
      );
      load();
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    importEnCours = false;
  }

  /**
   * Partage d'une playlist — première entrée du menu d'actions.
   *
   * `POST /playlists/{id}/share` pose un jeton PUBLIC et rend son URL. Le
   * jeton n'est pas devinable — UUID v4, après un correctif d'audit : l'ancien
   * dérivait de l'horloge et de l'identifiant, donc se retrouvait par force
   * brute. Mais quiconque a l'URL lit la playlist, sans compte.
   *
   * On le DIT dans la notification plutôt que de copier un lien en silence.
   */
  async function partager(pl: Playlist) {
    if (pl.id == null) return;
    try {
      const r = await api.sharePlaylist(pl.id);
      const url = new URL(
        r.url ?? `/api/v1/playlists/shared/${r.token}`,
        window.location.origin,
      ).toString();
      await navigator.clipboard.writeText(url);
      notifications.success($t('v2.pl.shared' as any));
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  /** Playlist en cours de renommage — le bouton haut-droit de la pochette. */
  let enEdition = $state<Playlist | null>(null);

  function playStreaming(service: string, pl: StreamingPlaylist, e: MouseEvent) {
    e.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null) return;
    // `service`, PAS `pl.source` : voir `PlaylistDetailV2`. Le champ n'existe
    // pas sur ces objets, et son absence faisait reprendre la lecture en cours
    // au lieu de lancer la playlist.
    api.play(zid, { streaming_playlist_id: pl.source_id, source: service as any }).catch(() => {});
  }
  function create() {
    const name = newName.trim();
    if (!name) { creating = false; return; }
    api.createPlaylist(name)
      .then(() => { newName = ''; creating = false; load(); })
      .catch(() => { creating = false; });
  }
</script>

<section class="v2-playlists tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Vos collections</div>
      <h1>Playlists</h1>
    </div>
    {#if showAdvanced}
      {#if creating}
        <div class="newp">
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={newName} placeholder="Nom de la playlist" autofocus
            onkeydown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { creating = false; newName = ''; } }} />
          <button class="mk" onclick={create}>Créer</button>
        </div>
      {:else}
        <div class="outils">
          <button class="add" onclick={() => (creating = true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Nouvelle playlist
          </button>
          <!-- Import M3U. Le bouton pointe vers `POST /playlists/import/m3u`,
               la route qui lit vraiment un fichier — l'ancienne fonction du
               client visait `/playlist-manager/import`, qui attend du JSON et
               ne pouvait répondre que 415. -->
          <label class="ghost" class:occupe={importEnCours}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M8 8l4-4 4 4M4 18v2h16v-2"/></svg>
            {importEnCours ? $t('common.loading' as any) : $t('v2.pl.import' as any)}
            <input type="file" accept=".m3u,.m3u8" onchange={importer} disabled={importEnCours} />
          </label>
          <button class="ghost" class:on={panneauSauvegardes}
            onclick={() => { panneauSauvegardes = !panneauSauvegardes; if (panneauSauvegardes) void chargerInstantanes(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6M4 6l2-3h12l2 3M4 6h16M9 11h6"/></svg>
            {$t('v2.pl.backups' as any)}
          </button>
        </div>
      {/if}
    {/if}
  </header>

  <!-- Premier niveau : la SOURCE, en pastilles. Une seule source ne justifie
       pas une barre de choix — on ne montre les pastilles qu'à partir de deux. -->
  {#if sources.length > 1}
    <nav class="srcs">
      {#each sources as sc (sc)}
        <button class:on={source === sc} onclick={() => { source = sc; onglet = 'listes'; }}>
          {sc === LOCAL ? $t('v2.pl.here' as any) : sc}
          <span class="cpt">{sc === LOCAL ? local.length : (services[sc]?.length ?? 0)}</span>
        </button>
      {/each}
    </nav>
  {/if}

  <!-- Second niveau : le TYPE. Réservé à « cet appareil » — une playlist
       intelligente est une règle locale, un service n'en a pas. -->
  {#if source === LOCAL}
    <nav class="onglets" role="tablist">
      <button class="onglet" class:actif={onglet === 'listes'} role="tab"
        aria-selected={onglet === 'listes'} onclick={() => (onglet = 'listes')}>{$t('v2.pl.tabLists' as any)}</button>
      <button class="onglet" class:actif={onglet === 'smart'} role="tab"
        aria-selected={onglet === 'smart'} onclick={() => (onglet = 'smart')}>{$t('v2.pl.tabSmart' as any)}</button>
    </nav>
  {/if}

  {#if panneauSauvegardes}
    <section class="sauv">
      <div class="sauv-tete">
        <h2>{$t('v2.pl.backups' as any)}</h2>
        <button class="mk" disabled={sauvegardeEnCours} onclick={sauvegarder}>
          {sauvegardeEnCours ? $t('common.loading' as any) : $t('v2.pl.backupNow' as any)}
        </button>
      </div>
      {#if !instantanes.length}
        <p class="sauv-vide">{$t('v2.pl.noBackup' as any)}</p>
      {:else}
        <ul class="sauv-liste">
          {#each instantanes as snap (snap.id)}
            <li>
              <span class="sn">{snap.name ?? snap.playlist_name ?? `#${snap.id}`}</span>
              <span class="sd">{snap.created_at ?? ''}</span>
              <button class="ghost sm" disabled={restauration != null} onclick={() => restaurer(snap)}>
                {restauration === snap.id ? $t('common.loading' as any) : $t('v2.pl.restore' as any)}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <div class="scroll">
    {#if source !== LOCAL}
      <!-- Un service : ses playlists seules, sans en-tête de groupe — la
           pastille active dit déjà de qui il s'agit. -->
      {@const liste = services[source] ?? []}
      {#if !liste.length}
        <div class="state">{$t('v2.pl.noneHere' as any)}</div>
      {:else}
        <div class="grid">
          {#each liste as pl (pl.source_id)}
            <div class="card">
              <span class="cv img">
                <AlbumArt coverPath={pl.cover_path} albumId={null} size={0} alt={pl.name} source={source} fallbackInitials={pl.name?.slice(0,1)} />
              </span>
              <span class="ct">{pl.name}</span>
              <span class="ca">{pl.track_count} titres{pl.duration_ms ? ' · ' + formatDuration(pl.duration_ms) : ''}</span>
              <button class="open" onclick={() => (opened = { kind: 'streaming', service: source, pl })} aria-label={`Ouvrir ${pl.name}`}></button>
              <button class="pbtn" onclick={(e) => playStreaming(source, pl, e)} aria-label="Lire">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    {:else if onglet === 'smart'}
      <!-- Les intelligentes : une grille, comme tout le reste de cet écran
           (« playlists en vue grille par défaut », Bertrand, 02/09/2026). -->
      {#if !smart.length}
        <div class="state">{$t('v2.pl.noSmart' as any)}</div>
      {:else}
        <section class="grp">
          <div class="grid">
            {#each smart as sp (sp.id)}
              {@const mos = sp.id != null ? smartMosaiques[sp.id] : undefined}
              <div class="card local">
                <span class="cv" class:img={!!mos}>
                  <!-- Ni favori ni étiquette : une playlist intelligente est
                       une RÈGLE, elle n'a pas d'identité dans `favorites` ni
                       dans `item_tags`. Un cœur qui ne s'allume pas serait
                       pire que pas de cœur. -->
                  <PochetteActions onLire={() => lireSmart(sp)} nom={sp.name}>
                    {#if mos}
                      <MosaiquePochettes pochettes={mos} initiales={sp.name?.slice(0, 1)} alt={sp.name} />
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h11M4 12h11M4 17h7M17 17V7l4 2"/></svg>
                    {/if}
                  </PochetteActions>
                </span>
                <span class="ct">{sp.name}</span>
                <span class="ca">{$t('v2.pl.rule' as any)}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {:else if loading}
      <div class="state">Chargement des playlists…</div>
    {:else}
      <section class="grp">
        {#if local.length}
          <div class="grid">
            {#each local as pl (pl.id)}
              <!-- `pl.id` est nullable dans le type : on résout la mosaïque UNE
                   fois ici, plutôt que d'indexer trois fois avec un garde. -->
              {@const mos = pl.id != null ? mosaiques[pl.id] : undefined}
              <div class="card local">
                <span class="cv" class:img={!!mos}>
                  <!-- Les cinq actions de la maquette. Le favori et les
                       étiquettes s'appliquent : le serveur traite déjà la
                       playlist comme les deux, `LOCAL_ITEM_TYPES` et
                       `TAGGABLE_ITEM_TYPES` l'incluent l'un et l'autre.
                       L'édition s'y limite au nom et à la description, seuls
                       champs que `PUT /playlists/{id}` accepte. -->
                  <PochetteActions
                    favori={pl.id != null ? { playlistId: pl.id } : null}
                    etiquettes={pl.id != null ? { itemType: 'playlist', itemId: pl.id } : null}
                    onEditer={pl.id != null ? () => (enEdition = pl) : null}
                    onLire={() => playLocal(pl)}
                    onOuvrir={() => (opened = { kind: 'local', pl })}
                    menu={pl.id != null
                      ? [{ libelle: $t('v2.pl.share' as any), danger: true, faire: () => partager(pl) }]
                      : []}
                    nom={pl.name}
                  >
                    {#if mos}
                      <MosaiquePochettes pochettes={mos} initiales={pl.name?.slice(0, 1)} alt={pl.name} />
                    {:else}
                      <!-- Tant que les pochettes ne sont pas revenues — ou si la
                           playlist n'en a aucune — le pictogramme d'origine. -->
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h11M4 12h11M4 17h7M17 17V7l4 2"/></svg>
                    {/if}
                  </PochetteActions>
                </span>
                <button class="meta" onclick={() => (opened = { kind: 'local', pl })}>
                  <span class="ct">{pl.name}</span>
                  <span class="ca">{pl.track_count ?? 0} titre{(pl.track_count ?? 0) > 1 ? 's' : ''}</span>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="state empty">Aucune playlist pour l'instant.{showAdvanced ? ' Créez-en une avec « Nouvelle playlist ».' : ''}</div>
        {/if}
      </section>

    {/if}
  </div>

  {#if opened}
    <PlaylistDetailV2 item={opened} onClose={() => (opened = null)} onChanged={load} />
  {/if}

  {#if enEdition}
    {@const cible = enEdition}
    <RenommerModale
      titre={$t('v2.edit.playlist' as any)}
      nom={cible.name}
      description={cible.description}
      enregistrer={(v) => api.updatePlaylist(cible.id!, v)}
      onClose={() => (enEdition = null)}
      onSaved={load}
    />
  {/if}
</section>

<style>
  .v2-playlists{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}

  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:24px 30px 10px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .add{display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 16px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 13px var(--v2-sans); cursor:pointer}
  .add svg{width:16px; height:16px}
  .add:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .newp{display:flex; gap:8px}
  .newp input{height:42px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-acc2); background:var(--v2-surface2);
    color:var(--v2-txt); font:14px var(--v2-sans); padding:0 16px; outline:none; width:240px}
  .mk{height:42px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 13px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .scroll{flex:1; overflow-y:auto; padding:10px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:24px 30px; color:var(--v2-txt3)} .state.empty{color:var(--v2-txt2)}

  .grp{padding:14px 30px 8px}
  .grp h2{font-size:18px; font-weight:700; padding-bottom:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:22px}
  .outils{display:flex; align-items:center; gap:8px}
  .ghost{position:relative; display:inline-flex; align-items:center; gap:7px; cursor:pointer;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); background:transparent;
    color:var(--v2-txt2); font:600 13px var(--v2-sans); padding:8px 14px}
  .ghost:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .ghost.on{color:var(--v2-on-acc); background:var(--v2-acc1); border-color:var(--v2-acc1)}
  .ghost.occupe{opacity:.6; cursor:default}
  .ghost svg{width:15px; height:15px}
  /* Le champ de fichier est invisible mais RESTE cliquable : c'est lui qui
     ouvre le sélecteur, un bouton ne peut pas le faire à sa place. */
  .ghost input[type=file]{position:absolute; inset:0; opacity:0; cursor:pointer; width:100%}
  .ghost.sm{padding:5px 11px; font-size:12px}

  /* Premier niveau : PASTILLES, comme les services de l'écran Streaming. */
  .srcs{display:flex; gap:6px; flex-wrap:wrap; padding:4px 30px 0}
  .srcs button{display:inline-flex; align-items:baseline; gap:8px; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans);
    padding:9px 16px; border-radius:var(--v2-r-pill); transition:.15s}
  .srcs button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .srcs button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .srcs .cpt{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .srcs button.on .cpt{color:var(--v2-on-acc); opacity:.75}

  /* Second niveau : SOULIGNÉ, comme les rubriques de l'écran Streaming. */
  .onglets{display:flex; gap:4px; padding:4px 30px 0}
  .onglet{background:transparent; border:0; border-bottom:2px solid transparent; cursor:pointer;
    color:var(--v2-txt3); font:600 13.5px var(--v2-sans); padding:10px 12px}
  .onglet:hover{color:var(--v2-txt2)}
  .onglet.actif{color:var(--v2-txt); border-bottom-color:var(--v2-acc1)}

  .sauv{margin:10px 30px 0; padding:14px 16px; border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); background:var(--v2-surface)}
  .sauv-tete{display:flex; align-items:center; justify-content:space-between; gap:12px}
  .sauv-tete h2{font-size:14px; font-weight:700}
  .sauv-vide{margin-top:8px; color:var(--v2-txt3); font-size:13px}
  .sauv-liste{margin-top:10px; list-style:none; display:flex; flex-direction:column; gap:6px}
  .sauv-liste li{display:flex; align-items:center; gap:10px; font-size:13px}
  .sn{font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .sd{font:11px var(--v2-mono); color:var(--v2-txt3)}

  .card{position:relative; border:0; background:transparent; color:inherit; text-align:left; padding:0; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card);
    transition:.18s; display:grid; place-items:center; color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .cv.img{background:none; color:inherit}
  .cv > svg{width:52px; height:52px; opacity:.9}
  .card:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .pbtn{position:absolute; right:10px; bottom:10px; z-index:2; width:42px; height:42px; border-radius:50%; border:0; cursor:pointer;
    color:var(--v2-on-acc); background:var(--v2-acc1); box-shadow:0 6px 16px var(--v2-sh-sm); display:grid; place-items:center;
    opacity:0; transform:translateY(6px); transition:.16s}
  .card:hover .pbtn{opacity:1; transform:none}
  .pbtn svg{width:18px; height:18px; margin-left:2px}
  .pbtn:hover{background:var(--v2-acc-tint)}
  /* Le bloc de texte porte le clic : la carte ne peut plus être un bouton,
     elle contient désormais les cinq boutons d'action de la pochette. */
  .meta{display:block; width:100%; border:0; background:transparent; text-align:left;
    padding:0; color:inherit; font:inherit; cursor:pointer}
  .meta .ct, .meta .ca{display:block}
  .ct{margin-top:10px; font:600 14px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
