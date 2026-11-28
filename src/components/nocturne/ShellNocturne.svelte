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
  import GenresNocturne from './GenresNocturne.svelte';
  import FichiersLocauxNocturne from './FichiersLocauxNocturne.svelte';
  import AlbumNocturne from './AlbumNocturne.svelte';
  import ArtisteNocturne from './ArtisteNocturne.svelte';
  import LectureNocturne from './LectureNocturne.svelte';
  import { ecranNocturne, ecranDeFond, estEnPanneau, fermerPanneau, reinitialiser, allerA, type EcranNocturne } from './navigationNocturne';
  import PanneauRechercheNocturne from './PanneauRechercheNocturne.svelte';
  import { LIBELLE_COLLECTION } from './triNocturne';
  import { liaison, suivreLiaison, reessayerLiaison } from './liaisonNocturne';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import X from '@lucide/svelte/icons/x';

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
    // Itération 9 : au téléphone, la colonne Bibliothèque part repliée tant
    // qu'on ne l'a pas ouverte soi-même (elle prenait la moitié de l'écran).
    const memoire = lire(CLE_BIBLIO);
    biblioRepliee = biblioInitiale ?? (memoire == null ? estEtroit() : memoire === '1');
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

  /* Itération 6 — bandeau de reconnexion, en haut au centre, quand la liaison
     tombe ; il se retire seul à la reprise, ou à la croix jusqu'à la suivante. */
  $effect(() => suivreLiaison());
  let bandeauLiaisonFerme = $state(false);
  $effect(() => { if ($liaison === 'reliee') bandeauLiaisonFerme = false; });
  const bandeauLiaison = $derived($liaison === 'coupee' && !bandeauLiaisonFerme);

  function basculerTheme() {
    choisirThemeNocturne(theme === 'sombre' ? 'clair' : 'sombre');
  }
  function basculerEpingle() {
    tiroirEpingle = !tiroirEpingle;
    ecrire(CLE_EPINGLE, tiroirEpingle ? '1' : '0');
    if (!tiroirEpingle) tiroirOuvert = false;
  }
  /* Itération 10 — au téléphone, la colonne Bibliothèque dépliée est un
     PANNEAU superposé (le contenu garde toute sa largeur) qui se referme dès
     qu'on choisit une entrée ; ce repli n'est pas retenu comme préférence. */
  let ecranPrecedent = '';
  $effect(() => {
    const cle = JSON.stringify($ecranNocturne);
    if (ecranPrecedent && cle !== ecranPrecedent && etroit && !biblioRepliee) biblioRepliee = true;
    ecranPrecedent = cle;
  });

  function basculerBiblio() {
    biblioRepliee = !biblioRepliee;
    ecrire(CLE_BIBLIO, biblioRepliee ? '1' : '0');
  }

  /** Les écrans qui portent la colonne Bibliothèque. */
  const VUES_BIBLIO = new Set(['library', 'playlists', 'tags', 'statsbibliotheque', 'metadata', 'browse']);
  const avecBiblio = $derived.by(() => {
    const e = $ecranDeFond;
    if (e.nom === 'albums' || e.nom === 'artistes' || e.nom === 'collection' || e.nom === 'genres' || e.nom === 'genre') return true;
    return e.nom === 'tune' && VUES_BIBLIO.has(e.vue);
  });

  /* Itération 6 — Réglages en panneau latéral droit (l'écran courant reste
     dessiné derrière), Recherche en panneau propre à Nocturne. */
  const panneau = $derived(estEnPanneau($ecranNocturne));
  let rechercheOuverte = $state(false);
  function clavierPanneau(e: KeyboardEvent) {
    if (e.key === 'Escape' && panneau) fermerPanneau();
  }
</script>

<svelte:window onkeydown={clavierPanneau} />

