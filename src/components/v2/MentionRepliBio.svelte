<script lang="ts">
  /**
   * « Biographie disponible seulement en français » — la mention discrète sous
   * un texte servi en repli (renesenses/tune-server-rust#8010). Règles dans
   * `lib/library/langueBio.ts`. Sans repli, rien.
   */
  import { t, locale } from '../../lib/i18n';
  import { nomLangue } from '../../lib/library/langueBio';

  interface Props {
    /** `langue_disponible` du repli, ou null. */
    repliVers?: string | null;
    /** `notes` pour la notice d'un album, sinon la biographie d'un artiste. */
    genre?: 'bio' | 'notes';
  }
  let { repliVers = null, genre = 'bio' }: Props = $props();

  const texte = $derived(
    repliVers
      ? $t(genre === 'notes' ? 'v2.bioRepli.notes' : 'v2.bioRepli.bio').replace('{langue}', nomLangue(repliVers, $locale))
      : null,
  );
</script>

{#if texte}
  <p class="bio-repli" data-bio-repli>{texte}</p>
{/if}

<style>
  .bio-repli { margin: 6px 0 0; font-size: calc(12px * var(--v2-txt-echelle, 1)); line-height: 1.5; color: var(--v2-txt3); font-style: italic; }
</style>
