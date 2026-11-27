<script lang="ts">
  /**
   * Coquille de l'interface « Salon » (itération 1, 25/11/2026).
   *
   * Montée par `ShellV2` À LA PLACE de sa barre latérale, de sa grappe et de sa
   * barre de transport quand Réglages › Interface vaut « Salon ». Tout le
   * reste — magasins, WebSocket, historique, raccourcis clavier, dialogues,
   * bandeaux — est celui de `ShellV2`, qui continue de tourner : Salon est une
   * autre mise en page, pas une autre application.
   *
   * Les pages que Salon dessine vivent ici ; les autres écrans de Tune sont
   * montés tels quels par le snippet `vuesTune` (le routage de `ShellV2`).
   */
  import type { Snippet } from 'svelte';
  import { get } from 'svelte/store';
  import '../../styles/roon-like/mise-en-page.css';
  import '../../styles/roon-like/reglages.css';
  import '../../styles/roon-like/ecrans-tune.css';
  import { chargerJetons, JEU_PAR_DEFAUT } from './jetons';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { activeView, pendingLibraryAlbum, pendingLibraryArtist, type View } from '../../lib/stores/navigation';
  import { pageSalon, pileSalon, allerA, reculerSalon } from '../../lib/stores/salon';
  import { pageDeLaVue, definitionInterface, type PageSalon } from '../../lib/interfaceSalon';
  import GlobalSearchBar from '../partages/GlobalSearchBar.svelte';
  import AvatarMenu from '../v2/AvatarMenu.svelte';
  import IconeSalon from './IconeSalon.svelte';
  import BarreLateraleSalon from './BarreLateraleSalon.svelte';
  import TransportSalon from './TransportSalon.svelte';
  import AccueilSalon from './AccueilSalon.svelte';
  import AlbumsSalon from './AlbumsSalon.svelte';
  import ArtistesSalon from './ArtistesSalon.svelte';
  import AlbumSalon from './AlbumSalon.svelte';
  import ArtisteSalon from './ArtisteSalon.svelte';
  import GenresSalon from './GenresSalon.svelte';
  import FileSalon from './FileSalon.svelte';
  import PopupConfiguration from '../v2/PopupConfiguration.svelte';

  let { vuesTune, onSignet }: { vuesTune: Snippet; onSignet?: () => void } = $props();

  /** La vue de Tune qui correspond à une page Salon (historique, raccourcis). */
  function vueDeLaPage(p: PageSalon): View {
    switch (p.page) {
      case 'accueil': return 'home';
      case 'genres': case 'genre': return 'genres';
      case 'file': return 'queue';
      case 'tune': return p.vue as View;
      default: return 'library';
    }
  }

  /**
   * Deux sens, un seul drapeau.
   *   - Salon change de page → `activeView` suit (l'historique du navigateur
   *     et les raccourcis lisent `activeView`) ;
   *   - un écran de Tune change `activeView` (« Aller à l'album », Précédent
   *     du navigateur, recherche…) → Salon ouvre la page qui lui correspond.
   */
  let jePose = false;
  function poserVue(v: View) {
    if (get(activeView) === v) return;
    jePose = true;
    activeView.set(v);
    jePose = false;
  }

  function depuisLaVue(v: View): PageSalon {
    const album = v === 'library' ? get(pendingLibraryAlbum) : null;
    const artiste = v === 'library' ? get(pendingLibraryArtist) : null;
    if (album != null) pendingLibraryAlbum.set(null);
    if (artiste != null) pendingLibraryArtist.set(null);
    return pageDeLaVue(v, { album, artiste });
  }

  // Au montage : la page de la vue courante (vue de démarrage, ou celle d'où
  // l'on vient en basculant d'interface).
  pageSalon.set(depuisLaVue(get(activeView)));
  pileSalon.set([]);

  $effect(() => activeView.subscribe((v) => {
    if (jePose) return;
    const actuelle = get(pageSalon);
    const demandee = depuisLaVue(v);
    // La même famille de vues (une fiche album « dans » la bibliothèque) : on
    // ne quitte pas la page Salon ouverte, sauf demande explicite d'une fiche.
    if (vueDeLaPage(actuelle) === v && demandee.page !== 'album' && demandee.page !== 'artiste') return;
    allerA(demandee);
  }));
  $effect(() => pageSalon.subscribe((p) => poserVue(vueDeLaPage(p))));

  const theme = $derived($preferences.salonTheme === 'sombre' ? 'sombre' : 'clair');
  /** Le jeu de jetons de l'interface choisie (registre `INTERFACES`). */
  const jeu = $derived(definitionInterface($preferences.interfaceStyle).jetons ?? JEU_PAR_DEFAUT);
  let contenuEl = $state<HTMLElement | null>(null);
  let tiroir = $state(false);
  $effect(() => { void $pageSalon; tiroir = false; });
  // Chaque page s'ouvre en haut.
  $effect(() => { void $pageSalon; contenuEl?.scrollTo?.({ top: 0 }); });
</script>

