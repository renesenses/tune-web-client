<script lang="ts">
  /** Le portrait rond d'un artiste ; à défaut, ses initiales en serif. */
  import { artworkUrl } from '../../lib/api';
  import { initiales } from '../../lib/interfaceSalon';

  let { nom, image = null, taille = 0 }: { nom: string; image?: string | null; taille?: number } = $props();
  let echec = $state(false);
  const src = $derived(image && !echec ? artworkUrl(image, 400) : '');
</script>

<span class="rond" class:vide={!src} style={taille ? `width:${taille}px;height:${taille}px` : ''}>
  {#if src}
    <img {src} alt={nom} loading="lazy" onerror={() => (echec = true)} />
  {:else}
    <span class="init" aria-hidden="true">{initiales(nom)}</span>
  {/if}
</span>

<style>
  .rond {
    display: grid; place-items: center; width: 100%; aspect-ratio: 1; border-radius: 50%;
    overflow: hidden; background: var(--s-tuile); container-type: inline-size;
  }
  .rond.vide { background: var(--s-rond-vide); }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .init { font-family: var(--s-police-titre); font-size: var(--s-t-initiales); color: var(--s-txt); line-height: 1; }
</style>
