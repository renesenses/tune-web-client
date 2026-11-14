<script lang="ts">
  /**
   * Le champ de recherche d'une station — LE MÊME sur « Mes radios » et sur
   * « Annuaire », au même endroit (rapport de Rémi, RC7, #2397).
   *
   * Recette rc12 (13/11) : c'est désormais le champ partagé de tous les écrans
   * (`ChampRecherche` : croix, Échap, « Rechercher dans … »).
   */
  import { t } from '../../lib/i18n';
  import ChampRecherche from './ChampRecherche.svelte';
  let { valeur = $bindable('') }: { valeur?: string } = $props();
</script>

<ChampRecherche bind:valeur ecran={$t('v2.nav.radios' as any)} />
