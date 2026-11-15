<script lang="ts">
  /**
   * Le DESSIN de la barre de progression en forme d'onde (Discussion #8269).
   *
   * Purement décoratif (`aria-hidden`, aucun pointeur) : il se pose DANS le
   * curseur existant (`role="slider"`) de `SeekBar` et de `TransportBar`, qui
   * gardent leurs gestionnaires de clic, de glissé et de clavier et leurs
   * attributs ARIA. Deux calques identiques : l'onde à venir, atténuée, et
   * par-dessus l'onde jouée, en couleur d'accent, découpée à la position.
   */
  import { cheminOnde, nombreDeBarres, reduireOnde, type Onde } from '../../lib/barreOnde';

  interface Props {
    points: Onde;
    /** Progression, en pour cent (0 – 100). */
    progress: number;
  }

  let { points, progress }: Props = $props();

  let largeur = $state(0);
  let barres = $derived(reduireOnde(points, nombreDeBarres(largeur, points.length)));
  let chemin = $derived(cheminOnde(barres));
  let reste = $derived(100 - Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0)));
</script>

<div class="onde" aria-hidden="true" bind:clientWidth={largeur} data-onde-barres={barres.length}>
  <svg class="calque a-venir" viewBox="0 0 {barres.length} 100" preserveAspectRatio="none" focusable="false">
    <path d={chemin} />
  </svg>
  <svg class="calque jouee" viewBox="0 0 {barres.length} 100" preserveAspectRatio="none" focusable="false"
    style="clip-path: inset(0 {reste}% 0 0)">
    <path d={chemin} />
  </svg>
</div>

<style>
  .onde {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .calque {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Partie à venir : le texte secondaire du thème, atténué — lisible sur le
     fond clair comme sur le sombre, sans couleur propre à maintenir. */
  .a-venir path {
    fill: color-mix(in srgb, var(--tune-text-secondary, #888) 45%, transparent);
  }

  .jouee path {
    fill: var(--tune-accent, #7c3aed);
  }

  .jouee {
    transition: clip-path 0.1s linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .jouee {
      transition: none;
    }
  }
</style>
