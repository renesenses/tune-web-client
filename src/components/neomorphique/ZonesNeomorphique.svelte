<script lang="ts">
  /**
   * Le sélecteur de zone du thème « Néomorphique » : une rangée de touches,
   * la zone courante enfoncée (creux + couleur d'état + `aria-checked`).
   * Le geste est celui de l'interface actuelle : `switchZone`.
   */
  import { t } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { zones, currentZone, switchZone } from '../../lib/stores/zones';
  // Itération 2 : les icônes de zone de Rémi (`src/assets/zone-icons/`).
  import IconeZone from '../partages/IconeZone.svelte';

  let { onChoix }: { onChoix?: () => void } = $props();

  function choisir(id: number | null | undefined) {
    if (id == null) return;
    void switchZone(id);
    onChoix?.();
  }
</script>

<div class="touches" role="radiogroup" aria-label={$t('roonLike.zones.choisir' as any)}>
  {#each $zones as z (z.id)}
    {@const courante = z.id === $currentZone?.id}
    <button type="button" class="neo-touche" role="radio" aria-checked={courante} onclick={() => choisir(z.id)}>
      {#if z.state === 'playing'}<span class="joue" aria-label={$t('roonLike.zones.enLecture' as any)}></span>{/if}
      <IconeZone zone={z} taille={18} />
      <span class="nom" use:bulleTexte>{z.name}</span>
    </button>
  {:else}
    <p class="vide">{$t('roonLike.zones.aucune' as any)}</p>
  {/each}
</div>

<style>
  .touches { display: flex; flex-wrap: wrap; gap: 12px; }
  .nom { max-width: 16ch; overflow: hidden; text-overflow: ellipsis; }
  /* Une zone qui joue : une diode verte, en plus de son nom. */
  .joue { width: 7px; height: 7px; border-radius: 50%; background: var(--neo-vu); flex: none; }
  .vide { margin: 0; color: var(--neo-doux); font-size: var(--neo-t-format); }
</style>
