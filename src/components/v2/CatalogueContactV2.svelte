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
   *
   * Étape T3 (renesenses/tune-server-rust#5326, décisions du 28/09/2026) :
   * - en tête, la rangée « Sélections » : les étiquettes et collections
   *   intelligentes que ce contact a cochées pour un cercle où je suis rangé,
   *   réunies, sans aucun nom de cercle ;
   * - la vue d'un rayon : ses albums, titres et artistes de bibliothèque avec
   *   les mêmes composants, et ses éléments de STREAMING comme des
   *   RÉFÉRENCES (titre, artiste, album, services) — rien à écouter ici ;
   * - 🔴 un 404 dans un rayon ramène au catalogue du contact avec « Ce rayon
   *   n'est plus partagé » ; si le catalogue lui-même répond 404 ensuite,
   *   l'écran se ferme comme en T2.
   * La liste des rayons qui échoue (greffon T2 sans la route, panne) laisse
   * simplement la rangée absente : elle ne ferme jamais le catalogue.
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dateCourte } from '../../lib/dates';
  import {
    statsContact, artistesContact, albumsContact, pistesContact, pistesAlbumContact,
    pisteVersTrack, plusPartage, motifCercle, pochetteAlbumContact,
    rayonsContact, albumsRayon, pistesRayon, artistesRayon, referencesRayon, servicesReference, NOM_SERVICE,
    ecoutePermise, ecouterChezContact, motifEcoute,
    type PartageRecu, type StatsContact, type ArtisteContact, type AlbumContact,
    type MotifCercle, type PageContact, type PisteContact, type RayonContact, type ReferenceContact, type ComptesRayon,
  } from '../../lib/circle';
  import { formatTime } from '../../lib/utils';
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

  type Onglet = 'albums' | 'artists' | 'tracks' | 'streaming';
  const ONGLETS: { id: Onglet; cle: string }[] = [
    { id: 'albums', cle: 'v2.circle.lib.albums' },
    { id: 'artists', cle: 'v2.circle.lib.artists' },
    { id: 'tracks', cle: 'v2.circle.lib.tracks' },
  ];
  /** Dans un rayon : les mêmes, plus ses éléments de streaming. */
  const ONGLETS_RAYON: { id: Onglet; cle: string; compte: keyof ComptesRayon }[] = [
    { id: 'albums', cle: 'v2.circle.lib.albums', compte: 'albums' },
    { id: 'tracks', cle: 'v2.circle.lib.tracks', compte: 'tracks' },
    { id: 'artists', cle: 'v2.circle.lib.artists', compte: 'artists' },
    { id: 'streaming', cle: 'v2.circle.sel.streaming', compte: 'streaming' },
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
  /** T3 : les rayons de ce contact, et celui qu'on parcourt. */
  let rayonsListe = $state<RayonContact[]>([]);
  let rayon = $state<RayonContact | null>(null);
  let references = $state<ReferenceContact[]>([]);
  /** « Cette sélection n'est plus partagée » : posé au retour d'un 404 dans un rayon. */
  let rayonParti = $state(false);

  /** Les onglets d'un rayon : ceux qui ont quelque chose, tous si le cloud ne compte pas. */
  const ongletsRayon = $derived.by(() => {
    const c = rayon?.counts;
    if (!c) return ONGLETS_RAYON;
    const pleins = ONGLETS_RAYON.filter((o) => (c[o.compte] ?? 0) > 0);
    return pleins.length > 0 ? pleins : ONGLETS_RAYON.slice(0, 1);
  });
  const ongletsAffiches = $derived(rayon ? ongletsRayon : ONGLETS);
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
      if (plusPartage(e)) { if (rayon) fermerRayon(true); else fermerPlusPartage(); return; }
      erreur = motifCercle(e);
    } finally {
      if (!fini && moi === jeton) chargement = false;
    }
  }

  function fermerPlusPartage() {
    fini = true;
    stats = null; artistes = []; albums = []; pistes = []; pistesAlbum = []; album = null;
    rayonsListe = []; rayon = null; references = [];
    sourcesPistes = []; sourcesAlbum = [];
    onFermer(true);
  }

  /** Les rayons de ce contact. Un échec (greffon T2, panne, 404) : pas de rangée, rien d'autre. */
  async function lireRayons() {
    try {
      const l = await rayonsContact(contact.user_id);
      if (!fini) rayonsListe = l;
    } catch {
      if (!fini) rayonsListe = [];
    }
  }

  function viderListes() {
    artistes = []; albums = []; pistes = []; references = []; album = null; pistesAlbum = [];
  }

  function ouvrirRayon(r: RayonContact) {
    rayon = r;
    rayonParti = false;
    recherche = '';
    artiste = null;
    viderListes();
    onglet = ongletsRayon[0]?.id ?? 'albums';
    recharger();
  }

  /**
   * Retour au catalogue du contact. `parti` : le rayon a répondu 404 — la
   * phrase, et la liste des rayons RELUE ; le catalogue relu dira, lui, si
   * c'est tout le partage qui est coupé.
   */
  function fermerRayon(parti: boolean) {
    rayon = null;
    rayonParti = parti;
    recherche = '';
    artiste = null;
    viderListes();
    onglet = 'albums';
    if (parti) rayonsListe = [];
    void lireRayons();
    recharger();
  }

  function chargerPage(n: number) {
    // Le filtre part par l'IDENTIFIANT d'artiste : c'est ce que le cloud attend.
    const q = { page: n, search: recherche, artist: onglet === 'albums' ? artiste?.id : undefined };
    const uid = contact.user_id;
    const suite = <T,>(liste: T[], p: PageContact<T>) => (n === 1 ? p.items : [...liste, ...p.items]);
    // Dans un rayon, les mêmes listes, lues sous `/sets/{id}/…`.
    const r = rayon;
    if (onglet === 'streaming' && r) {
      void lire(() => referencesRayon(uid, r.id, q), (p) => { references = suite(references, p); page = p.page; derniere = p.derniere; });
    } else if (onglet === 'artists') {
      void lire(() => (r ? artistesRayon(uid, r.id, q) : artistesContact(uid, q)),
        (p) => { artistes = suite(artistes, p); page = p.page; derniere = p.derniere; });
    } else if (onglet === 'albums') {
      void lire(() => (r ? albumsRayon(uid, r.id, q) : albumsContact(uid, q)),
        (p) => { albums = suite(albums, p); page = p.page; derniere = p.derniere; });
    } else {
      void lire(() => (r ? pistesRayon(uid, r.id, q) : pistesContact(uid, q)), (p) => {
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

  /** Artiste · album · durée d'une référence ; le genre si ce n'est pas un titre. */
  const detailsReference = (r: ReferenceContact) =>
    [r.type === 'album' ? $t('v2.circle.sel.refAlbum' as any) : r.type === 'artist' ? $t('v2.circle.sel.refArtist' as any) : null,
      r.type !== 'artist' ? r.artist_name : null, r.type === 'track' ? r.album_title : null,
      r.duration_ms != null && r.type === 'track' ? formatTime(r.duration_ms) : null]
      .filter(Boolean).join(' · ');

  const compteRayon = (r: RayonContact) =>
    r.count != null ? $t('v2.circle.sel.count' as any).replace('{n}', String(r.count)) : '';

  // Première lecture : les chiffres, puis la première page d'albums et les rayons.
  void lire(() => statsContact(contact.user_id), (s) => { stats = s; chargerPage(1); void lireRayons(); });
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

  {#if rayonParti && !rayon}
    <div class="err rayon-parti" role="alert"><span>{$t('v2.circle.sel.gone' as any)}</span></div>
  {/if}

  {#if rayon && !album}
    <div class="rayon-tete">
      <button class="lnk retour-catalogue" onclick={() => fermerRayon(false)}>← {$t('v2.circle.sel.backToLibrary' as any)}</button>
      <h3 class="titre-rayon">{rayon.name}</h3>
      {#if rayon.count != null}<p class="note">{compteRayon(rayon)}</p>{/if}
    </div>
  {:else if !rayon && !album && rayonsListe.length > 0}
    <section class="rayons-contact" aria-labelledby="circle-rayons-contact">
      <h3 id="circle-rayons-contact" class="titre-rayons">{$t('v2.circle.sel.contactTitle' as any)}</h3>
      <ul class="liste-rayons">
        {#each rayonsListe as r (r.id)}
          <li>
            <button class="rayon-contact" onclick={() => ouvrirRayon(r)}>
              <span class="nom-rayon">{r.name}</span>
              {#if r.count != null}<span class="note">{compteRayon(r)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
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
            enTetesDisque lectureSeule
            apres={ecoute ? boutonLire : undefined} largeurApres="84px" />
        </div>
      {/if}
    </div>
  {:else}
    <div class="onglets" role="tablist">
      {#each ongletsAffiches as o (o.id)}
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
            <!-- Dans un rayon, le cloud ne filtre pas ses albums par artiste : le nom seul, sans lien trompeur. -->
            <li class="ligne">{#if rayon}<span class="artiste-rayon">{a.name}</span>{:else}<button class="lnk artiste-contact" onclick={() => voirArtiste(a)}>{a.name}</button>{/if}</li>
          {/each}
        </ul>
      {/if}
    {:else if onglet === 'streaming'}
      <p class="note references-quoi">{$t('v2.circle.sel.streamingHint' as any)}</p>
      {#if references.length === 0 && !chargement && !erreur}
        <p class="note vide">{$t('v2.circle.lib.empty' as any)}</p>
      {:else}
        <ul class="references">
          {#each references as r, i (i)}
            <li class="ligne reference reference-{r.type}">
              <span class="ref-texte">
                <span class="ref-titre">{r.title}</span>
                <span class="note">{detailsReference(r)}</span>
              </span>
              <span class="services">
                {#each servicesReference(r) as sv (sv)}
                  <span class="service service-{sv}">{NOM_SERVICE[sv]}</span>
                {/each}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      {#if pistes.length === 0 && !chargement && !erreur}
        <p class="note vide">{$t('v2.circle.lib.empty' as any)}</p>
      {:else}
        <div class="pistes-contact">
          <ListePistesV2 {pistes} onLire={rienNeBouge} lectureSeule
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
  .rayon-tete{display:flex; flex-direction:column; gap:2px; align-items:flex-start}
  .titre-rayon{font-size:15px; font-weight:700; margin:0; overflow-wrap:anywhere}
  .rayons-contact{display:flex; flex-direction:column; gap:6px}
  .titre-rayons{font-size:13px; font-weight:700; margin:0; color:var(--v2-txt2)}
  .liste-rayons{display:flex; gap:8px; flex-wrap:wrap}
  .rayon-contact{display:flex; flex-direction:column; align-items:flex-start; gap:2px; max-width:220px; min-width:0; padding:8px 12px;
    border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface); color:var(--v2-txt);
    font:600 12.5px var(--v2-sans); cursor:pointer; text-align:left}
  .rayon-contact:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .rayon-contact .nom-rayon{max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .references{display:flex; flex-direction:column}
  .reference{display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:13px}
  .ref-texte{display:flex; flex-direction:column; min-width:0}
  .ref-titre{font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ref-texte .note{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .services{display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; flex:none}
  .service{font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); color:var(--v2-txt2)}
  .lire-piste,.lire-album{height:26px; padding:0 10px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface); color:var(--v2-txt); font:600 12px var(--v2-sans); cursor:pointer; white-space:nowrap}
  .lire-album{margin-top:6px}
  .lire-piste:disabled,.lire-album:disabled{opacity:.5; cursor:default}
  .lire-piste:focus-visible,.lire-album:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
</style>
