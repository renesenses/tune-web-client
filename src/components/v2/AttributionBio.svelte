<script lang="ts">
  /**
   * La ligne d'attribution sous une biographie — source, article, licence.
   * Voir `lib/library/attributionBio.ts` pour les règles (CC BY-SA 4.0 des
   * extraits Wikipédia, site-mozaiklabs#278). Sans provenance, rien.
   */
  import { t } from '../../lib/i18n';
  import { attributionBio, type BioProvenance } from '../../lib/library/attributionBio';

  interface Props {
    provenance?: BioProvenance | null;
  }
  let { provenance = null }: Props = $props();

  const a = $derived(attributionBio(provenance));
</script>

{#if a}
  <p class="bio-attrib">
    <span>{$t('v2.bioAttr.source' as any)}</span>
    <span>{a.cleSource ? $t(a.cleSource as any) : a.nomSource}</span>
    {#if a.urlArticle}
      <span aria-hidden="true">—</span>
      <a href={a.urlArticle} target="_blank" rel="noopener noreferrer">{a.titreArticle ?? $t('v2.bioAttr.article' as any)}</a>
    {/if}
    {#if a.licence}
      <span aria-hidden="true">—</span>
      <span>{$t('v2.bioAttr.license' as any)}</span>
      {#if a.urlLicence}
        <a href={a.urlLicence} target="_blank" rel="noopener noreferrer">{a.licence}</a>
      {:else}
        <span>{a.licence}</span>
      {/if}
    {/if}
  </p>
{/if}

<style>
  .bio-attrib {
    margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--v2-txt3);
    display: flex; flex-wrap: wrap; gap: 0 .35em;
  }
  .bio-attrib a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .bio-attrib a:hover { color: var(--v2-txt2); }
</style>
