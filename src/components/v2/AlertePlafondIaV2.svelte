<script lang="ts">
  /**
   * Assistant IA, étape 3 : l'alerte à 80 % du plafond mensuel.
   *
   * Le serveur joint `plafond` à chaque réponse d'un usage (et l'écrit dans
   * les réglages) ; cet encart ne parle que tant que le plafond n'est pas
   * atteint — au-delà, c'est le refus `plafond_atteint` qui le dit.
   */
  import { t } from '../../lib/i18n';
  import { alerteAAfficher, texteAlerte, type EtatPlafondIa } from '../../lib/assistantIa';

  let { plafond }: { plafond: EtatPlafondIa | null | undefined } = $props();
</script>

{#if plafond && alerteAAfficher(plafond)}
  <p class="alerte" role="status" data-ia-alerte-plafond>
    {texteAlerte($t('assistantIa.capAlert' as any), plafond)}
  </p>
{/if}

<style>
  .alerte {
    margin: 0; font-size: 12.5px; line-height: 1.45;
    color: var(--v2-warn, var(--v2-danger));
  }
</style>
