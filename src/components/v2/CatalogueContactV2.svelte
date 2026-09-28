<script lang="ts">
  /**
   * Tune Circle T2 — le catalogue d'un CONTACT, en lecture
   * (renesenses/tune-server-rust#5325, décisions de Bertrand du 28/09/2026).
   *
   * Le contact a partagé sa bibliothèque avec un de ses cercles, où je suis
   * rangé. Je parcours sa COPIE EN LIGNE (pas son serveur en direct) :
   * artistes, albums, pistes, recherche. Métadonnées seules — jamais un
   * chemin.
   *
   * T4 (renesenses/tune-server-rust#5327, décisions du 28/09/2026) : un
   * bouton Lire par piste, et un pour l'album ouvert, SEULEMENT si j'ai
   * Premium (`ecoutePermise`). Il demande au greffon `POST /listen` sur ma
   * zone active ; l'audio reste chez le contact et passe par le relais, en
   * fichier d'origine — rien à régler. Aucune présence permanente : que son
   * serveur soit éteint ne se dit qu'à la tentative d'écoute, et un refus
   * Premium ou d'indisponibilité se dit en une phrase NEUTRE.
   *
   * - Les pistes passent par la liste commune de la Bibliothèque
   *   (`ListePistesV2`), en `lectureSeule` : ni barre d'actions, ni clic de
   *   lecture, ni colonne « Chemin ».
   * - Les pochettes (décision 4 du 28/09) : la pochette PUBLIQUE de Cover Art
   *   Archive, par l'identifiant MusicBrainz de release-group quand la
   *   projection le porte (`pochetteAlbumContact`), sinon — ou si elle ne se
   *   charge pas — l'icône générique d'`AlbumArt`. Seul le MBID sort, par le
   *   relais de NOTRE serveur ; aucun titre, aucun artiste, et rien n'est
   *   demandé au serveur du contact.
   * - 🔴 Un 404 à n'importe quel moment (partage coupé, retrait du cercle,
   *   révocation) : l'écran se FERME et le dit. Rien n'est gardé — ce
   *   composant détruit, toutes ses listes partent avec lui.
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dateCourte } from '../../lib/dates';
  import {
    statsContact, artistesContact, albumsContact, pistesContact, pistesAlbumContact,
    pisteVersTrack, plusPartage, motifCercle, pochetteAlbumContact,
    ecoutePermise, ecouterChezContact, motifEcoute,
    type PartageRecu, type StatsContact, type ArtisteContact, type AlbumContact,
    type MotifCercle, type PageContact, type PisteContact,
  } from '../../lib/circle';
  import { currentZone } from '../../lib/stores/zones';
  import { licenseState, isPremium } from '../../lib/stores/license';
  import type { Track } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';

  interface Props {
    contact: PartageRecu;
    /** `plusPartage` : le cloud a répondu 404, le catalogue n'est plus à moi. */
    onFermer: (plusPartage: boolean) => void;
    /** T4 — le `premium` de `/library-sync`, s'il a répondu. Sinon : la licence. */
    premium?: boolean | null;
  }
  let { contact, onFermer, premium = null }: Props = $props();

  /** Le bouton Lire n'existe que pour un auditeur Premium : aucun appel sinon. */
  const ecoute = $derived(ecoutePermise(premium, { loaded: $licenseState.loaded, premium: $isPremium }));

  type Onglet = 'albums' | 'artists' | 'tracks';
  const ONGLETS: { id: Onglet; cle: string }[] = [
    { id: 'albums', cle: 'v2.circle.lib.albums' },
    { id: 'artists', cle: 'v2.circle.lib.artists' },
    { id: 'tracks', cle: 'v2.circle.lib.tracks' },
  ];

  let onglet = $state<Onglet>('albums');
  let recherche = $state('');
  let artiste = $state<ArtisteContact | null>(null);
  let stats = $state<StatsContact | null>(null);
  let artistes = $state<ArtisteContact[]>([]);
  let albums = $state<AlbumContact[]>([]);
  let pistes = $state<Track[]>([]);
  let page = $state(1);
  let derniere = $state(true);
  let chargement = $state(false);
  let erreur = $state<MotifCercle | null>(null);
  let album = $state<AlbumContact | null>(null);
  let pistesAlbum = $state<Track[]>([]);
  /** Les pistes du contact, dans l'ordre de la liste : c'est leur `id` qui part à `/listen`. */
  let sourcesPistes = $state<PisteContact[]>([]);
  let sourcesAlbum = $state<PisteContact[]>([]);
  /** La phrase d'un refus d'écoute ; le catalogue reste affiché. */
  let refusEcoute = $state<string | null>(null);
  /** L'identifiant de la piste dont l'écoute est en cours de demande. */
  let ecouteEnCours = $state<number | null>(null);

  let fini = false;
  /** Chaque lecture porte un jeton : une réponse arrivée après un autre geste est jetée. */
  let jeton = 0;
  let minuteurRecherche: ReturnType<typeof setTimeout> | null = null;

  function phrase(m: MotifCercle): string {
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  /** Toute lecture passe par ici : un 404 ferme l'écran, le reste s'affiche. */
  async function lire<T>(action: () => Promise<T>, poser: (v: T) => void): Promise<void> {
    const moi = ++jeton;
    chargement = true;
    erreur = null;
    try {
      const v = await action();
      if (fini || moi !== jeton) return;
      poser(v);
    } catch (e) {
      if (fini || moi !== jeton) return;
      if (plusPartage(e)) { fermerPlusPartage(); return; }
      erreur = motifCercle(e);
    } finally {
      if (!fini && moi === jeton) chargement = false;
    }
  }

  function fermerPlusPartage() {
    fini = true;
    stats = null; artistes = []; albums = []; pistes = []; pistesAlbum = []; album = null;
    sourcesPistes = []; sourcesAlbum = [];
    onFermer(true);
  }

  function chargerPage(n: number) {
    // Le filtre part par l'IDENTIFIANT d'artiste : c'est ce que le cloud attend.
    const q = { page: n, search: recherche, artist: onglet === 'albums' ? artiste?.id : undefined };
    const uid = contact.user_id;
    const suite = <T,>(liste: T[], p: PageContact<T>) => (n === 1 ? p.items : [...liste, ...p.items]);
    if (onglet === 'artists') {
      void lire(() => artistesContact(uid, q), (p) => { artistes = suite(artistes, p); page = p.page; derniere = p.derniere; });
    } else if (onglet === 'albums') {
      void lire(() => albumsContact(uid, q), (p) => { albums = suite(albums, p); page = p.page; derniere = p.derniere; });
    } else {
      void lire(() => pistesContact(uid, q), (p) => {
        const neuves = p.items.map(pisteVersTrack);
        pistes = n === 1 ? neuves : [...pistes, ...neuves];
        sourcesPistes = n === 1 ? p.items : [...sourcesPistes, ...p.items];
        page = p.page; derniere = p.derniere;
      });
    }
  }

  function recharger() {
    album = null;
    pistesAlbum = [];
    sourcesAlbum = [];
    chargerPage(1);
  }

  function choisirOnglet(o: Onglet) {
    if (o === onglet && !album) return;
    onglet = o;
    if (o !== 'albums') artiste = null;
    recharger();
  }

  function rechercher(ev: Event) {
    recherche = (ev.currentTarget as HTMLInputElement).value;
    if (minuteurRecherche) clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(recharger, 300);
  }

  function voirArtiste(a: ArtisteContact) {
    artiste = a;
    onglet = 'albums';
    recherche = '';
    recharger();
  }

  function toutesLesArtistes() {
    artiste = null;
    recharger();
  }

  function ouvrirAlbum(a: AlbumContact) {
    album = a;
    pistesAlbum = [];
    sourcesAlbum = [];
    void lire(() => pistesAlbumContact(contact.user_id, a.id), (l) => { sourcesAlbum = l; pistesAlbum = l.map(pisteVersTrack); });
  }

  /**
   * T4 — écouter une piste du contact (ou tout l'album, `liste`) sur MA zone
   * active. Tout refus laisse le catalogue ouvert et dit sa phrase, 404
   * compris (« ce titre n'est plus partagé ») ; la navigation suivante, elle,
   * fermera l'écran si le catalogue entier n'est plus à moi.
   */
  async function lancerEcoute(p: PisteContact | undefined, liste?: PisteContact[]) {
    if (!ecoute || !p || ecouteEnCours != null) return;
    const zone = $currentZone?.id ?? null;
    if (zone == null) { refusEcoute = $t('v2.circle.listen.noZone' as any); return; }
    refusEcoute = null;
    ecouteEnCours = p.id;
    try {
      await ecouterChezContact(contact.user_id, liste ? liste.map((x) => x.id) : p.id, zone);
    } catch (e) {
      if (fini) return;
      const m = motifEcoute(e);
      refusEcoute = m.cle.startsWith('v2.circle.listen.')
        ? $t(m.cle as any).replace('{name}', contact.name)
        : phrase(m as MotifCercle);
    } finally {
      if (!fini) ecouteEnCours = null;
    }
  }

  function reessayer() {
    if (album) ouvrirAlbum(album);
    else chargerPage(page);
  }

  const detailsAlbum = (a: AlbumContact) =>
    [a.artist_name, a.year != null ? String(a.year) : null,
      a.track_count != null ? $t('v2.circle.lib.trackCount' as any).replace('{n}', String(a.track_count)) : null]
      .filter(Boolean).join(' · ');

  const ligneStats = $derived(stats
    ? $t('v2.circle.lib.stats' as any)
      .replace('{albums}', String(stats.albums))
      .replace('{artists}', String(stats.artists))
      .replace('{tracks}', String(stats.tracks))
    : '');

  const rienNeBouge = () => {};
  const lireLigne = (_p: Track, i: number) => void lancerEcoute((album ? sourcesAlbum : sourcesPistes)[i]);

  // Première lecture : les chiffres, puis la première page d'albums.
  void lire(() => statsContact(contact.user_id), (s) => { stats = s; chargerPage(1); });
  onDestroy(() => { fini = true; if (minuteurRecherche) clearTimeout(minuteurRecherche); });
</script>

<div class="catalogue-contact">
  <div class="tete">
    <button class="lnk retour-liste" onclick={() => onFermer(false)}>← {$t('v2.circle.lib.back' as any)}</button>
    <h2 class="titre-catalogue">{$t('v2.circle.lib.title' as any).replace('{name}', contact.name)}</h2>
    {#if stats}
      <p class="note stats">{ligneStats}{#if stats.last_sync} · {$t('v2.circle.lib.updated' as any).replace('{date}', $dateCourte(stats.last_sync))}{/if}</p>
    {/if}
    {#if ecoute}
      <p class="note ecoute-note">{$t('v2.circle.listen.hint' as any)}</p>
    {:else}
      <p class="note lecture-seule">{$t('v2.circle.lib.readOnly' as any)}</p>
      <p class="note ecoute-premium"><span aria-hidden="true">🔒</span> {$t('v2.circle.listen.premiumOnly' as any)}</p>
    {/if}
    {#if refusEcoute}
      <div class="err refus-ecoute" role="alert"><span>{refusEcoute}</span>
        <button class="lnk fermer-refus" onclick={() => (refusEcoute = null)}>{$t('v2.circle.listen.dismiss' as any)}</button></div>
    {/if}
  </div>

{#snippet boutonLire(_p: Track, i: number)}
  {@const source = (album ? sourcesAlbum : sourcesPistes)[i]}
  <button class="lire-piste" disabled={ecouteEnCours != null || !source}
    aria-label={$t('v2.circle.listen.playTrack' as any).replace('{title}', source?.title ?? '')}
    onclick={() => lireLigne(_p, i)}>▶ {$t('v2.circle.listen.play' as any)}</button>
{/snippet}

  {#if album}
    <div class="album-ouvert">
      <button class="lnk retour-albums" onclick={() => { album = null; pistesAlbum = []; }}>← {$t('v2.circle.lib.backToAlbums' as any)}</button>
      <div class="album-tete">
        <span class="pochette"><AlbumArt coverPath={pochetteAlbumContact(album)} albumId={null} size={0} alt={album.title} /></span>
        <div class="album-infos">
          <h3 class="album-titre">{album.title}</h3>
          <p class="note">{detailsAlbum(album)}{#if album.genre} · {album.genre}{/if}</p>
          {#if ecoute && sourcesAlbum.length > 0}
            <button class="lire-album" disabled={ecouteEnCours != null}
              onclick={() => void lancerEcoute(sourcesAlbum[0], sourcesAlbum)}>▶ {$t('v2.circle.listen.playAlbum' as any)}</button>
          {/if}
        </div>
      </div>
      {#if erreur}
        <div class="err" role="alert"><span>{phrase(erreur)}</span>
          <button class="lnk reessayer" onclick={reessayer}>{$t('v2.circle.retry' as any)}</button></div>
      {:else if chargement && pistesAlbum.length === 0}
        <div class="state">{$t('v2.tool.loading' as any)}</div>
      {:else}
        <div class="pistes-album">
          <ListePistesV2 pistes={pistesAlbum} onLire={rienNeBouge} numerotation="piste"
            avecAlbum={false} pochette={false} enTetesDisque lectureSeule
            apres={ecoute ? boutonLire : undefined} largeurApres="84px" />
        </div>
      {/if}
    </div>
  {:else}
    <div class="onglets" role="tablist">
      {#each ONGLETS as o (o.id)}
        <button class="onglet onglet-{o.id}" role="tab" aria-selected={onglet === o.id}
          onclick={() => choisirOnglet(o.id)}>{$t(o.cle as any)}</button>
      {/each}
    </div>
    <div class="rangee">
      <label class="sr" for="circle-lib-recherche">{$t('v2.circle.lib.search' as any)}</label>
      <input id="circle-lib-recherche" class="champ recherche" type="search"
        placeholder={$t('v2.circle.lib.search' as any)} value={recherche} oninput={rechercher} />
      {#if artiste && onglet === 'albums'}
        <span class="filtre-artiste">{$t('v2.circle.lib.byArtist' as any).replace('{name}', artiste.name)}</span>
        <button class="lnk tous-artistes" onclick={toutesLesArtistes}>{$t('v2.circle.lib.allArtists' as any)}</button>
      {/if}
    </div>

    {#if erreur}
      <div class="err" role="alert"><span>{phrase(erreur)}</span>
        <button class="lnk reessayer" onclick={reessayer}>{$t('v2.circle.retry' as any)}</button></div>
    {/if}

    {#if onglet === 'albums'}
      {#if albums.length === 0 && !chargement && !erreur}
        <p class="note vide">{$t('v2.circle.lib.empty' as any)}</p>
      {:else}
        <ul class="albums">
          {#each albums as a (a.id)}
            <li>
              <button class="album-contact" onclick={() => ouvrirAlbum(a)} title={a.title}>
                <span class="pochette"><AlbumArt coverPath={pochetteAlbumContact(a)} albumId={null} size={0} alt={a.title} /></span>
                <span class="album-nom">{a.title}</span>
                <span class="note">{detailsAlbum(a)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if onglet === 'artists'}
      {#if artistes.length === 0 && !chargement && !erreur}
        <p class="note vide">{$t('v2.circle.lib.empty' as any)}</p>
      {:else}
        <ul class="artistes">
          {#each artistes as a (a.id)}
            <li class="ligne"><button class="lnk artiste-contact" onclick={() => voirArtiste(a)}>{a.name}</button></li>
          {/each}
        </ul>
      {/if}
    {:else}
      {#if pistes.length === 0 && !chargement && !erreur}
        <p class="note vide">{$t('v2.circle.lib.empty' as any)}</p>
      {:else}
        <div class="pistes-contact">
          <ListePistesV2 {pistes} onLire={rienNeBouge} pochette={false} lectureSeule
            apres={ecoute ? boutonLire : undefined} largeurApres="84px" />
        </div>
      {/if}
    {/if}

    {#if chargement}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !derniere && !erreur}
      <button class="lnk plus" onclick={() => chargerPage(page + 1)}>{$t('v2.circle.lib.more' as any)}</button>
    {/if}
  {/if}
</div>

<style>
  .catalogue-contact{display:flex; flex-direction:column; gap:12px}
  .tete{display:flex; flex-direction:column; gap:4px; align-items:flex-start}
  .titre-catalogue{font-size:17px; font-weight:700; margin:0; overflow-wrap:anywhere}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .state{color:var(--v2-txt3); font-size:13px}
  .vide{margin:0}
  .err{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; font-size:12.5px;
    border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .onglets{display:flex; gap:6px; flex-wrap:wrap}
  .onglet{height:30px; padding:0 14px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt2); font:600 12.5px var(--v2-sans); cursor:pointer}
  .onglet[aria-selected="true"]{background:var(--v2-acc-soft); color:var(--v2-txt); border-color:var(--v2-line)}
  .rangee{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .champ{height:34px; padding:0 12px; border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font:13px var(--v2-sans); min-width:0; flex:1 1 220px}
  .filtre-artiste{font-size:12.5px; color:var(--v2-txt2)}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px; text-align:left}
  .onglet:focus-visible,.champ:focus-visible,.lnk:focus-visible,.album-contact:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  ul{list-style:none; margin:0; padding:0}
  .albums{display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:14px}
  .album-contact{display:flex; flex-direction:column; gap:4px; width:100%; border:0; background:transparent; color:var(--v2-txt);
    cursor:pointer; padding:0; text-align:left; font:13px var(--v2-sans); min-width:0}
  .pochette{display:block; width:100%; aspect-ratio:1; border-radius:var(--v2-r-md); overflow:hidden; background:var(--v2-surface2)}
  .album-nom{font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .album-contact .note{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .artistes{display:flex; flex-direction:column}
  .ligne{padding:6px; border-bottom:1px solid var(--v2-line)}
  .album-ouvert{display:flex; flex-direction:column; gap:10px}
  .album-tete{display:flex; gap:14px; align-items:center}
  .album-tete .pochette{width:96px; flex:none}
  .album-infos{min-width:0}
  .album-titre{font-size:15px; font-weight:700; margin:0; overflow-wrap:anywhere}
  .plus{align-self:flex-start}
  .lire-piste,.lire-album{height:26px; padding:0 10px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface); color:var(--v2-txt); font:600 12px var(--v2-sans); cursor:pointer; white-space:nowrap}
  .lire-album{margin-top:6px}
  .lire-piste:disabled,.lire-album:disabled{opacity:.5; cursor:default}
  .lire-piste:focus-visible,.lire-album:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
</style>
