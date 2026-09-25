<script lang="ts">
  /**
   * Écran « Étiquettes » — le groupe Sélections de la barre latérale.
   *
   * Demandé par Bertrand le 02/09/2026. Il n'existait NULLE PART, ni dans le
   * client actuel ni dans le nouveau : on pouvait poser une étiquette depuis le
   * détail d'un album, jamais retrouver ce qu'on avait étiqueté. Un rangement
   * qu'on ne peut pas relire ne sert à rien.
   *
   * ## 🔴 Une croyance fausse, corrigée le 06/09/2026
   *
   * Cet en-tête affirmait : « `GET /tags/{id}/albums` est la SEULE route qui
   * liste par étiquette ». C'était faux, et l'écran s'en tenait à cette
   * croyance — d'où « pas de prise en compte des tags artistes » (Bertrand).
   *
   * Mesuré sur le .18, les quatre routes existent et rendent la même forme :
   *
   *   /tags/1/albums     200  {albums:[…],    count, tag_id}
   *   /tags/1/artists    200  {artists:[…],   count, tag_id}
   *   /tags/1/tracks     200  {tracks:[…],    count, tag_id}
   *   /tags/1/playlists  200  {playlists:[…], count, tag_id}
   *
   * Et depuis renesenses/tune-server-rust#4798, une cinquième, à part :
   *
   *   /tags/1/smart-playlists  200  {smart_playlists:[…], count, tag_id}
   *
   * À part, parce que `playlists.id` et `smart_playlists.id` se recouvrent :
   * le serveur ne résout jamais un `smart_playlist` dans `playlists`. Ici,
   * elles rejoignent l'onglet « Playlists » marquées `smart`, sous leur propre
   * clé, et s'ouvrent dans leur propre onglet.
   *
   * Et deux de plus pour les collections (#4798, second volet), un onglet
   * « Collections » à elles :
   *
   *   /tags/1/collections        200  {collections:[…],       count, tag_id}
   *   /tags/1/smart-collections  200  {smart_collections:[…], count, tag_id}
   *
   * Même règle : un dossier (réglage JSON `collections`) et une collection
   * intelligente (table `smart_collections`) partagent leurs identifiants —
   * l'id 1 est à la fois « favorites » et « Audiophile ». La sorte vient de
   * la ROUTE qui a rendu la ligne, jamais du numéro.
   *
   * On pouvait donc DÉJÀ étiqueter un artiste depuis sa pochette (ArtistesV2,
   * Favoris) — seul cet écran ne savait pas le relire. Une phrase de
   * commentaire tenait la moitié de la fonction hors service : c'est pourquoi
   * une garde vérifie maintenant que les quatre appels sont bien là.
   *
   * ⚠️ Les deux sortes de COLLECTION (#3194) restent hors de cet écran : le
   * serveur ne les liste pas par étiquette. On ne les annonce donc pas.
   */
  import { onMount } from 'svelte';
  import { setShortcutTarget, clearShortcutTarget } from '../../lib/stores/shortcuts';
  import { zoneRequise } from '../../lib/zoneRequise';
  import * as api from '../../lib/api';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  import type { Album, Artist, Track, UserTag } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import { cibleEtiquetteAlbum, cleLigneEtiquetee, corpsLectureAlbumEtiquete } from '../../lib/cibleEtiquette';
  import ListePistesV2 from './ListePistesV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import { detailOuvert, ouvrirDetail, fermerDetailEnReculant } from '../../lib/historiqueCoquille';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';
  import { corpsDeLecture } from '../../lib/pisteFile';
  import { ouvrirParRaccourci, ouvrirSmartPlaylist, ouvrirCollection } from '../../lib/ouvrirParRaccourci';
  import { collectionNomAffiche } from '../../lib/collectionsLibelles';

  let etiquettes = $state<UserTag[]>([]);
  let chargement = $state(true);
  let ouverte = $state<UserTag | null>(null);
  let albums = $state<Album[]>([]);
  let artistes = $state<Artist[]>([]);
  let pistes = $state<Track[]>([]);
  let listes = $state<any[]>([]);
  /** Dossiers ET collections intelligentes, chacune marquée `smart` par sa route (#4798). */
  let dossiers = $state<any[]>([]);
  let albumsChargement = $state(false);
  let albumOuvert = $state<Album | null>(null);
  /**
   * 🔴 LE CALQUE ALBUM EMPILE UNE ENTRÉE D'HISTORIQUE — #980.
   *
   * Fabien, fils 1774 et 1778 : « quand on clique sur un album → page album, le
   * bouton BACK du navigateur retourne à la page d'accueil » / « à l'avant-
   * dernière page consultée ».
   *
   * Une fiche album est un CALQUE : l'ouvrir ne change pas `activeView`, donc
   * la coquille n'écrit rien et le Précédent dépile l'entrée d'AVANT. Mesuré :
   * dix écrans montent `AlbumDetailV2`, et deux seulement empilaient.
   *
   * Trois branchements, et il en faut trois : ouvrir empile, le Retour referme
   * ET dépile, le Précédent referme le calque. On pose la CLÉ, jamais l'objet —
   * `history.state` refuse les proxies Svelte.
   */
  function ouvrirCalqueAlbum(a: any) {
    const cle = cleDetailAlbum(a);
    if (cle) ouvrirDetail(cle);
  }
  function fermerCalqueAlbum() {
    albumOuvert = null;
  }
  function retourCalqueAlbum() {
    fermerDetailEnReculant(fermerCalqueAlbum);
  }
  $effect(() => {
    if ($detailOuvert == null && albumOuvert) fermerCalqueAlbum();
  });

  type Famille = 'albums' | 'artistes' | 'pistes' | 'listes' | 'dossiers';
  let famille = $state<Famille>('albums');

  const ONGLETS: { id: Famille; cle: string }[] = [
    { id: 'albums', cle: 'favorites.albums' },
    { id: 'artistes', cle: 'favorites.artists' },
    { id: 'pistes', cle: 'favorites.tracks' },
    { id: 'listes', cle: 'favorites.playlists' },
    { id: 'dossiers', cle: 'v2.nav.collections' },
  ];
  const compte = $derived<Record<Famille, number>>({
    albums: albums.length, artistes: artistes.length,
    pistes: pistes.length, listes: listes.length, dossiers: dossiers.length,
  });
  const total = $derived(albums.length + artistes.length + pistes.length + listes.length + dossiers.length);

  /*
   * Renommer et supprimer une étiquette — portés de l'ancienne Bibliothèque,
   * seule à les offrir. Cette interface savait en créer, jamais en corriger :
   * une faute de frappe restait à vie, une étiquette obsolète aussi.
   */
  async function renommer(tag: UserTag) {
    const saisi = await dialogs.prompt($t('library.renameTagPrompt' as any), tag.name);
    if (saisi === null) return;
    const nom = saisi.trim();
    if (!nom || nom === tag.name || tag.id == null) return;
    try {
      await api.updateTag(tag.id, nom);
      await charger();
      if (ouverte?.id === tag.id) ouverte = { ...ouverte, name: nom };
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }
  async function supprimer(tag: UserTag) {
    if (tag.id == null) return;
    if (!(await dialogs.confirm($t('library.deleteTagConfirm' as any).replace('{name}', tag.name), { danger: true }))) return;
    try {
      await api.deleteTag(tag.id);
      if (ouverte?.id === tag.id) ouverte = null;
      await charger();
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  async function charger() {
    chargement = true;
    try {
      etiquettes = (await api.getTags()) ?? [];
    } catch {
      etiquettes = [];
    }
    chargement = false;
  }

  /**
   * #729 — un raccourci posé sur une étiquette doit rouvrir CETTE étiquette.
   *
   * Le mécanisme générique existait — `setShortcutTarget` à l'ouverture,
   * `tune:shortcut-restore` au retour — et aucun écran du nouveau client n'y
   * participait, sinon Collections et Playlists. Le raccourci ne pouvait donc
   * que poser la vue et retomber sur la liste.
   *
   * La clef reste stable (`tags:12`) : c'est elle qui sert à la reconnaissance
   * ET à la déduplication.
   */
  const cleCible = (tag: UserTag) => `tags:${tag.id}`;

  $effect(() => {
    const auRetour = async (ev: Event) => {
      const cible = (ev as CustomEvent).detail?.target;
      const cle: string | undefined = cible?.key;
      if (!cle || !cle.startsWith('tags:')) return;
      const id = cible.restore?.id;
      if (id == null) return;
      let tag = etiquettes.find((x) => x.id === id);
      // La liste peut n'être pas encore chargée : on la demande une fois.
      if (!tag) { await charger(); tag = etiquettes.find((x) => x.id === id); }
      if (tag) ouvrir(tag);
    };
    window.addEventListener('tune:shortcut-restore', auRetour);
    return () => window.removeEventListener('tune:shortcut-restore', auRetour);
  });

  // Quitter l'écran oublie la cible : sinon le raccourci suivant capturerait
  // une étiquette qu'on ne regarde plus.
  $effect(() => () => clearShortcutTarget());

  async function ouvrir(tag: UserTag) {
    ouverte = tag;
    setShortcutTarget({ key: cleCible(tag), restore: { id: tag.id, name: tag.name }, label: tag.name });
    albums = []; artistes = []; pistes = []; listes = []; dossiers = [];
    famille = 'albums';
    albumsChargement = true;
    // Les sept EN PARALLÈLE, chacune au mieux : une famille qui échoue ne
    // doit pas vider les autres, et les compteurs des onglets doivent
    // être justes dès l'ouverture — un onglet « Artistes » sans nombre
    // n'invite pas à cliquer, donc ne serait pas trouvé. Les trois routes
    // de #4798 peuvent manquer sur un serveur plus ancien : au mieux, elles
    // aussi.
    const [a, ar, p, l, sp, co, sc] = await Promise.all([
      api.getTagAlbums(tag.id!).catch(() => null),
      api.getTagArtists(tag.id!).catch(() => null),
      api.getTagTracks(tag.id!).catch(() => null),
      api.getTagPlaylists(tag.id!).catch(() => null),
      api.getTagSmartPlaylists(tag.id!).catch(() => null),
      api.getTagCollections(tag.id!).catch(() => null),
      api.getTagSmartCollections(tag.id!).catch(() => null),
    ]);
    albums = a?.albums ?? [];
    artistes = ar?.artists ?? [];
    pistes = p?.tracks ?? [];
    // Les playlists intelligentes rejoignent l'onglet Playlists, marquées
    // `smart` : jamais rapprochées d'une playlist par le numéro seul.
    listes = [
      ...(l?.playlists ?? []),
      ...(sp?.smart_playlists ?? []).map((x: any) => ({ ...x, smart: true })),
    ];
    // Même geste pour les collections : la sorte vient de la ROUTE, et c'est
    // elle qui fera la clé de raccourci (`collections:` / `smartcollections:`).
    dossiers = [
      ...(co?.collections ?? []),
      ...(sc?.smart_collections ?? []).map((x: any) => ({ ...x, smart: true })),
    ];
    // On se pose sur la première famille NON VIDE : ouvrir une étiquette qui
    // ne porte que des artistes sur un onglet Albums vide se lit comme une
    // panne, et c'est exactement le défaut signalé.
    famille = ONGLETS.find((o) => compte[o.id] > 0)?.id ?? 'albums';
    albumsChargement = false;
  }

  /** « Lire à partir d'ici » — #1061, point 9 de FabienM : les pistes de
   *  l'étiquette, dans l'ordre affiché, depuis celle qu'on désigne. */
  function lireLesPistesDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    lireListeDepuis(pistes as any, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }

  /**
   * #1238 — les routes `/tags/{id}/albums|tracks` rendent AUSSI la moitié
   * streaming, avec `id: null` et la paire `source` + `source_id`. Ces deux
   * gestes ne savaient lire que l'entier : un clic sur une ligne Qobuz ne
   * faisait rien, en silence. Le corps vient désormais de la même règle que
   * partout ailleurs (`corpsDeLecture` pour une piste).
   */
  function lirePiste(t: Track) {
    const zid = $currentZoneId;
    const corps = corpsDeLecture(t);
    if (zid == null || !corps) return;
    playAndSync(zid, corps as any).catch(signalerEchecLecture);
  }

  function lireAlbum(a: Album) {
    const zid = $currentZoneId;
    const corps = corpsLectureAlbumEtiquete(a as any);
    if (zid == null || !corps) return;
    playAndSync(zid, corps as any).catch(signalerEchecLecture);
  }

  onMount(() => {
    void charger();
  });
</script>

<section class="v2-tags tune-v2">
  {#if ouverte}
    {@const tag = ouverte}
    <header class="v2-top detail">
      <div class="v2-titres">
        <button class="back" onclick={() => (ouverte = null)}>← {$t('common.back' as any)}</button>
        <div class="v2-eyebrow">{$t('v2.tags.eyebrow' as any)}</div>
        <h1><span class="pastille" style={tag.color ? `--c:${tag.color}` : ''}></span>{tag.name}</h1>
        <!-- Le total porte sur les QUATRE familles, et chaque onglet porte le
             sien : le compte annoncé correspond toujours à ce qu'on voit. -->
        <p class="v2-sous">{total} {$t('v2.tags.itemsWithTag' as any)}</p>
      </div>
      <div class="gestes">
        <button class="v2-btn" onclick={() => renommer(tag)}>{$t('library.renameTag' as any)}</button>
        <button class="v2-btn danger" onclick={() => supprimer(tag)}>{$t('library.deleteTag' as any)}</button>
      </div>
    </header>

    {#if albumsChargement}
      <div class="etat">{$t('common.loading' as any)}</div>
    {:else}
      <nav class="onglets">
        {#each ONGLETS as o (o.id)}
          <button class:on={famille === o.id} onclick={() => (famille = o.id)}>
            {$t(o.cle as any)}<span>{compte[o.id]}</span>
          </button>
        {/each}
      </nav>

      {#if famille === 'albums'}
        {#if !albums.length}
          <div class="etat">{$t('v2.tags.noAlbumWithTag' as any)}</div>
        {:else}
          <div class="grille">
            {#each albums as a, i (cleLigneEtiquetee(a, i))}
              <div class="carte">
                <div class="cv">
                  <PochetteActions
                    favori={a.id != null ? { albumId: a.id } : null}
                    etiquettes={cibleEtiquetteAlbum(a)}
                    onLire={() => lireAlbum(a)}
                    onOuvrir={() => { ouvrirCalqueAlbum(a); albumOuvert = a; }}
                    nom={a.title}
                  >
                    <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title}
                      fallbackInitials={a.title?.slice(0, 1)} />
                  </PochetteActions>
                </div>
                <button class="meta" onclick={() => { ouvrirCalqueAlbum(a); albumOuvert = a; }}>
                  <span class="ct" title={a.title}>{a.title}</span>
                  <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
                </button>
              </div>
            {/each}
          </div>
        {/if}

      {:else if famille === 'artistes'}
        {#if !artistes.length}
          <div class="etat">{$t('v2.tags.noArtistWithTag' as any)}</div>
        {:else}
          <div class="grille">
            {#each artistes as ar (ar.id)}
              <div class="carte">
                <div class="cv rond">
                  <PochetteActions
                    favori={ar.id != null ? { artistId: ar.id } : null}
                    etiquettes={ar.id != null ? { itemType: 'artist', itemId: ar.id } : null}
                    nom={ar.name}
                  >
                    <AlbumArt coverPath={ar.image_path ?? null} albumId={null} size={0} alt={ar.name}
                      fallbackInitials={ar.name?.slice(0, 1)} />
                  </PochetteActions>
                </div>
                <span class="ct" title={ar.name}>{ar.name}</span>
              </div>
            {/each}
          </div>
        {/if}

      {:else if famille === 'pistes'}
        {#if !pistes.length}
          <div class="etat">{$t('v2.tags.noTrackWithTag' as any)}</div>
        {:else}
          <div class="pistes">
            <ListePistesV2 pistes={pistes} onLire={(p) => lirePiste(p)}
              onLireDepuis={(_p, i) => lireLesPistesDepuis(i)} />
          </div>
        {/if}

      {:else if famille === 'listes'}
        {#if !listes.length}
          <div class="etat">{$t('v2.tags.noPlaylistWithTag' as any)}</div>
        {:else}
          <div class="simples">
            <!-- 🔴 La clé porte la SORTE : une playlist intelligente et une
                 playlist ordinaire peuvent avoir le même id (#4798), et deux
                 clés égales feraient disparaître l'onglet entier. -->
            {#each listes as pl (pl.smart ? `s-${pl.id}` : `p-${pl.id ?? pl.name}`)}
              {@const locale = pl.id != null}
              <!-- Une playlist LOCALE ou INTELLIGENTE s'ouvre dans son écran ;
                   une playlist de service (id nul) n'a pas encore d'écran qui
                   l'accueille : on l'affiche sans la rendre cliquable. -->
              <svelte:element this={locale ? 'button' : 'div'} class="simple" class:inerte={!locale}
                              onclick={!locale ? undefined
                                : pl.smart ? () => ouvrirSmartPlaylist(pl)
                                : () => ouvrirParRaccourci('playlists', `playlists:${pl.id}`, pl.id, pl.name ?? '')}>
                <span class="si" aria-hidden="true" title={pl.smart ? $t('v2.pl.tabSmart' as any) : undefined}>
                  {#if pl.smart}
                    <!-- La playlist INTELLIGENTE se distingue à l'œil, comme
                         la collection intelligente : son contenu est une règle. -->
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 5h18l-7 8v6l-4 2v-8z"/>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 6h11M4 12h11M4 18h7"/><path d="M18 9v9"/><circle cx="16" cy="18" r="2"/>
                    </svg>
                  {/if}
                </span>
                <span class="sn" title={pl.name}>{pl.name}</span>
                {#if pl.track_count != null}<span class="sc">{pl.track_count}</span>{/if}
              </svelte:element>
            {/each}
          </div>
        {/if}

      {:else}
        {#if !dossiers.length}
          <div class="etat">{$t('v2.tags.noCollectionWithTag' as any)}</div>
        {:else}
          <div class="simples">
            <!-- 🔴 La clé porte la SORTE : un dossier et une collection
                 intelligente peuvent avoir le même id (#4798), et deux clés
                 égales feraient disparaître l'onglet entier. -->
            {#each dossiers as c (c.smart ? `sc-${c.id}` : `c-${c.id}`)}
              {@const nom = c.smart ? collectionNomAffiche(c, (k) => $t(k as any)) : (c.name ?? '')}
              <!-- Chaque ligne s'ouvre dans l'écran Collections, sous SA clé
                   de raccourci : la sorte vient de la route, jamais du numéro. -->
              <button class="simple" onclick={() => ouvrirCollection({ id: c.id, name: nom, smart: !!c.smart })}>
                <span class="si" aria-hidden="true"
                      title={c.smart ? $t('v2.col.smart' as any) : $t('v2.col.manual' as any)}>
                  {#if c.smart}
                    <!-- La collection INTELLIGENTE se distingue à l'œil : son
                         contenu est une règle, comme la playlist intelligente. -->
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 5h18l-7 8v6l-4 2v-8z"/>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    </svg>
                  {/if}
                </span>
                <span class="sn" title={nom}>{nom}</span>
                {#if c.album_count != null}<span class="sc">{c.album_count}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}

    {#if albumOuvert}
      <AlbumDetailV2 album={albumOuvert} depot={null} onClose={retourCalqueAlbum} />
    {/if}

  {:else}
    <header class="v2-top">
      <div class="v2-titres">
        <div class="v2-eyebrow">{$t('v2.tags.eyebrow' as any)}</div>
        <h1>{$t('v2.cover.tags' as any)}</h1>
      </div>
    </header>

    {#if chargement}
      <div class="etat">{$t('common.loading' as any)}</div>
    {:else if !etiquettes.length}
      <!-- Une étiquette se pose depuis la pochette : on le DIT, sinon l'écran
           vide se lit comme une panne. -->
      <div class="etat">{$t('v2.tags.emptyHint' as any)}</div>
    {:else}
      <ul class="liste">
        {#each etiquettes as tag (tag.id)}
          <li>
            <button class="tag" style={tag.color ? `--c:${tag.color}` : ''} onclick={() => ouvrir(tag)}>
              <span class="pastille"></span>
              <span class="nom">{tag.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  /* Le titre d'une étiquette porte sa PASTILLE de couleur : il aligne donc son
     texte sur elle, là où les autres écrans se contentent du réglage partagé. */
  .detail h1{display:flex; align-items:center; gap:10px}

  .v2-tags{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  .gestes{display:flex; gap:8px; align-items:flex-start}
  .gestes .danger:hover{color:var(--v2-danger)}
  .back{background:transparent; border:0; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:0 0 8px}
  .back:hover{color:var(--v2-txt)}
  .etat{padding:30px; color:var(--v2-txt3); font-size:13.5px; max-width:60ch}

  .liste{display:flex; flex-wrap:wrap; gap:10px; padding:12px 30px 30px; list-style:none}
  .tag{
    --c:var(--v2-acc1);
    display:inline-flex; align-items:center; gap:9px; cursor:pointer;
    padding:9px 15px; border-radius:var(--v2-r-pill);
    border:1px solid color-mix(in srgb, var(--c) 45%, transparent);
    background:color-mix(in srgb, var(--c) 12%, transparent);
    color:var(--v2-txt); font:600 13.5px var(--v2-sans);
  }
  .tag:hover{background:color-mix(in srgb, var(--c) 24%, transparent)}
  .pastille{--c:var(--v2-acc1); width:9px; height:9px; border-radius:50%; background:var(--c); flex:none}

  .onglets{display:flex; gap:4px; padding:4px 30px 0; flex-wrap:wrap}
  .onglets button{display:inline-flex; align-items:center; gap:7px; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans);
    padding:8px 14px; border-radius:var(--v2-r-pill); transition:.15s}
  .onglets button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .onglets button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .onglets button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .onglets button.on span{color:var(--v2-on-acc); opacity:.75}

  .pistes{display:flex; flex-direction:column; gap:1px; padding:12px 30px 40px}

  .simples{display:flex; flex-direction:column; gap:2px; padding:12px 24px 40px}
  /* Un `button` pour les playlists qui s'ouvrent (#4798), un `div` pour les
     autres : même habillage, la réinitialisation du bouton en plus. */
  .simple{display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; width:100%;
    padding:9px 12px; border:0; border-radius:9px; background:transparent; color:var(--v2-txt2);
    text-align:left; cursor:pointer; font:inherit}
  .simple:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .simple.inerte{cursor:default}
  .simple.inerte:hover{background:transparent; color:var(--v2-txt2)}
  .simple .si{display:inline-flex; color:var(--v2-acc1)}
  .simple .si svg{width:17px; height:17px}
  .simple .sn{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px}
  .simple .sc{font:10.5px var(--v2-mono); color:var(--v2-txt3)}

  /* L'artiste garde la pochette RONDE de partout ailleurs : la même personne
     ne doit pas changer de forme selon l'écran qui la montre. */
  .cv.rond{border-radius:50%}

  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(148px, 1fr)); gap:22px 18px; padding:12px 30px 40px}
  .carte{display:flex; flex-direction:column; content-visibility:auto; contain-intrinsic-size:auto 210px}
  .cv{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .meta{display:block; width:100%; border:0; background:transparent; padding:0; text-align:left; color:inherit; font:inherit; cursor:pointer}
  .ct{display:block; margin-top:9px; font:600 12.5px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{display:block; margin-top:2px; font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
