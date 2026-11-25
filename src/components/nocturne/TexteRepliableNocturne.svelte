<script lang="ts">
  /** Texte de présentation : deux paragraphes de deux lignes, puis « Afficher plus ». */
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { t } from '../../lib/i18n';
  import { paragraphes } from './texteNocturne';

  interface Props { texte: string | null | undefined }
  let { texte }: Props = $props();

  let deplie = $state(false);
  const textes = $derived(paragraphes(texte));
  const long = $derived(textes.length > 2 || textes.join('').length > 420);
</script>

{#if textes.length}
  <div class="noc-texte" class:replie={long && !deplie}>
    {#each textes as p, i (i)}<p>{p}</p>{/each}
    {#if long}
      <button type="button" class="noc-plus" onclick={() => (deplie = !deplie)} aria-expanded={deplie}>
        {deplie ? $t('common.showLess') : $t('common.showMore')}
        <span class="noc-plus-chevron" class:retourne={deplie}><ChevronDown size={14} /></span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .noc-texte p {
    margin: 0 0 10px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-texte);
    line-height: 1.6;
  }
  .noc-texte.replie p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .noc-texte.replie p:nth-of-type(n + 3) { display: none; }
  .noc-plus {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--noc-ambre);
    font: inherit;
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-plus:hover { color: var(--noc-ambre-vif); }
  .noc-plus-chevron { display: inline-flex; transition: transform var(--noc-duree); }
  .noc-plus-chevron.retourne { transform: rotate(180deg); }
</style>
