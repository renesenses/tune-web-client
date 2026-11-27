<script lang="ts">
  /**
   * « Mes albums » de Salon — ou les albums d'un genre (`genre`). Grand titre,
   * compte, « Lire maintenant », Focus, tri, Filtrer, puis la grille de
   * pochettes, chargée par pages au fil du défilement.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Album } from '../../lib/types';
  import { lireAuHasard, ajouterAlbumsALaFile } from '../../lib/lectureSalon';
  import { fold } from '../../lib/utils';
  import IconeSalon from './IconeSalon.svelte';
  import BoutonLireSalon from './BoutonLireSalon.svelte';
  import FocusSalon from './FocusSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';

  let { genre = null }: { genre?: string | null } = $props();

  const PAGE = 120;
  type Tri = 'artist' | 'title' | 'added';
  const TRIS: { id: Tri; cle: string }[] = [
    { id: 'artist', cle: 'roonLike.tri.artiste' },
    { id: 'title', cle: 'roonLike.tri.titre' },
    { id: 'added', cle: 'roonLike.tri.ajout' },
  ];
  let tri = $state<Tri>('artist');
  let items = $state<Album[]>([]);
  let total = $state<number | null>(null);
  let fini = $state(false);
  let enCours = false;
  let generation = 0;
  let filtre = $state('');
  let filtreOuvert = $state(false);
  let triOuvert = $state(false);
  /** Focus : les facettes choisies dans le panneau (et le genre de la page). */
  let focusOuvert = $state(false);
  let focus = $state<{ facettes: Record<string, api.FacetParam>; favoris: boolean }>({ facettes: {}, favoris: false });
  const facettes = $derived<Record<string, api.FacetParam>>({
    ...focus.facettes,
    ...(genre ? { genre } : {}),
    ...(focus.favoris ? { favorite: 'album' } : {}),
  });
  const filtreServeur = $derived(Object.keys(facettes).length > 0);

  async function chargerSuite() {
    if (enCours || fini) return;
    enCours = true;
    const gen = generation;
    try {
      let lot: Album[];
      if (filtreServeur) {
        const r = await api.getAlbumsDetailed(facettes, PAGE, items.length);
        total = r.total;
        lot = r.items.map((d) => ({ id: d.album_id, title: d.title ?? '', artist_name: d.album_artist, cover_path: d.cover_path, year: d.year }) as Album);
      } else {
        const r = await api.getAlbumsPagines({ limit: PAGE, offset: items.length, sort: tri, order: tri === 'added' ? 'desc' : 'asc' });
        total = r.total;
        lot = r.items;
      }
      if (gen !== generation) return;
      items = [...items, ...lot];
      if (lot.length < PAGE || (total != null && items.length >= total)) fini = true;
    } catch {
      fini = true;
    } finally {
      enCours = false;
    }
  }

  function recharger() {
    generation += 1;
    items = [];
    total = null;
    fini = false;
    enCours = false;
    void chargerSuite();
  }

  function changerTri(nouveau: Tri) {
    triOuvert = false;
    if (nouveau === tri) return;
    tri = nouveau;
    generation += 1;
    items = [];
    fini = false;
    enCours = false;
    void chargerSuite();
  }

  // Le témoin en bas de grille : visible → page suivante.
  let temoin = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!temoin || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) void chargerSuite(); }, { rootMargin: '800px' });
    io.observe(temoin);
    return () => io.disconnect();
  });
  onMount(() => { void chargerSuite(); });

  const visibles = $derived(filtre.trim()
    ? items.filter((a) => fold(`${a.title} ${a.artist_name ?? ''}`).includes(fold(filtre.trim())))
    : items);
  const triCourant = $derived(TRIS.find((x) => x.id === tri)!);
  const idsVisibles = $derived(visibles.flatMap((a) => (a.id == null ? [] : [a.id])));
</script>

<svelte:window onclick={() => (triOuvert = false)} />

