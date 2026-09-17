<script lang="ts">
  /**
   * LA FICHE D'UN ARTISTE DE STREAMING — #3825, socle de #2568.
   *
   * 🔴 Cet écran n'existait pas. C'est tout le défaut : `SearchV2.ouvrirArtiste`
   * se terminait par `if (!estLocal(ar)) { q = ar.name; return; }` — cliquer un
   * artiste Qobuz RELANÇAIT la recherche sur son nom. Le commentaire au-dessus
   * l'assumait : « Seul un artiste LOCAL a une fiche ». Ce n'était pas un lien
   * cassé à rebrancher, c'était l'écran d'arrivée qui manquait.
   *
   * Le serveur, lui, savait déjà tout faire — trois routes exposées pour six
   * services (`tune-streaming-http/src/lib.rs:313-320`) :
   *   • `/{service}/artists/{id}`            → `getStreamingArtist`
   *   • `/{service}/artists/{id}/albums`     → `getStreamingArtistAlbums`
   *   • `/{service}/artists/{id}/top-tracks` → `getStreamingArtistTopTracks`
   * Les deux premières avaient leur enveloppe cliente et aucun consommateur en
   * v2 ; la troisième n'avait même pas d'enveloppe.
   *
   * RETOUR : on emploie `vueDeRetour`, le dépôt posé par l'émetteur du geste et
   * consommé UNE fois ici — le mécanisme de la coquille v2 (#3824/#3843), pas
   * un second inventé pour l'occasion. C'est exactement la divergence v1/v2 qui
   * a produit ce chantier ; en créer une de plus serait le reproduire.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import type { Album, Artist, Source, Track } from '../../lib/types';
  import { activeView, vueDeRetour } from '../../lib/stores/navigation';
  import { ficheArtisteService, streamingServices } from '../../lib/stores/streaming';
  import { albumsDeStreamingPourArtiste, servicesInterrogeables, statutsStreaming, type AlbumsDeService } from '../../lib/albumsArtisteStreaming';
  import { BIBLIOTHEQUE, cleEdition, type Exemplaire } from '../../lib/discographieCommune';
  import DiscographieCommune from './DiscographieCommune.svelte';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { t as tr } from '../../lib/i18n';
  import { lireListe, lireListeAleatoire } from '../../lib/lectureEnMasse';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import { detailOuvert, ouvrirDetail, fermerDetailEnReculant } from '../../lib/historiqueCoquille';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';

  const cible = $derived($ficheArtisteService);

  let artiste = $state<Artist | null>(null);
  let titres = $state<Track[]>([]);
  let albums = $state<Album[]>([]);
  let chargement = $state(true);
  /**
   * LA MÊME PAGE QUE CELLE D'UN ARTISTE DE LA BIBLIOTHÈQUE — #4330.
   *
   * FabienM, 17/09/2026 : depuis un artiste trouvé seulement sur un service,
   * « Oui je m'attends à avoir la même page, c'est le principe de la page
   * commune ». La fiche va donc chercher, en plus des albums du service d'où
   * l'on vient :
   *   • ses albums dans la BIBLIOTHÈQUE, si elle connaît un artiste du même
   *     nom (replié) — et seulement du même nom : un rapprochement approché
   *     poserait les albums d'un autre artiste sous celui-ci ;
   *   • ses albums chez les AUTRES services connectés, résolus par le nom
   *     comme le fait déjà la fiche de bibliothèque (#3709).
   * Les deux partent sans bloquer l'affichage : le service d'origine répond
   * d'abord, la grille grandit ensuite.
   */
  let locaux = $state<Album[]>([]);
  let autresServices = $state<AlbumsDeService[]>([]);
  let complementsEnCharge = $state(false);
  const sectionsServices = $derived<AlbumsDeService[]>(
    cible && albums.length ? [{ service: cible.service, albums }, ...autresServices] : autresServices,
  );
  /** L'album ouvert, et d'où il vient : `null` = la bibliothèque. */
  let albumOuvert = $state<Album | null>(null);
  let serviceOuvert = $state<string | null>(null);
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

  /**
   * 🔴 Un jeton par ouverture. Trois requêtes partent ensemble et un service
   * distant répond en secondes : sans lui, la réponse d'un artiste ouvert puis
   * quitté viendrait se poser sous le suivant. Même garde que
   * `ArtistesV2.chargerAlbumsDeService`.
   */
  let jeton = 0;

  async function charger(service: Source, id: string) {
    const mien = ++jeton;
    chargement = true;
    artiste = null;
    titres = [];
    albums = [];
    // `allSettled` : un service qui refuse les titres phares ne doit pas
    // emporter les albums avec lui. Une fiche à moitié pleine vaut mieux
    // qu'un écran vide — c'est la règle du reste de l'application.
    const [a, tt, al] = await Promise.allSettled([
      api.getStreamingArtist(service, id),
      api.getStreamingArtistTopTracks(service, id),
      api.getStreamingArtistAlbums(service, id),
    ]);
    if (mien !== jeton) return;
    if (a.status === 'fulfilled') artiste = a.value;
    // 🔴 ESTAMPILLER LA SOURCE, UNE FOIS, ICI. La charge de `top-tracks` ne
    // porte pas de champ `source` — le service est dans l'URL. Sans lui
    // `corpsDeLecture` ne sait désigner aucune de ces pistes : `planDeLecture`
    // les écarte toutes et le « best of » partirait VIDE, sans erreur. On le
    // pose au chargement plutôt qu'à chaque geste : un seul endroit à ne pas
    // oublier, au lieu d'un par bouton.
    if (tt.status === 'fulfilled') {
      titres = (tt.value ?? []).map((p) => ({ ...p, source: service })) as Track[];
    }
    // Tamponnée comme le fait `albumsDeStreamingPourArtiste` : le serveur ne
    // pose `source` sur aucun objet de streaming, et la clé d'historique d'un
    // album (`cleDetailAlbum`) en a besoin.
    if (al.status === 'fulfilled') {
      albums = (al.value ?? []).map((x) => ({ ...x, source: (x.source ?? service) as Album['source'] }));
    }
    chargement = false;
    void chargerComplements(mien, service, artiste?.name || cible?.nom || '');
  }

  const plier = (x: string | null | undefined) => cleEdition(x);

  async function chargerComplements(mien: number, service: Source, nomArtiste: string) {
    locaux = [];
    autresServices = [];
    if (!nomArtiste.trim()) return;
    complementsEnCharge = true;
    // Le magasin peut être VIDE dans le nouveau client : voir `statutsStreaming`.
    const statuts = await statutsStreaming($streamingServices, api.getStreamingServices, (x) => streamingServices.set(x));
    if (mien !== jeton) return;
    const autres = servicesInterrogeables(statuts).filter((s) => s !== service);
    const [loc, svc] = await Promise.allSettled([
      (async () => {
        const trouve = ((await api.searchLibrary(nomArtiste, 20))?.artists ?? [])
          .find((a) => a.id != null && plier(a.name) === plier(nomArtiste));
        return trouve ? ((await api.getArtistAlbums(trouve.id!)) ?? []) : [];
      })(),
      albumsDeStreamingPourArtiste(nomArtiste, autres, {
        resoudreArtiste: async (svc, nom) =>
          (await api.federatedSearch(nom, [svc], 5))?.services?.[svc]?.artists ?? [],
        albumsDeLArtiste: (svc, id) => api.getStreamingArtistAlbums(svc, id),
      }),
    ]);
    if (mien !== jeton) return;
    if (loc.status === 'fulfilled') locaux = loc.value;
    if (svc.status === 'fulfilled') autresServices = svc.value;
    complementsEnCharge = false;
  }

  function ouvrirExemplaire(ex: Exemplaire) {
    ouvrirCalqueAlbum(ex.album);
    serviceOuvert = ex.source === BIBLIOTHEQUE ? null : ex.source;
    albumOuvert = ex.album;
  }
  function lireExemplaire(ex: Exemplaire) {
    const zid = $currentZoneId;
    if (zid == null) return;
    if (ex.source === BIBLIOTHEQUE) {
      if (ex.album.id == null) return;
      playAndSync(zid, { album_id: ex.album.id }).catch(signalerEchecLecture);
    } else if (ex.album.source_id != null) {
      // 🔴 `source` va TOUJOURS avec `streaming_album_id` (voir `ArtistesV2`).
      playAndSync(zid, { streaming_album_id: String(ex.album.source_id), source: ex.source as any })
        .catch(signalerEchecLecture);
    }
  }

  $effect(() => {
    const c = cible;
    if (c) void charger(c.service, c.id);
  });

  onMount(() => () => { jeton++; });

  /** Le nom affiché tant que la fiche charge : celui que l'appelant portait. */
  const nom = $derived(artiste?.name || cible?.nom || '');

  function retour() {
    const ou = $vueDeRetour;
    albumOuvert = null;
    ficheArtisteService.set(null);
    vueDeRetour.set(null);
    activeView.set(ou ?? 'search');
  }

  function lire(p: any) {
    const zid = $currentZoneId;
    if (zid == null || !p?.source || !p?.source_id) return;
    playAndSync(zid, {
      source: p.source,
      source_id: String(p.source_id),
      title: p.title ?? null,
      artist_name: p.artist_name ?? null,
      album_title: p.album_title ?? null,
      cover_path: p.cover_path ?? null,
      duration_ms: p.duration_ms,
    }).catch(signalerEchecLecture);
  }

  /**
   * « Best of » et « Radio de l'artiste » — #2568.
   *
   * Sandro, fil forum 1579 (27/08/2026) : « serait-il possible d'ajouter un
   * bouton pour écouter une sélection de ses meilleurs titres (ou un mix
   * automatique basé sur son catalogue) […] une fonction "Radio Artiste" ou
   * "Best of" dédiée, permettant de découvrir rapidement sa discographie sans
   * devoir charger manuellement chaque album un par un. »
   *
   * Sa demande porte DEUX gestes, et un seul bouton en trahirait un : le best
   * of, c'est la sélection dans l'ordre du service ; la radio, c'est le mix.
   * On ne fabrique aucun classement — `get_artist_top_tracks` rend l'ordre du
   * service, et le trier nous-mêmes sur une popularité qu'il ne donne pas
   * reviendrait à inventer le best of au lieu de le relayer.
   *
   * ⚠️ Le piège serveur que le ticket signalait est LEVÉ sur `main` : Qobuz
   * demande `extra=tracks` d'abord et ne retombe sur `tracks_appears_on` —
   * « ce sur quoi l'artiste apparaît », qui n'est pas un best of — qu'en
   * dernier recours (`qobuz.rs`, `get_artist_top_tracks`).
   */
  let enMasse = $state(false);
  async function jouerLesTitres(aleatoire: boolean) {
    const zid = $currentZoneId;
    if (zid == null || !titres.length) return;
    enMasse = true;
    try {
      const gestes = {
        lire: (c: any) => playAndSync(zid, c),
        enfiler: (c: any) => api.addToQueue(zid, c),
      };
      const n = aleatoire ? await lireListeAleatoire(titres, gestes) : await lireListe(titres, gestes);
      // Zéro veut dire « rien n'était désignable » : c'est à l'écran de le
      // dire, sans quoi le bouton paraîtrait mort.
      if (!n) notifications.error($tr('v2.fas.empty' as any));
    } catch (e: any) {
      notifications.error(e?.message ?? $tr('v2.fas.empty' as any));
    }
    enMasse = false;
  }

  const duree = (ms?: number | null) => {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
</script>

{#if albumOuvert}
  <!-- `service` EN MÊME TEMPS que l'album : `AlbumDetailV2` n'apparie un album
       de streaming que sur la paire service + `source_id`, et l'ouvrir sans son
       service le laisserait sur « Chargement… » pour toujours (#3709). -->
  {#if serviceOuvert}
    <AlbumDetailV2 album={albumOuvert} service={serviceOuvert} onClose={retourCalqueAlbum} />
  {:else}
    <AlbumDetailV2 album={albumOuvert} depot={null} onClose={retourCalqueAlbum} />
  {/if}
{:else}
<section class="v2-fas tune-v2">
  <header class="tete">
    <button class="retour" onclick={retour} aria-label={$tr('common.back' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <div class="portrait">
      <AlbumArt coverPath={artiste?.image_path ?? null} albumId={null} size={0}
                alt={nom} fallbackInitials={nom.slice(0, 1)} />
    </div>
    <div class="ident">
      <h1>{nom}</h1>
      {#if cible}<span class="svc">{cible.service}</span>{/if}
      {#if titres.length}
        <div class="gestes">
          <button class="v2-btn" disabled={enMasse} onclick={() => jouerLesTitres(false)}>
            {$tr('v2.fas.bestOf' as any)}
          </button>
          <button class="v2-btn ghost" disabled={enMasse} onclick={() => jouerLesTitres(true)}>
            {$tr('v2.fas.radio' as any)}
          </button>
        </div>
      {/if}
    </div>
  </header>

  {#if chargement}
    <div class="etat">{$tr('v2.common.loading' as any)}</div>
  {:else if !titres.length && !albums.length && !locaux.length && !autresServices.length && !complementsEnCharge}
    <div class="etat">{$tr('v2.fas.empty' as any)}</div>
  {:else}
    {#if titres.length}
      <h2>{$tr('v2.fas.topTracks' as any)}</h2>
      <ol class="titres">
        {#each titres as p, i (String(p.source_id ?? i))}
          <li>
            <button class="piste" onclick={() => lire(p)}>
              <span class="rang">{i + 1}</span>
              <span class="tt">{p.title}</span>
              <span class="al">{p.album_title ?? ''}</span>
              <span class="du">{duree(p.duration_ms)}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}

    {#if albums.length || locaux.length || autresServices.length || complementsEnCharge}
      <h2>{$tr('v2.fas.albums' as any)}</h2>
      <DiscographieCommune {locaux} services={sectionsServices} servicesEnCharge={complementsEnCharge}
        onOuvrir={ouvrirExemplaire} onLire={lireExemplaire} />
    {/if}
  {/if}
</section>
{/if}

<style>
  .v2-fas{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); padding:0 30px 40px}
  .tete{display:flex; align-items:center; gap:18px; padding:18px 0 22px}
  .retour{width:34px; height:34px; border-radius:9px; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center; flex:none}
  .retour:hover{color:var(--v2-txt); border-color:var(--v2-txt3)}
  .retour svg{width:17px; height:17px}
  .portrait{width:92px; height:92px; border-radius:50%; overflow:hidden; flex:none; background:var(--v2-line2)}
  .ident h1{margin:0; font:600 26px/1.15 var(--v2-sans)}
  .svc{font:11px var(--v2-mono); color:var(--v2-txt3); text-transform:uppercase; letter-spacing:.06em}
  .gestes{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}
  .etat{padding:40px 0; color:var(--v2-txt3)}
  h2{margin:22px 0 10px; font:600 13px var(--v2-sans); color:var(--v2-txt2);
    text-transform:uppercase; letter-spacing:.05em}
  .titres{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px}
  .piste{width:100%; display:grid; grid-template-columns:28px 1fr 1fr auto; gap:12px; align-items:center;
    padding:8px 10px; border:0; border-radius:8px; background:transparent; color:inherit;
    font:inherit; text-align:left; cursor:pointer}
  .piste:hover{background:var(--v2-line2)}
  .rang{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .tt{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .al{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--v2-txt3); font-size:12.5px}
  .du{font:11px var(--v2-mono); color:var(--v2-txt3)}
  @media (max-width: 640px){
    .v2-fas{padding:0 16px 40px}
    .piste{grid-template-columns:24px 1fr auto}
    .al{display:none}
  }
</style>
