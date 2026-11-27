<script lang="ts">
  /** « Mes artistes » de Salon : grille de portraits ronds, chargée par pages. */
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Artist } from '../../lib/types';
  import { allerA } from '../../lib/stores/salon';
  import { lireAuHasard } from '../../lib/lectureSalon';
  import { fold } from '../../lib/utils';
  import IconeSalon from './IconeSalon.svelte';
  import BoutonLireSalon from './BoutonLireSalon.svelte';
  import FocusSalon from './FocusSalon.svelte';
  import { favoriteArtistIds } from '../../lib/stores/profile';
  import RondArtisteSalon from './RondArtisteSalon.svelte';

  const PAGE = 200;
  let items = $state<Artist[]>([]);
  let total = $state<number | null>(null);
  let fini = $state(false);
  let enCours = false;
  let filtre = $state('');
  let filtreOuvert = $state(false);

  async function chargerSuite() {
    if (enCours || fini) return;
    enCours = true;
    try {
      const lot = await api.getArtists(PAGE, items.length);
      items = [...items, ...lot];
      if (lot.length < PAGE) fini = true;
    } catch {
      fini = true;
    } finally {
      enCours = false;
    }
  }
  let temoin = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!temoin || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) void chargerSuite(); }, { rootMargin: '800px' });
    io.observe(temoin);
    return () => io.disconnect();
  });
  onMount(() => {
    void chargerSuite();
    api.getLibraryStats().then((s) => { total = s.artists; }).catch(() => {});
  });

  /**
   * Focus : les facettes du panneau désignent des NOMS d'artistes (facette
   * `artist`, comptée sous les filtres) ; les favoris, les identifiants du
   * profil. Filtré, l'écran charge la liste entière une fois.
   */
  let focusOuvert = $state(false);
  let focus = $state<{ facettes: Record<string, api.FacetParam>; favoris: boolean }>({ facettes: {}, favoris: false });
  let noms = $state<Set<string> | null>(null);
  let tous = $state<Artist[] | null>(null);
  const focusActif = $derived(Object.keys(focus.facettes).length > 0 || focus.favoris);
  $effect(() => {
    const f = focus.facettes;
    if (!Object.keys(f).length) { noms = null; return; }
    api.getLibraryFacets(['artist'], f, 0)
      .then((r) => { noms = new Set((r.artist ?? []).map((v) => fold(v.value))); })
      .catch(() => { noms = new Set(); });
  });
  $effect(() => {
    if (focusActif && tous === null) api.getAllArtists(2000).then((l) => { tous = l; }).catch(() => { tous = []; });
  });
  const base = $derived(focusActif && tous ? tous : items);
  const visibles = $derived(base.filter((a) =>
    (!filtre.trim() || fold(a.name).includes(fold(filtre.trim())))
    && (!noms || noms.has(fold(a.name)))
    && (!focus.favoris || (a.id != null && $favoriteArtistIds.has(a.id)))));
</script>

<div class="page" data-page-salon="artistes">
  <h1 class="s-titre">{$t('roonLike.artistes.titre' as any)}</h1>
  <p class="s-compte">{total == null ? '' : $t('roonLike.artistes.compte' as any).replace('{n}', total.toLocaleString($locale))}</p>
  <div class="lire"><BoutonLireSalon lire={() => lireAuHasard()} /></div>

  <div class="outils">
    <button class="focus" onclick={() => (focusOuvert = !focusOuvert)} aria-expanded={focusOuvert} title={$t('roonLike.focus.aide' as any)}>
      <span class="chevron" class:tourne={focusOuvert}><IconeSalon nom="suivant" taille={13} trait={2} /></span>{$t('roonLike.focus' as any)}
    </button>
    <button class="s-rond petit" aria-pressed={focus.favoris} onclick={() => (focus = { ...focus, favoris: !focus.favoris })}
      aria-label={$t('roonLike.focus.favoris' as any)} title={$t('roonLike.focus.favoris' as any)}>
      <IconeSalon nom="favoris" taille={14} plein />
    </button>
    <span class="espace"></span>
    <span class="tri">{$t('roonLike.tri.nom' as any)}</span>
    {#if filtreOuvert}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="s-champ" bind:value={filtre} placeholder={$t('roonLike.filtrer' as any)} autofocus
        onkeydown={(e) => { if (e.key === 'Escape') { filtre = ''; filtreOuvert = false; } }} />
    {:else}
      <button class="filtrer" onclick={() => (filtreOuvert = true)}><IconeSalon nom="recherche" taille={15} />{$t('roonLike.filtrer' as any)}</button>
    {/if}
  </div>

  <FocusSalon ouvert={focusOuvert} onchange={(f) => (focus = f)} />

  <div class="s-grille grille">
    {#each visibles as a, i (a.id ?? `${a.name}-${i}`)}
      <button class="artiste" onclick={() => { if (a.id != null) allerA({ page: 'artiste', id: a.id }); }}>
        <RondArtisteSalon nom={a.name} image={a.image_path ?? null} />
        <span class="nom" use:bulleTexte>{a.name}</span>
      </button>
    {/each}
  </div>
  {#if !visibles.length && fini}<p class="s-vide">{$t('roonLike.artistes.aucun' as any)}</p>{/if}
  <div class="temoin" bind:this={temoin}></div>
</div>

<style>
  .page { padding: 40px var(--s-marge-page) 48px; }
  .lire { margin: 34px 0 40px; }
  .outils { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; }
  .focus, .tri, .filtrer { display: inline-flex; align-items: center; gap: 6px; font-size: var(--s-t-texte); color: var(--s-txt2); }
  .focus:hover, .filtrer:hover { color: var(--s-txt); }
  .chevron { display: inline-grid; transition: transform .15s; }
  .chevron.tourne { transform: rotate(90deg); }
  .s-rond.petit { width: var(--s-rond-petit); height: var(--s-rond-petit); color: var(--s-txt2); }
  .espace { flex: 1; }
  .artiste { display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 0; }
  .nom { font-size: var(--s-t-texte); color: var(--s-txt); text-align: center; max-width: 100%;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .artiste:hover .nom { text-decoration: underline; }
  .temoin { height: 1px; }
</style>
