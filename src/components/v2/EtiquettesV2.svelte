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
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import type { Album, Artist, Track, UserTag } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';

  let etiquettes = $state<UserTag[]>([]);
  let chargement = $state(true);
  let ouverte = $state<UserTag | null>(null);
  let albums = $state<Album[]>([]);
  let artistes = $state<Artist[]>([]);
  let pistes = $state<Track[]>([]);
  let listes = $state<any[]>([]);
  let albumsChargement = $state(false);
  let albumOuvert = $state<Album | null>(null);

  type Famille = 'albums' | 'artistes' | 'pistes' | 'listes';
  let famille = $state<Famille>('albums');

  const ONGLETS: { id: Famille; cle: string }[] = [
    { id: 'albums', cle: 'favorites.albums' },
    { id: 'artistes', cle: 'favorites.artists' },
    { id: 'pistes', cle: 'favorites.tracks' },
    { id: 'listes', cle: 'favorites.playlists' },
  ];
  const compte = $derived<Record<Famille, number>>({
    albums: albums.length, artistes: artistes.length,
    pistes: pistes.length, listes: listes.length,
  });
  const total = $derived(albums.length + artistes.length + pistes.length + listes.length);

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
    albums = []; artistes = []; pistes = []; listes = [];
    famille = 'albums';
    albumsChargement = true;
    // Les quatre EN PARALLÈLE, chacune au mieux : une famille qui échoue ne
    // doit pas vider les trois autres, et les compteurs des onglets doivent
    // être justes dès l'ouverture — un onglet « Artistes » sans nombre
    // n'invite pas à cliquer, donc ne serait pas trouvé.
    const [a, ar, p, l] = await Promise.all([
      api.getTagAlbums(tag.id!).catch(() => null),
      api.getTagArtists(tag.id!).catch(() => null),
      api.getTagTracks(tag.id!).catch(() => null),
      api.getTagPlaylists(tag.id!).catch(() => null),
    ]);
    albums = a?.albums ?? [];
    artistes = ar?.artists ?? [];
    pistes = p?.tracks ?? [];
    listes = l?.playlists ?? [];
    // On se pose sur la première famille NON VIDE : ouvrir une étiquette qui
    // ne porte que des artistes sur un onglet Albums vide se lit comme une
    // panne, et c'est exactement le défaut signalé.
    famille = ONGLETS.find((o) => compte[o.id] > 0)?.id ?? 'albums';
    albumsChargement = false;
  }

  function lirePiste(t: Track) {
    const zid = $currentZoneId;
    if (zid == null || t.id == null) return;
    playAndSync(zid, { track_id: t.id }).catch(() => {});
  }

  function lireAlbum(a: Album) {
    const zid = $currentZoneId;
    if (zid == null || a.id == null) return;
    playAndSync(zid, { album_id: a.id }).catch(() => {});
  }

  onMount(() => {
    void charger();
  });
</script>

<section class="v2-tags tune-v2">
  {#if ouverte}
    {@const tag = ouverte}
    <header class="top">
      <button class="back" onclick={() => (ouverte = null)}>← {$t('common.back' as any)}</button>
      <div class="eyebrow">{$t('v2.tags.eyebrow' as any)}</div>
      <h1><span class="pastille" style={tag.color ? `--c:${tag.color}` : ''}></span>{tag.name}</h1>
      <!-- Le total porte sur les QUATRE familles, et chaque onglet porte le
           sien : le compte annoncé correspond toujours à ce qu'on voit. -->
      <p class="sub">{total} {$t('v2.tags.itemsWithTag' as any)}</p>
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
            {#each albums as a (a.id)}
              <div class="carte">
                <div class="cv">
                  <PochetteActions
                    favori={a.id != null ? { albumId: a.id } : null}
                    etiquettes={a.id != null ? { itemType: 'album', itemId: a.id } : null}
                    onLire={() => lireAlbum(a)}
                    onOuvrir={() => (albumOuvert = a)}
                    nom={a.title}
                  >
                    <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title}
                      fallbackInitials={a.title?.slice(0, 1)} />
                  </PochetteActions>
                </div>
                <button class="meta" onclick={() => (albumOuvert = a)}>
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
            <ListePistesV2 pistes={pistes} onLire={(p) => lirePiste(p)} />
          </div>
        {/if}

      {:else}
        {#if !listes.length}
          <div class="etat">{$t('v2.tags.noPlaylistWithTag' as any)}</div>
        {:else}
          <div class="simples">
            {#each listes as pl (pl.id ?? pl.name)}
              <div class="simple">
                <span class="si" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                       stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 6h11M4 12h11M4 18h7"/><path d="M18 9v9"/><circle cx="16" cy="18" r="2"/>
                  </svg>
                </span>
                <span class="sn" title={pl.name}>{pl.name}</span>
                {#if pl.track_count != null}<span class="sc">{pl.track_count}</span>{/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}

    {#if albumOuvert}
      <AlbumDetailV2 album={albumOuvert} depot={null} onClose={() => (albumOuvert = null)} />
    {/if}

  {:else}
    <header class="top">
      <div class="eyebrow">{$t('v2.tags.eyebrow' as any)}</div>
      <h1>{$t('v2.cover.tags' as any)}</h1>
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
  .v2-tags{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  .top{padding:24px 30px 12px; padding-right:var(--v2-grappe-w)}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{display:flex; align-items:center; gap:10px; font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .sub{color:var(--v2-txt2); font-size:13.5px; margin-top:6px}
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
  .simple{display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px;
    padding:9px 12px; border-radius:9px; color:var(--v2-txt2)}
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
