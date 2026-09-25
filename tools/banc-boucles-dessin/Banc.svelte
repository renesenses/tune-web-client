<script lang="ts">
  /**
   * Banc de mesure #1256 — attribution du coût entre les QUATRE boucles de
   * dessin de « Lecture en cours ».
   *
   * Le banc monte les composants RÉELS, avec les props RÉELLES des deux sites
   * de montage, et une seule boucle à la fois. Rien n'est réécrit ici : ce qui
   * est mesuré est le code livré.
   */
  import CreteMetre from '../../src/components/partages/CreteMetre.svelte';
  import AudioVisualizer from '../../src/components/partages/AudioVisualizer.svelte';

  interface Props {
    /** Quelle boucle monter. `aucune` = page nue, pour le plancher. */
    quoi: 'aucune' | 'np-crete' | 'np-spectre' | 'np-onde' | 'tb-crete' | 'tb-spectre'
        | 'barre-seule' | 'les-quatre';
    /** Le fond plein écran flouté de « Lecture en cours » est-il posé ? */
    fond: boolean;
    joue: boolean;
  }

  let { quoi, fond, joue }: Props = $props();

  const npCrete = $derived(quoi === 'np-crete' || quoi === 'les-quatre');
  const npSpectre = $derived(quoi === 'np-spectre' || quoi === 'les-quatre');
  const npOnde = $derived(quoi === 'np-onde');
  // `barre-seule` = ce qui tourne sur l'ACCUEIL : la barre de transport seule,
  // ses deux boucles. C'est le terme de comparaison du testeur — « lower values
  // when I'm on eg. Home » — et sans lui on mesure un coût sans son référent.
  const tbCrete = $derived(quoi === 'tb-crete' || quoi === 'barre-seule' || quoi === 'les-quatre');
  const tbSpectre = $derived(quoi === 'tb-spectre' || quoi === 'barre-seule' || quoi === 'les-quatre');
</script>

{#if fond}
  <!-- NowPlaying.svelte:1615 + :2627-2632 — mêmes valeurs que l'écran réel. -->
  <div class="bg-blur"></div>
{/if}

<div class="np">
  {#if npCrete}
    <!-- NowPlaying.svelte:1685 : style = STYLE_CRETE_DEFAUT ('dat'), hauteur 26 -->
    <div class="np-crete"><CreteMetre style="dat" hauteur={26} {joue} /></div>
  {/if}
  {#if npSpectre}
    <!-- NowPlaying.svelte:2144-2151 : height 80, pleine largeur, spectre -->
    <div class="np-viz">
      <AudioVisualizer
        playing={joue}
        mode="spectrum"
        height={80}
        sampleRate={96000}
        bitDepth={24}
        format="FLAC"
      />
    </div>
  {/if}
  {#if npOnde}
    <div class="np-viz">
      <AudioVisualizer
        playing={joue}
        mode="waveform"
        height={80}
        sampleRate={96000}
        bitDepth={24}
        format="FLAC"
      />
    </div>
  {/if}
</div>

<div class="tb">
  {#if tbCrete}
    <!-- TransportBar.svelte:884 : style 'lamps', hauteur 22, largeur 56 -->
    <div class="tb-crete"><CreteMetre style="lamps" hauteur={22} largeur={56} {joue} /></div>
  {/if}
  {#if tbSpectre}
    <!-- TransportBar.svelte:888-896 : height 24, mini, spectre -->
    <div class="tb-mini-viz">
      <AudioVisualizer
        playing={joue}
        mode="spectrum"
        height={24}
        mini
        sampleRate={96000}
        bitDepth={24}
        format="FLAC"
      />
    </div>
  {/if}
</div>

<style>
  .bg-blur {
    position: absolute;
    inset: 0;
    background-image: url('./pochette.png');
    background-size: cover;
    background-position: center;
    filter: blur(60px) brightness(0.12);
    z-index: 0;
  }
  .np { position: relative; z-index: 1; width: 1200px; padding: 24px; }
  .np-crete { width: 420px; }
  .np-viz { width: 1152px; height: 80px; }
  .tb { position: relative; z-index: 1; width: 1200px; padding: 8px 24px; display: flex; gap: 16px; align-items: center; }
  .tb-crete { width: 56px; }
  .tb-mini-viz { width: 180px; height: 24px; }
</style>
