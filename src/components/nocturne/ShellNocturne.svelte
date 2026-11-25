<script lang="ts">
  /**
   * ═════════════════════════════════════════════════════════════════════
   *  NOCTURNE — point d'entrée UNIQUE de l'interface (itération 1)
   * ═════════════════════════════════════════════════════════════════════
   *
   * Coquille : tiroir de navigation, en-tête, contenu routé, barre de
   * lecture, panneau de file d'attente. Tout le reste de Nocturne est dans
   * `src/components/nocturne/` ; ses jetons dans
   * `src/styles/nocturne/jetons-nocturne.css`.
   *
   * Données : les MÊMES magasins et la même API que la coquille v2
   * (`bootstrapV2`, `suivreLaBibliotheque`, `demarrerTransportV2`) — Nocturne
   * est une autre façon de montrer Tune, pas un autre client.
   *
   * Brancher Nocturne au sélecteur d'interfaces : voir le commentaire en tête
   * de `demo/main-nocturne.ts` et le rapport de la PR.
   */
  import '../../styles/nocturne/polices-nocturne.css';
  import '../../styles/nocturne/jetons-nocturne.css';
  import { locale } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { bootstrapV2, suivreLaBibliotheque } from '../../lib/v2Bootstrap';
  import { demarrerTransportV2 } from '../../lib/v2Live';
  import ToastContainer from '../partages/ToastContainer.svelte';
  import DialogContainer from '../partages/DialogContainer.svelte';
  import TiroirNocturne from './TiroirNocturne.svelte';
  import EnteteNocturne from './EnteteNocturne.svelte';
  import BarreLectureNocturne from './BarreLectureNocturne.svelte';
  import PanneauFileNocturne from './PanneauFileNocturne.svelte';
  import AccueilNocturne from './AccueilNocturne.svelte';
  import AlbumsNocturne from './AlbumsNocturne.svelte';
  import ArtistesNocturne from './ArtistesNocturne.svelte';
  import AlbumNocturne from './AlbumNocturne.svelte';
  import ArtisteNocturne from './ArtisteNocturne.svelte';
  import { ecranNocturne, reinitialiser, type EcranNocturne } from './navigationNocturne';

  type Theme = 'sombre' | 'clair';
  interface Props {
    /** Écran d'ouverture (démonstration, liens profonds). */
    ecranInitial?: EcranNocturne;
    /** Thème imposé ; sinon le dernier choisi sur cet appareil. */
    themeInitial?: Theme | null;
    /** Ouvre le panneau de file au montage (démonstration). */
    fileInitiale?: boolean;
    /** Ouvre le tiroir au montage (démonstration). */
    tiroirInitial?: boolean;
  }
  let { ecranInitial = { nom: 'accueil' }, themeInitial = null, fileInitiale = false, tiroirInitial = false }: Props = $props();

  const CLE_THEME = 'tune-nocturne-theme';
  const CLE_EPINGLE = 'tune-nocturne-tiroir-epingle';
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

  $effect.pre(() => {
    theme = themeInitial ?? (lire(CLE_THEME) === 'clair' ? 'clair' : 'sombre');
    tiroirEpingle = lire(CLE_EPINGLE) === '1';
    tiroirOuvert = tiroirInitial;
    fileOuverte = fileInitiale;
    reinitialiser(ecranInitial);
  });

  // Les mêmes amorces que ShellV2 : sans elles, zones, file et bibliothèque
  // restent vides (voir `lib/v2Bootstrap`).
  $effect(() => { locale.set($preferences.language ?? 'en'); });
  $effect(() => { bootstrapV2(); });
  $effect(() => suivreLaBibliotheque());
  $effect(() => demarrerTransportV2());

  function basculerTheme() {
    theme = theme === 'sombre' ? 'clair' : 'sombre';
    ecrire(CLE_THEME, theme);
  }
  function basculerEpingle() {
    tiroirEpingle = !tiroirEpingle;
    ecrire(CLE_EPINGLE, tiroirEpingle ? '1' : '0');
    if (!tiroirEpingle) tiroirOuvert = false;
  }
</script>

<div class="nocturne" data-theme={theme}>
  <TiroirNocturne ouvert={tiroirOuvert} epingle={tiroirEpingle} {theme}
    fermer={() => (tiroirOuvert = false)} {basculerEpingle} {basculerTheme}
    ouvrirFile={() => (fileOuverte = true)} />

  <div class="noc-cadre" class:decale={tiroirEpingle}>
    <EnteteNocturne ouvrirTiroir={() => (tiroirOuvert = true)} {tiroirEpingle} />
    <main class="noc-contenu">
      {#key $ecranNocturne}
        {#if $ecranNocturne.nom === 'accueil'}
          <AccueilNocturne />
        {:else if $ecranNocturne.nom === 'albums'}
          <AlbumsNocturne />
        {:else if $ecranNocturne.nom === 'artistes'}
          <ArtistesNocturne />
        {:else if $ecranNocturne.nom === 'album'}
          <AlbumNocturne id={$ecranNocturne.id} />
        {:else if $ecranNocturne.nom === 'artiste'}
          <ArtisteNocturne id={$ecranNocturne.id} />
        {/if}
      {/key}
    </main>
    <BarreLectureNocturne {fileOuverte} basculerFile={() => (fileOuverte = !fileOuverte)} />
  </div>

  <PanneauFileNocturne ouvert={fileOuverte} fermer={() => (fileOuverte = false)} />
  <ToastContainer />
  <DialogContainer />
</div>

<style>
  .nocturne {
    position: fixed;
    inset: 0;
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
  .noc-contenu {
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 var(--noc-marge-page);
    scrollbar-color: var(--noc-surface-3) transparent;
  }
</style>