<div class="page" data-page-salon={genre ? 'genre' : 'albums'}>
  <h1 class="s-titre">{genre ?? $t('roonLike.albums.titre' as any)}</h1>
  <p class="s-compte">{total == null ? '' : $t('roonLike.albums.compte' as any).replace('{n}', total.toLocaleString($locale))}</p>

  <!-- « Lire maintenant » garde son geste (la bibliothèque, ou le genre, au
       hasard, par le serveur) ; sa flèche ajoute les albums affichés, dans
       l'ordre, à la suite ou en fin de file. -->
  <div class="lire"><BoutonLireSalon lire={() => lireAuHasard(genre ? { genre } : {})}
    ensuite={visibles.length ? () => ajouterAlbumsALaFile(idsVisibles, 'ensuite') : null}
    enFile={visibles.length ? () => ajouterAlbumsALaFile(idsVisibles, 'fin') : null} /></div>

  <div class="outils">
    <button class="focus" onclick={() => (focusOuvert = !focusOuvert)} aria-expanded={focusOuvert} title={$t('roonLike.focus.aide' as any)}>
      <span class="chevron" class:tourne={focusOuvert}><IconeSalon nom="suivant" taille={13} trait={2} /></span>{$t('roonLike.focus' as any)}
    </button>
    <button class="s-rond petit" aria-pressed={focus.favoris}
      onclick={() => { focus = { ...focus, favoris: !focus.favoris }; recharger(); }}
      aria-label={$t('roonLike.focus.favoris' as any)} title={$t('roonLike.focus.favoris' as any)}>
      <IconeSalon nom="favoris" taille={14} plein />
    </button>
    <span class="espace"></span>
    {#if !filtreServeur}
      <div class="ancre">
        <button class="tri" onclick={(e) => { e.stopPropagation(); triOuvert = !triOuvert; }} aria-haspopup="menu" aria-expanded={triOuvert}>
          {$t(triCourant.cle as any)} <IconeSalon nom="bas" taille={12} trait={2.4} />
        </button>
        {#if triOuvert}
          <div class="s-menu menu" role="menu">
            {#each TRIS as x (x.id)}
              <button role="menuitemradio" aria-checked={x.id === tri} class:on={x.id === tri} onclick={() => changerTri(x.id)}>{$t(x.cle as any)}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if filtreOuvert}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="s-champ" bind:value={filtre} placeholder={$t('roonLike.filtrer' as any)} autofocus
        onkeydown={(e) => { if (e.key === 'Escape') { filtre = ''; filtreOuvert = false; } }} />
    {:else}
      <button class="filtrer" onclick={() => (filtreOuvert = true)}><IconeSalon nom="recherche" taille={15} />{$t('roonLike.filtrer' as any)}</button>
    {/if}
  </div>

  <FocusSalon ouvert={focusOuvert} onchange={(f) => { focus = f; recharger(); }} />

  <div class="s-grille grille">
    {#each visibles as a, i (a.id ?? `${a.title}-${i}`)}
      <CarteAlbumSalon album={a} />
    {/each}
  </div>
  {#if !visibles.length && fini}
    <p class="s-vide">{$t('roonLike.albums.aucun' as any)}</p>
  {/if}
  <div class="temoin" bind:this={temoin}></div>
</div>

<style>
  .page { padding: 40px var(--s-marge-page) 48px; }
  .lire { margin: 34px 0 40px; }
  .outils { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; }
  .focus, .tri, .filtrer { display: inline-flex; align-items: center; gap: 6px; font-size: var(--s-t-texte); color: var(--s-txt2); }
  .focus:hover, .tri:hover, .filtrer:hover { color: var(--s-txt); }
  .chevron { display: inline-grid; transition: transform .15s; }
  .chevron.tourne { transform: rotate(90deg); }
  .s-rond.petit { width: var(--s-rond-petit); height: var(--s-rond-petit); color: var(--s-txt2); }
  .espace { flex: 1; }
  .ancre { position: relative; }
  .menu { right: 0; top: calc(100% + 6px); }
  .temoin { height: 1px; }
</style>
