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
  import { ficheArtisteService } from '../../lib/stores/streaming';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { t as tr } from '../../lib/i18n';
  import AlbumArt from '../AlbumArt.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';

  const cible = $derived($ficheArtisteService);

  let artiste = $state<Artist | null>(null);
  let titres = $state<Track[]>([]);
  let albums = $state<Album[]>([]);
  let chargement = $state(true);
  let albumOuvert = $state<Album | null>(null);

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
    if (tt.status === 'fulfilled') titres = tt.value ?? [];
    if (al.status === 'fulfilled') albums = al.value ?? [];
    chargement = false;
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

  /**
   * 🔴 `source` va TOUJOURS avec `source_id`. La charge de `top-tracks` ne
   * porte pas le service — il est dans l'URL — donc on le rajoute ici. Sans
   * lui, l'identifiant n'est apparié par aucun service et la lecture échoue
   * sans rien dire.
   */
  function lire(p: any) {
    const zid = $currentZoneId;
    const svc = cible?.service;
    if (zid == null || !svc || !p?.source_id) return;
    playAndSync(zid, {
      source: svc,
      source_id: String(p.source_id),
      title: p.title ?? null,
      artist_name: p.artist_name ?? null,
      album_title: p.album_title ?? null,
      cover_path: p.cover_path ?? null,
      duration_ms: p.duration_ms,
    }).catch(signalerEchecLecture);
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
  <AlbumDetailV2 album={albumOuvert} service={cible?.service ?? null} onClose={() => (albumOuvert = null)} />
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
    </div>
  </header>

  {#if chargement}
    <div class="etat">{$tr('v2.common.loading' as any)}</div>
  {:else if !titres.length && !albums.length}
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

    {#if albums.length}
      <h2>{$tr('v2.fas.albums' as any)}</h2>
      <div class="grille">
        {#each albums as al (String(al.source_id ?? al.title))}
          <button class="carte" onclick={() => (albumOuvert = al)}>
            <AlbumArt coverPath={al.cover_path} albumId={null} size={0}
                      alt={al.title} source={(al.source ?? cible?.service) as any}
                      fallbackInitials={al.title?.slice(0, 1)} />
            <span class="ti">{al.title}</span>
            {#if al.year}<span class="an">{al.year}</span>{/if}
          </button>
        {/each}
      </div>
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
  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(132px, 1fr)); gap:16px}
  .carte{border:0; background:transparent; color:inherit; font:inherit; padding:0; cursor:pointer;
    display:flex; flex-direction:column; gap:6px; text-align:left}
  .carte :global(img), .carte :global(.art){border-radius:9px; aspect-ratio:1; width:100%}
  .ti{font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .an{font:11px var(--v2-mono); color:var(--v2-txt3)}
  @media (max-width: 640px){
    .v2-fas{padding:0 16px 40px}
    .piste{grid-template-columns:24px 1fr auto}
    .al{display:none}
  }
</style>
