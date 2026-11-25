<script lang="ts">
  /**
   * ═════════════════════════════════════════════════════════════════════
   *  NOCTURNE — point d'entrée UNIQUE de l'interface
   * ═════════════════════════════════════════════════════════════════════
   *
   * Deux montages :
   *   - par `ShellV2`, quand Réglages › Général › Interface vaut « Nocturne »
   *     (registre `INTERFACES`, `lib/interfaceSalon.ts`). ShellV2 continue de
   *     tourner : magasins, WebSocket, historique, raccourcis, dialogues,
   *     notifications, session expirée, assistant d'installation. Nocturne
   *     remplace sa barre latérale, sa grappe et sa barre de transport, et
   *     monte les écrans de Tune qu'il ne redessine pas par `vuesTune` ;
   *   - seul (`autonome`), par la page de démonstration servie en dev : il
   *     amorce alors lui-même zones, bibliothèque et transport.
   *
   * Jetons : `src/styles/nocturne/jetons-nocturne.css` ; police : Inter (OFL).
   */
  import type { Snippet } from 'svelte';
  import { get } from 'svelte/store';
  import '../../styles/nocturne/polices-nocturne.css';
  import '../../styles/nocturne/jetons-nocturne.css';
  import { locale, t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { applyV2Theme } from '../../lib/v2Theme';
  import { activeView, pendingLibraryAlbum, pendingLibraryArtist, type View } from '../../lib/stores/navigation';
  import { ongletCourant } from '../../lib/historiqueCoquille';
  import { bootstrapV2, suivreLaBibliotheque } from '../../lib/v2Bootstrap';
  import { demarrerTransportV2 } from '../../lib/v2Live';
  import ToastContainer from '../partages/ToastContainer.svelte';
  import DialogContainer from '../partages/DialogContainer.svelte';
  import TiroirNocturne from './TiroirNocturne.svelte';
  import EnteteNocturne from './EnteteNocturne.svelte';
  import BarreLectureNocturne from './BarreLectureNocturne.svelte';
  import PanneauFileNocturne from './PanneauFileNocturne.svelte';
  import BarreBibliothequeNocturne from './BarreBibliothequeNocturne.svelte';
  import AccueilNocturne from './AccueilNocturne.svelte';
  import AlbumsNocturne from './AlbumsNocturne.svelte';
  import ArtistesNocturne from './ArtistesNocturne.svelte';
  import AlbumNocturne from './AlbumNocturne.svelte';
  import ArtisteNocturne from './ArtisteNocturne.svelte';
  import LectureNocturne from './LectureNocturne.svelte';
  import { ecranNocturne, reinitialiser, allerA, type EcranNocturne } from './navigationNocturne';
  import { LIBELLE_COLLECTION } from './triNocturne';

  type Theme = 'sombre' | 'clair';
  interface Props {
    /** Le routage des écrans de Tune (fourni par ShellV2). Absent : mode autonome. */
    vuesTune?: Snippet | null;
    /** Écran d'ouverture (démonstration). */
    ecranInitial?: EcranNocturne | null;
    /** Thème imposé ; sinon le dernier choisi sur cet appareil. */
    themeInitial?: Theme | null;
    fileInitiale?: boolean;
    tiroirInitial?: boolean;
    /** Colonne Bibliothèque repliée au montage (démonstration). */
    biblioInitiale?: boolean | null;
  }
  let { vuesTune = null, ecranInitial = null, themeInitial = null, fileInitiale = false, tiroirInitial = false, biblioInitiale = null }: Props = $props();

  const integree = $derived(vuesTune != null);

  const CLE_THEME = 'tune-nocturne-theme';
  const CLE_EPINGLE = 'tune-nocturne-tiroir-epingle';
  const CLE_BIBLIO = 'tune-nocturne-biblio-repliee';
  function lire(cle: string): string | null {
    try { return localStorage.getItem(cle); } catch { return null; }
  }
  function ecrire(cle: string, v: string) {
    try { localStorage.setItem(cle, v); } catch { /* stockage indisponible : réglage de session */ }
  }

  let theme = $state<Theme>('sombre');
  let tiroirOuvert = $state(false);
  let tiroirEpingle = $state(false);
  let fileOuverte = $state(false);
  let biblioRepliee = $state(false);

  /* ── Écran Nocturne ↔ vue de Tune (`activeView`) ───────────────────── */
  function vueDeLEcran(e: EcranNocturne): View {
    switch (e.nom) {
      case 'accueil': return 'home';
      case 'lecture': return 'nowplaying';
      case 'tune': return e.vue as View;
      default: return 'library';
    }
  }
  /** Une vue demandée de l'extérieur (recherche, « aller à l'album », Précédent…). */
  function ecranDeLaVue(v: View): EcranNocturne | 'file' {
    if (v === 'library') {
      const album = get(pendingLibraryAlbum);
      const artiste = get(pendingLibraryArtist);
      if (album != null) { pendingLibraryAlbum.set(null); return { nom: 'album', id: album }; }
      if (artiste != null) { pendingLibraryArtist.set(null); return { nom: 'artiste', id: artiste }; }
      return { nom: 'albums' };
    }
    if (v === 'home') return { nom: 'accueil' };
    if (v === 'nowplaying') return { nom: 'lecture' };
    if (v === 'queue') return 'file';
    return { nom: 'tune', vue: v };
  }

  let jePose = false;
  $effect.pre(() => {
    theme = themeInitial ?? (lire(CLE_THEME) === 'clair' ? 'clair' : 'sombre');
    tiroirEpingle = lire(CLE_EPINGLE) === '1';
    biblioRepliee = biblioInitiale ?? lire(CLE_BIBLIO) === '1';
    tiroirOuvert = tiroirInitial;
    fileOuverte = fileInitiale;
    const depart = ecranInitial ?? (vuesTune ? ecranDeLaVue(get(activeView)) : { nom: 'accueil' as const });
    if (depart === 'file') { reinitialiser(); fileOuverte = true; } else reinitialiser(depart);
  });

  $effect(() => {
    if (!vuesTune) return;
    // Nocturne change d'écran → `activeView` suit (historique, raccourcis).
    const desabonnerEcran = ecranNocturne.subscribe((e) => {
      const v = vueDeLEcran(e);
      const onglet = e.nom === 'tune' ? e.onglet ?? null : null;
      jePose = true;
      // L'onglet AVANT la vue (l'écran le lit à son montage), puis de nouveau
      // après : changer de vue le remet à zéro (web#1790), et l'écran monté
      // suit un onglet reposé (comme pour un raccourci).
      if (onglet) ongletCourant.set(onglet);
      if (get(activeView) !== v) activeView.set(v);
      jePose = false;
      if (onglet) {
        ongletCourant.set(onglet);
        queueMicrotask(() => { if (get(ongletCourant) !== onglet && JSON.stringify(get(ecranNocturne)) === JSON.stringify(e)) ongletCourant.set(onglet); });
      }
    });
    // Un écran de Tune change `activeView` → Nocturne ouvre l'écran voulu.
    const desabonnerVue = activeView.subscribe((v) => {
      if (jePose) return;
      const actuel = get(ecranNocturne);
      if (vueDeLEcran(actuel) === v && !(v === 'library' && (get(pendingLibraryAlbum) != null || get(pendingLibraryArtist) != null))) return;
      const cible = ecranDeLaVue(v);
      if (cible === 'file') fileOuverte = true;
      else allerA(cible);
    });
    return () => { desabonnerEcran(); desabonnerVue(); };
  });

  // Mode autonome seulement : ShellV2 fait déjà tout cela quand il nous monte.
  $effect(() => {
    if (vuesTune) return;
    locale.set($preferences.language ?? 'en');
    bootstrapV2();
    const arreterBiblio = suivreLaBibliotheque();
    const arreterTransport = demarrerTransportV2();
    return () => { arreterBiblio?.(); arreterTransport?.(); };
  });

  // Les écrans de Tune montés dans la coquille lisent la palette v2 : la plus
  // proche du thème Nocturne.
  $effect(() => { if (vuesTune) applyV2Theme(theme === 'clair' ? 'clear-white' : 'dark-grey'); });

  function basculerTheme() {
    theme = theme === 'sombre' ? 'clair' : 'sombre';
    ecrire(CLE_THEME, theme);
  }
  function basculerEpingle() {
    tiroirEpingle = !tiroirEpingle;
    ecrire(CLE_EPINGLE, tiroirEpingle ? '1' : '0');
    if (!tiroirEpingle) tiroirOuvert = false;
  }
  function basculerBiblio() {
    biblioRepliee = !biblioRepliee;
    ecrire(CLE_BIBLIO, biblioRepliee ? '1' : '0');
  }

  /** Les écrans qui portent la colonne Bibliothèque. */
  const VUES_BIBLIO = new Set(['library', 'playlists', 'tags', 'statsbibliotheque', 'metadata', 'browse']);
  const avecBiblio = $derived.by(() => {
    const e = $ecranNocturne;
    if (e.nom === 'albums' || e.nom === 'artistes' || e.nom === 'collection') return true;
    return e.nom === 'tune' && VUES_BIBLIO.has(e.vue);
  });
</script>

<div class="nocturne" data-theme={theme}>
  <TiroirNocturne ouvert={tiroirOuvert} epingle={tiroirEpingle} {theme} {integree}
    fermer={() => (tiroirOuvert = false)} {basculerEpingle} {basculerTheme} />

  <div class="noc-cadre" class:decale={tiroirEpingle}>
    <EnteteNocturne ouvrirTiroir={() => (tiroirOuvert = true)} {tiroirEpingle} />
    <div class="noc-milieu" class:avec-biblio={avecBiblio && !biblioRepliee}>
      {#if avecBiblio}
        {#if biblioRepliee}
          <button type="button" class="noc-biblio-deplier" onclick={basculerBiblio} aria-label={$t('v2.nav.expandAria')} title={$t('v2.nav.expandAria')}>›</button>
        {:else}
          <BarreBibliothequeNocturne replier={basculerBiblio} {integree} />
        {/if}
      {/if}
      <main class="noc-contenu" class:noc-contenu-tune={$ecranNocturne.nom === 'tune'}>
        {#key JSON.stringify($ecranNocturne)}
          {#if $ecranNocturne.nom === 'accueil'}
            <AccueilNocturne />
          {:else if $ecranNocturne.nom === 'albums'}
            <AlbumsNocturne />
          {:else if $ecranNocturne.nom === 'collection'}
            <AlbumsNocturne cle={$ecranNocturne.cle} titre={$t(LIBELLE_COLLECTION[$ecranNocturne.cle])} />
          {:else if $ecranNocturne.nom === 'artistes'}
            <ArtistesNocturne />
          {:else if $ecranNocturne.nom === 'album'}
            <AlbumNocturne id={$ecranNocturne.id} />
          {:else if $ecranNocturne.nom === 'artiste'}
            <ArtisteNocturne id={$ecranNocturne.id} />
          {:else if $ecranNocturne.nom === 'lecture'}
            <LectureNocturne />
          {:else if $ecranNocturne.nom === 'tune' && vuesTune}
            <!-- Un écran de Tune, tel quel, aux couleurs de la palette v2 la plus proche. -->
            <div class="noc-tune tune-v2">{@render vuesTune()}</div>
          {/if}
        {/key}
      </main>
    </div>
    <BarreLectureNocturne {fileOuverte} basculerFile={() => (fileOuverte = !fileOuverte)} />
  </div>

  <PanneauFileNocturne ouvert={fileOuverte} fermer={() => (fileOuverte = false)} />
  {#if !vuesTune}
    <ToastContainer />
    <DialogContainer />
  {/if}
</div>

<style>
  .nocturne {
    position: fixed;
    inset: 0;
    z-index: 1;
    overflow: hidden;
    background: var(--noc-fond);
    color: var(--noc-texte);
    font-family: var(--noc-police);
    font-size: var(--noc-taille-texte);
    font-feature-settings: 'cv11', 'ss01';
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color-scheme: dark;
  }
  .nocturne[data-theme='clair'] { color-scheme: light; }
  .nocturne :global(button),
  .nocturne :global(input),
  .nocturne :global(select) { font-family: inherit; }
  .nocturne :global(:focus-visible) { outline-color: var(--noc-focus); }
  .noc-cadre {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: var(--noc-hauteur-entete) minmax(0, 1fr) var(--noc-hauteur-barre);
  }
  .noc-cadre.decale { left: var(--noc-largeur-tiroir); }
  .noc-milieu {
    position: relative;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .noc-milieu.avec-biblio { grid-template-columns: var(--noc-largeur-biblio) minmax(0, 1fr); }
  .noc-contenu {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 var(--noc-marge-page);
    scrollbar-color: var(--noc-surface-3) transparent;
  }
  .noc-contenu-tune { padding: 0; overflow: hidden; display: flex; }
  .noc-tune {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .noc-biblio-deplier {
    position: absolute;
    top: 10px;
    left: 8px;
    z-index: 2;
    width: 26px;
    height: 26px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-texte);
    cursor: pointer;
  }
  .noc-milieu:has(.noc-biblio-deplier) .noc-contenu { padding-left: calc(var(--noc-marge-page) + 26px); }
</style>