<div class="nocturne" data-theme={theme}>
  <TiroirNocturne ouvert={tiroirOuvert} epingle={epingleEffectif} {theme} {integree}
    fermer={() => (tiroirOuvert = false)} {basculerEpingle} {basculerTheme} />

  <div class="noc-cadre" class:decale={epingleEffectif}>
    <EnteteNocturne ouvrirTiroir={() => (tiroirOuvert = true)} tiroirEpingle={epingleEffectif} ouvrirRecherche={() => (rechercheOuverte = true)} />
    <div class="noc-milieu" class:avec-biblio={avecBiblio && !biblioRepliee} class:carte-tune={$ecranDeFond.nom === 'tune' && !(avecBiblio && !biblioRepliee)}>
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
      <main class="noc-contenu" class:noc-contenu-tune={$ecranDeFond.nom === 'tune'}>
        {#key JSON.stringify($ecranDeFond)}
          {#if $ecranDeFond.nom === 'accueil'}
            <AccueilNocturne />
          {:else if $ecranDeFond.nom === 'albums'}
            <AlbumsNocturne />
          {:else if $ecranDeFond.nom === 'collection'}
            <AlbumsNocturne cle={$ecranDeFond.cle} titre={$t(LIBELLE_COLLECTION[$ecranDeFond.cle])} />
          {:else if $ecranDeFond.nom === 'fichiers'}
            <FichiersLocauxNocturne onglet={$ecranDeFond.onglet ?? 'entretien'} />
          {:else if $ecranDeFond.nom === 'genres'}
            <GenresNocturne />
          {:else if $ecranDeFond.nom === 'genre'}
            <AlbumsNocturne genre={$ecranDeFond.genre} titre={$ecranDeFond.genre} />
          {:else if $ecranDeFond.nom === 'artistes'}
            <ArtistesNocturne />
          {:else if $ecranDeFond.nom === 'album'}
            <AlbumNocturne id={$ecranDeFond.id} />
          {:else if $ecranDeFond.nom === 'artiste'}
            <ArtisteNocturne id={$ecranDeFond.id} />
          {:else if $ecranDeFond.nom === 'lecture'}
            <LectureNocturne />
          {:else if $ecranDeFond.nom === 'tune' && vuesTune}
            <!-- Un écran de Tune, tel quel, aux couleurs de la palette v2 la plus proche. -->
            <div class="noc-tune tune-v2" data-vue={$activeView}>{@render vuesTune()}</div>
          {/if}
        {/key}
      </main>
    </div>
    <BarreLectureNocturne {fileOuverte} basculerFile={() => (fileOuverte = !fileOuverte)} />
  </div>

  {#if panneau && vuesTune}
    <!-- Réglages : panneau latéral droit, l'écran courant reste derrière. -->
    <div class="noc-panneau-voile" onclick={fermerPanneau} aria-hidden="true"></div>
    <aside class="noc-panneau" aria-label={$t('v2.nav.settings')} data-panneau-reglages>
      <header class="noc-panneau-tete">
        <button type="button" class="noc-panneau-retour" onclick={fermerPanneau} aria-label={$t('common.close')} title={$t('common.close')}>
          <ChevronLeft size={18} />
        </button>
        <span class="noc-panneau-titre">{$t('v2.nav.settings')}</span>
      </header>
      <div class="noc-panneau-corps noc-tune tune-v2" data-vue={$activeView}>{@render vuesTune()}</div>
    </aside>
  {/if}

  <PanneauRechercheNocturne ouvert={rechercheOuverte} fermer={() => (rechercheOuverte = false)} />

  {#if bandeauLiaison}
    <div class="noc-liaison" role="status" aria-live="polite" data-bandeau-liaison>
      <span class="noc-liaison-roue" aria-hidden="true"><LoaderCircle size={15} /></span>
      <span>{$t('nocturne.connexion.reconnexion' as any)}</span>
      <button type="button" class="noc-liaison-action" onclick={reessayerLiaison}>{$t('nocturne.connexion.reessayer' as any)}</button>
      <button type="button" class="noc-liaison-fermer" onclick={() => (bandeauLiaisonFerme = true)} aria-label={$t('common.close')} title={$t('common.close')}><X size={14} /></button>
    </div>
  {/if}

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
  .noc-panneau-voile {
    position: fixed;
    inset: 0 0 var(--noc-hauteur-barre);
    z-index: 40;
    background: var(--noc-voile);
    backdrop-filter: blur(var(--noc-flou-voile));
    -webkit-backdrop-filter: blur(var(--noc-flou-voile));
  }
  .noc-panneau {
    position: fixed;
    top: 0;
    right: 0;
    bottom: var(--noc-hauteur-barre);
    z-index: 41;
    width: min(var(--noc-largeur-reglages), 100vw);
    display: flex;
    flex-direction: column;
    background: var(--noc-fond);
    border-left: 1px solid var(--noc-ligne);
    box-shadow: var(--noc-panneau-ombre);
  }
  .noc-panneau-tete {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--noc-hauteur-entete);
    padding: 0 var(--noc-marge-page) 0 12px;
    border-bottom: 1px solid var(--noc-ligne);
  }
  .noc-panneau-retour {
    width: var(--noc-bouton-fermer-file);
    height: var(--noc-bouton-fermer-file);
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte);
    cursor: pointer;
  }
  .noc-panneau-retour:hover { background: var(--noc-surface-2); }
  .noc-panneau-titre { font-size: var(--noc-taille-titre-file); font-weight: var(--noc-graisse-titre); letter-spacing: var(--noc-interlettre-titre); }
  .noc-panneau-corps { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
  /* Le panneau porte déjà le titre : celui de l'écran s'efface, et sa
     recherche des réglages prend toute la largeur. */
  .noc-panneau-corps :global(.v2-top > .v2-titres) { display: none; }
  .noc-panneau-corps :global(.v2-top) { padding-top: 14px; }
  .noc-panneau-corps :global(.v2-top > :not(.v2-titres)) { flex: 1 1 100%; max-width: none; }
  .noc-liaison {
    position: fixed;
    top: calc(var(--noc-hauteur-entete) + var(--noc-ecart-bandeau));
    left: 50%;
    z-index: 60;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 2 * var(--noc-marge-page));
    padding: 8px 8px 8px 14px;
    border: 1px solid var(--noc-ligne);
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-surface-2);
    box-shadow: var(--noc-carte-ombre);
    color: var(--noc-texte);
    font-size: var(--noc-taille-petit);
    white-space: nowrap;
  }
  .noc-liaison-roue { display: inline-flex; color: var(--noc-ambre); animation: noc-tourne 1s linear infinite; }
  @keyframes noc-tourne { to { transform: rotate(360deg); } }
  .noc-liaison-action {
    padding: 4px 12px;
    border: 1px solid var(--noc-ambre);
    border-radius: var(--noc-rayon-pilule);
    background: transparent;
    color: var(--noc-ambre);
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-liaison-fermer {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) { .noc-liaison-roue { animation: none; } }
  .nocturne :global(button),
  .nocturne :global(input),
  .nocturne :global(select) { font-family: inherit; }
  /* Itération 12 : un anneau de focus explicite partout (clavier). */
  .nocturne :global(:focus-visible) { outline: 2px solid var(--noc-focus); outline-offset: 2px; }
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
  @media (max-width: 600px) {
    .noc-milieu.avec-biblio { grid-template-columns: minmax(0, 1fr); }
    .noc-milieu.avec-biblio > :global(.noc-biblio) {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 4;
      width: min(var(--noc-largeur-biblio-panneau), 86vw);
      background: var(--noc-surface);
      border-right: 1px solid var(--noc-ligne);
      box-shadow: var(--noc-panneau-ombre);
    }
    .noc-milieu.avec-biblio .noc-contenu { grid-column: 1; }
    .noc-milieu.avec-biblio .noc-biblio-bascule:not(.repliee) { left: calc(min(var(--noc-largeur-biblio-panneau), 86vw) + var(--noc-retrait-repli)); z-index: 5; background: var(--noc-surface); }
  }
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
  /* Itération 9 — téléphone : le bouton de la colonne repliée se pose AU-DESSUS
     du contenu ; la marge gauche réservée lui prenait plus de 100 px. */
  @media (max-width: 600px) {
    .noc-milieu:has(.noc-biblio-bascule.repliee) .noc-contenu {
      padding-left: var(--noc-marge-page);
      padding-top: calc(var(--noc-hauteur-entete) + var(--noc-bouton-repli) + var(--noc-ecart-entete-carte));
    }
  }
</style>
