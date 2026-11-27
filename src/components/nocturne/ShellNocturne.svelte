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
  import '../../styles/nocturne/jetons-nocturne.css';
  // Itération 5 : la couche commune qui habille TOUTE l'app (écrans de Tune,
  // dialogues, menus, connexion) quand Nocturne est actif.
  import '../../styles/nocturne/ecrans-tune.css';
  import { themeNocturne, choisirThemeNocturne } from '../../lib/themeNocturne';
  import { poserInterfaceSurRacine } from '../../lib/interfaceSalon';
  import { locale, t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { applyV2Theme } from '../../lib/v2Theme';
  import { activeView, pendingLibraryAlbum, pendingLibraryArtist, type View } from '../../lib/stores/navigation';
  import { ongletCourant } from '../../lib/historiqueCoquille';
  import { bootstrapV2, suivreLaBibliotheque } from '../../lib/v2Bootstrap';
  import { demarrerTransportV2 } from '../../lib/v2Live';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
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

  const CLE_EPINGLE = 'tune-nocturne-tiroir-epingle';
  const CLE_BIBLIO = 'tune-nocturne-biblio-repliee';
  function lire(cle: string): string | null {
    try { return localStorage.getItem(cle); } catch { return null; }
  }
  function ecrire(cle: string, v: string) {
    try { localStorage.setItem(cle, v); } catch { /* stockage indisponible : réglage de session */ }
  }

  // Le thème vit dans un magasin partagé : ShellV2 le pose sur <html>.
  const theme = $derived<Theme>($themeNocturne);
  /** Téléphone (≤ 600 px) : le tiroir n'est jamais épinglé, il couvrirait l'écran. */
  const REQUETE_ETROIT = '(max-width: 600px)';
  function estEtroit(): boolean {
    try { return window.matchMedia(REQUETE_ETROIT).matches; } catch { return false; }
  }
  let etroit = $state(estEtroit());
  $effect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(REQUETE_ETROIT); } catch { return; }
    etroit = mq.matches;
    const suivre = (e: MediaQueryListEvent) => { etroit = e.matches; };
    mq.addEventListener?.('change', suivre);
    return () => mq.removeEventListener?.('change', suivre);
  });
  let tiroirOuvert = $state(false);
  let tiroirEpingle = $state(false);
  let fileOuverte = $state(false);
  let biblioRepliee = $state(false);
  const epingleEffectif = $derived(tiroirEpingle && !etroit);

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
    if (themeInitial) choisirThemeNocturne(themeInitial, false);
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
  // Mode autonome (démonstration) : personne d'autre ne pose l'interface sur <html>.
  $effect(() => {
    if (vuesTune) return;
    poserInterfaceSurRacine('nocturne', theme);
    return () => poserInterfaceSurRacine(null, null);
  });

  function basculerTheme() {
    choisirThemeNocturne(theme === 'sombre' ? 'clair' : 'sombre');
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
  <TiroirNocturne ouvert={tiroirOuvert} epingle={epingleEffectif} {theme} {integree}
    fermer={() => (tiroirOuvert = false)} {basculerEpingle} {basculerTheme} />

  <div class="noc-cadre" class:decale={epingleEffectif}>
    <EnteteNocturne ouvrirTiroir={() => (tiroirOuvert = true)} tiroirEpingle={epingleEffectif} />
    <div class="noc-milieu" class:avec-biblio={avecBiblio && !biblioRepliee} class:carte-tune={$ecranNocturne.nom === 'tune' && !(avecBiblio && !biblioRepliee)}>
      {#if avecBiblio}
        {#if !biblioRepliee}<BarreBibliothequeNocturne {integree} />{/if}
        <!-- Posé HORS de la colonne, contre son bord droit, en haut de la carte. -->
        <button type="button" class="noc-biblio-bascule" class:repliee={biblioRepliee} onclick={basculerBiblio}
          aria-expanded={!biblioRepliee}
          aria-label={biblioRepliee ? $t('v2.nav.expandAria') : $t('v2.nav.collapseAria')}
          title={biblioRepliee ? $t('v2.nav.expandAria') : $t('v2.nav.collapseAria')}>
          {#if biblioRepliee}<ChevronRight size={15} />{:else}<ChevronLeft size={15} />{/if}
        </button>
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
            <div class="noc-tune tune-v2" data-vue={$activeView}>{@render vuesTune()}</div>
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
  /* L'en-tête est TRANSPARENT et posé sur le contenu : les pochettes défilent
     sous ses boutons (disques de verre). Le contenu réserve sa hauteur en
     marge intérieure haute. */
  .noc-cadre {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) var(--noc-hauteur-barre);
  }
  .noc-cadre.decale { left: var(--noc-largeur-tiroir); }
  .noc-milieu {
    position: relative;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  /* Bibliothèque : une CARTE arrondie, plus claire que la page, posée sous
     l'en-tête et retirée des bords ; la colonne y est à gauche. */
  .noc-milieu.avec-biblio {
    grid-template-columns: var(--noc-largeur-biblio) minmax(0, 1fr);
    margin: calc(var(--noc-hauteur-entete) + var(--noc-ecart-entete-carte)) var(--noc-marge-carte) 0;
    border: 1px solid var(--noc-bord-carte);
    border-bottom: 0;
    border-radius: var(--noc-rayon-grand) var(--noc-rayon-grand) 0 0;
    background: var(--noc-surface);
    overflow: hidden;
  }
  .noc-milieu.avec-biblio .noc-contenu { padding-top: 0; }
  .noc-milieu.carte-tune { margin-top: var(--noc-hauteur-entete); }
  .noc-contenu {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--noc-hauteur-entete) var(--noc-marge-page) 0;
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
  /* Bouton qui replie la colonne : à l'EXTÉRIEUR de la colonne, collé à son
     bord droit et au haut de la carte (relevé sur la référence). */
  .noc-biblio-bascule {
    position: absolute;
    top: var(--noc-retrait-repli);
    left: calc(var(--noc-largeur-biblio) + var(--noc-retrait-repli));
    z-index: 2;
    width: var(--noc-bouton-repli);
    height: var(--noc-bouton-repli);
    display: grid;
    place-items: center;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-biblio-bascule:hover { color: var(--noc-texte); background: var(--noc-surface-2); }
  /* Colonne repliée : plus de carte ; le bouton reste au même endroit de l'écran
     (sous l'en-tête, à la marge de la carte) et le contenu lui laisse la place. */
  .noc-biblio-bascule.repliee {
    top: calc(var(--noc-hauteur-entete) + var(--noc-ecart-entete-carte) + var(--noc-retrait-repli));
    left: var(--noc-marge-page);
    background: var(--noc-surface);
  }
  .noc-milieu:has(.noc-biblio-bascule.repliee) .noc-contenu {
    padding-left: calc(var(--noc-marge-page) + var(--noc-bouton-repli) + var(--noc-ecart-tuiles));
  }
</style>
