<script lang="ts">
  /**
   * tune-server-rust#4969 — une barre par canal en lecture multicanale.
   *
   * 🔴 Affichage seulement : ce composant LIT `audio_levels` et le dessine.
   * Des éléments HTML plutôt qu'une toile : les couleurs suivent les jetons
   * du thème (clair comme sombre) sans rien relire à la main.
   */
  import { t } from '../../lib/i18n';
  import type { BarreDeCanal } from '../../lib/barresParCanal';

  interface Props {
    barres: BarreDeCanal[];
    /** Les barres décrivent les voies de SORTIE (le serveur l'a dit). */
    sortie?: boolean;
  }

  let { barres, sortie = false }: Props = $props();
</script>

<div
  class="barres-canaux"
  role="group"
  aria-label={sortie ? $t('player.channelLevelsOutput') : $t('player.channelLevels')}
  data-testid="barres-par-canal"
>
  {#each barres as b, i (i)}
    <div
      class="canal"
      class:muet={b.muet}
      class:over={b.over}
      data-canal={b.nom}
      title={b.cle ? $t(b.cle) : b.nom}
      aria-label={b.cle ? $t(b.cle) : b.nom}
    >
      <div class="piste">
        <div class="niveau" style="height: {(b.hauteur * 100).toFixed(1)}%"></div>
        {#if !b.muet}
          <div class="crete" style="bottom: {(b.crete * 100).toFixed(1)}%"></div>
        {/if}
      </div>
      <span class="nom">{b.nom}</span>
    </div>
  {/each}
</div>

<style>
  .barres-canaux {
    display: flex;
    gap: 6px;
    width: 100%;
    height: 100%;
    align-items: stretch;
    justify-content: center;
  }

  .canal {
    flex: 1 1 0;
    max-width: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }

  .piste {
    position: relative;
    flex: 1;
    width: 100%;
    background: var(--tune-surface-hover, rgba(127, 127, 127, 0.12));
    border-radius: 2px;
    overflow: hidden;
  }

  .niveau {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--tune-accent, #6b6ed9);
    transition: height 80ms linear;
  }

  .crete {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--tune-text, currentColor);
  }

  .canal.over .niveau {
    background: var(--tune-error, #e5484d);
  }

  .nom {
    font-size: 10px;
    line-height: 14px;
    color: var(--tune-text-muted, inherit);
    white-space: nowrap;
  }

  .canal.muet .nom {
    opacity: 0.45;
    text-decoration: line-through;
  }
</style>