<!-- Le jeu de jetons d'abord : sans lui, la coquille n'a ni couleurs ni tailles. -->
{#await chargerJetons(jeu) then}
<div class="salon tune-v2" data-jeu={jeu} data-salon-theme={theme} data-salon
  style={`--s-txt-oui:${JSON.stringify($t('roonLike.oui' as any))};--s-txt-non:${JSON.stringify($t('roonLike.non' as any))}`}>
  <div class="corps">
    <!-- Fenêtres étroites (≤ 760 px) : la barre latérale devient un tiroir,
         ouvert par ☰ dans l'en-tête et refermé à chaque changement de page. -->
    <div class="tiroir" class:ouvert={tiroir}><BarreLateraleSalon /></div>
    {#if tiroir}<button class="voile-tiroir" aria-label={$t('roonLike.nav.fermerMenu' as any)} onclick={() => (tiroir = false)}></button>{/if}
    <div class="colonne">
      <header class="entete">
        <button class="nu menu-tiroir" onclick={() => (tiroir = !tiroir)} aria-expanded={tiroir}
          aria-label={$t('roonLike.nav.menu' as any)} title={$t('roonLike.nav.menu' as any)}>
          <IconeSalon nom="menu" taille={20} />
        </button>
        <button class="nu" onclick={reculerSalon} disabled={!$pileSalon.length}
          aria-label={$t('roonLike.retour' as any)} title={$t('roonLike.retour' as any)}>
          <IconeSalon nom="retour" taille={22} trait={1.8} />
        </button>
        <div class="espace"></div>
        <div class="grappe">
          {#if onSignet}
            <button class="nu" onclick={onSignet} aria-label={$t('v2.nav.addShortcut' as any)} title={$t('v2.nav.addShortcut' as any)}>
              <IconeSalon nom="signet" taille={19} />
            </button>
          {/if}
          <GlobalSearchBar />
          <AvatarMenu />
        </div>
      </header>
      {#if $pageSalon.page === 'tune'}
        <!-- Un écran de Tune, monté tel quel. `data-vue` : la couche commune
             (`ecrans-tune.css`) l'habille, sauf TESS. La popup de configuration
             de TESS (rc14) couvre l'écran, comme dans l'interface actuelle. -->
        <div class="vue-tune" data-vue={$activeView}>{@render vuesTune()}<PopupConfiguration /></div>
      {:else}
        <main class="contenu" bind:this={contenuEl}>
          {#if $pageSalon.page === 'accueil'}
            <AccueilSalon />
          {:else if $pageSalon.page === 'albums'}
            <AlbumsSalon />
          {:else if $pageSalon.page === 'genre'}
            {#key $pageSalon.nom}<AlbumsSalon genre={$pageSalon.nom} />{/key}
          {:else if $pageSalon.page === 'artistes'}
            <ArtistesSalon />
          {:else if $pageSalon.page === 'album'}
            {#key $pageSalon.id}<AlbumSalon id={$pageSalon.id} />{/key}
          {:else if $pageSalon.page === 'artiste'}
            {#key $pageSalon.id}<ArtisteSalon id={$pageSalon.id} />{/key}
          {:else if $pageSalon.page === 'genres'}
            <GenresSalon />
          {:else if $pageSalon.page === 'file'}
            <FileSalon />
          {/if}
        </main>
      {/if}
    </div>
  </div>
  <TransportSalon />
</div>
{/await}

<style>
  .salon {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
    background: var(--s-bg); color: var(--s-txt);
    font-family: var(--s-police-texte);
    /* Les écrans de Tune réservent la largeur de la grappe flottante de
       l'interface actuelle : ici, la grappe est dans l'en-tête. */
    --v2-grappe-w: 0px;
    --v2-grappe-h: 0px;
  }
  .corps { flex: 1; min-height: 0; display: grid; grid-template-columns: var(--s-largeur-barre) minmax(0, 1fr); }
  .colonne { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .entete {
    flex: none; height: var(--s-haut-entete); display: flex; align-items: center;
    padding: 0 24px 0 28px;
  }
  .espace { flex: 1; }
  .grappe { display: flex; align-items: center; gap: 18px; }
  /* Le rond du compte : petit et sans liseré, comme la référence. */
  .grappe :global(.avwrap > .avatar) { width: var(--s-avatar); height: var(--s-avatar); border-width: 0; }
  .grappe :global(.avwrap > .avatar::after) { width: 7px; height: 7px; right: -1px; bottom: -1px; border-width: 1.5px; }
  .grappe :global(.avwrap > .avmenu) { top: calc(var(--s-avatar) + 10px); }
  .nu {
    background: none; border: 0; color: var(--s-txt); cursor: pointer;
    width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%;
  }
  .nu:hover:not(:disabled) { background: var(--s-survol); }
  .nu:disabled { color: var(--s-txt3); cursor: default; }
  .contenu { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
  .vue-tune { flex: 1; min-height: 0; display: flex; overflow: hidden; position: relative; }
  .vue-tune > :global(*) { flex: 1 1 auto; min-width: 0; min-height: 0; }
  .tiroir { display: contents; }
  .menu-tiroir, .voile-tiroir { display: none; }
  @media (max-width: 760px) {
    .corps { grid-template-columns: 1fr; }
    .menu-tiroir { display: grid; }
    .entete { padding: 0 12px; }
    .tiroir {
      display: flex; position: fixed; z-index: 85; top: 0; bottom: var(--s-haut-transport); left: 0;
      width: min(280px, 82vw); transform: translateX(-100%);
      /* Fermé : ni ombre qui déborde sur le bord gauche, ni liens atteignables au clavier. */
      visibility: hidden; transition: transform .2s ease, visibility 0s linear .2s;
    }
    .tiroir > :global(*) { flex: 1; min-width: 0; }
    .tiroir.ouvert { transform: none; visibility: visible; box-shadow: var(--s-ombre); transition: transform .2s ease; }
    .voile-tiroir {
      display: block; position: fixed; inset: 0 0 var(--s-haut-transport) 0; z-index: 84;
      border: 0; background: var(--s-voile-tiroir); cursor: pointer;
    }
  }
</style>
