<script lang="ts">
  /**
   * « (128) » à côté d'un titre, d'un album ou d'un artiste (#2298) : les
   * écoutes de la communauté Tune. Ne rend RIEN quand le serveur n'a pas
   * envoyé `community_listens` (sous le seuil, inconnu, serveur non relié).
   */
  import { t, locale } from '../../lib/i18n';
  import { ecoutesDe, texteEcoutes, type PorteEcoutes } from '../../lib/ecoutesCommunaute';

  interface Props {
    objet: PorteEcoutes | null | undefined;
  }
  let { objet }: Props = $props();
  const n = $derived(ecoutesDe(objet));
</script>

{#if n != null}
  <span class="ecoutes-communaute" data-ecoutes-communaute
    title={$t('library.communityListensTip' as any)}>{texteEcoutes(n, $locale)}</span>
{/if}

<style>
  .ecoutes-communaute{margin-left:.35em; white-space:nowrap; font-variant-numeric:tabular-nums; opacity:.7}
</style>
