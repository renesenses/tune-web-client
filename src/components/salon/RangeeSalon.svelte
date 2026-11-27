<script lang="ts">
  /**
   * Une rangée défilante de l'accueil : un titre, des onglets, les flèches et
   * « Plus ». `bandeau` : la variante sur fond bleu (« Dernièrement »).
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import IconeSalon from './IconeSalon.svelte';

  let {
    titre,
    onglets = [],
    ongletActif = null,
    onOnglet = null,
    onPlus = null,
    bandeau = false,
    colonnes = 5,
    children,
  }: {
    titre: string;
    onglets?: { id: string; libelle: string }[];
    ongletActif?: string | null;
    onOnglet?: ((id: string) => void) | null;
    onPlus?: (() => void) | null;
    bandeau?: boolean;
    /** Pochettes visibles à la fois (5 par défaut ; 1 = une « page » par vue). */
    colonnes?: number;
    children: Snippet;
  } = $props();

  let piste = $state<HTMLElement | null>(null);
  let debut = $state(true);
  let fin = $state(false);
  function mesurer() {
    if (!piste) return;
    debut = piste.scrollLeft <= 2;
    fin = piste.scrollLeft + piste.clientWidth >= piste.scrollWidth - 2;
  }
  function defiler(sens: number) {
    piste?.scrollBy({ left: sens * (piste.clientWidth - 40), behavior: 'smooth' });
  }
  $effect(() => {
    if (!piste || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(piste);
    return () => ro.disconnect();
  });
</script>

<section class="rangee" class:bandeau style:--rangee-colonnes={colonnes}>
  <div class="tete">
    <h2>{titre}</h2>
    {#each onglets as o (o.id)}
      <button class="onglet" class:on={o.id === ongletActif} aria-pressed={o.id === ongletActif} onclick={() => onOnglet?.(o.id)}>{o.libelle}</button>
    {/each}
    <span class="espace"></span>
    <button class="fl" onclick={() => defiler(-1)} disabled={debut} aria-label={$t('roonLike.precedents' as any)}><IconeSalon nom="retour" taille={14} trait={2.2} /></button>
    <button class="fl" onclick={() => defiler(1)} disabled={fin} aria-label={$t('roonLike.suivants' as any)}><IconeSalon nom="suivant" taille={14} trait={2.2} /></button>
    {#if onPlus}<button class="plus" onclick={onPlus}>{$t('roonLike.plus' as any)}</button>{/if}
  </div>
  <div class="piste" bind:this={piste} onscroll={mesurer}>
    {@render children()}
  </div>
</section>

<style>
  .rangee { margin: 0 0 40px; }
  .rangee.bandeau { background: var(--s-acc-fort); color: var(--s-bandeau-txt); border-radius: var(--s-r-bandeau); padding: 30px 26px 44px; }
  .tete { display: flex; align-items: center; gap: 32px; margin-bottom: 20px; border-bottom: 1px solid var(--s-line); padding-bottom: 10px; }
  .bandeau .tete { border-bottom-color: var(--s-bandeau-ligne); }
  h2 { margin: 0; font-size: var(--s-t-section); font-weight: 400; }
  .bandeau h2 { font-weight: var(--s-graisse-forte); }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; }
  .onglet { font-size: var(--s-t-texte); letter-spacing: .04em; text-transform: uppercase; padding: 4px 0; position: relative; opacity: .8; }
  .onglet.on { opacity: 1; font-weight: var(--s-graisse-forte); }
  .onglet.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -11px; height: 3px; background: currentColor; }
  .espace { flex: 1; }
  .fl {
    width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
    background: var(--s-tuile); color: var(--s-txt);
  }
  .bandeau .fl { background: var(--s-bandeau-bouton); color: var(--s-bandeau-txt); }
  .fl:disabled { opacity: .4; cursor: default; }
  .tete .fl + .fl { margin-left: -32px; }
  .plus {
    font-size: var(--s-t-mini); letter-spacing: .05em; text-transform: uppercase;
    padding: 8px 14px; border-radius: var(--s-r-pilule); background: var(--s-tuile); color: var(--s-txt);
  }
  .bandeau .plus { background: var(--s-bandeau-bouton); color: var(--s-bandeau-txt); }
  .piste {
    display: grid; grid-auto-flow: column;
    grid-auto-columns: calc((100% - (var(--rangee-colonnes, 5) - 1) * var(--s-ecart-rangee)) / var(--rangee-colonnes, 5));
    gap: var(--s-ecart-rangee); overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none;
  }
  .piste::-webkit-scrollbar { display: none; }
  .piste > :global(*) { scroll-snap-align: start; }
  @media (max-width: 1100px) { .piste { grid-auto-columns: calc((100% - (min(var(--rangee-colonnes, 5), 3) - 1) * var(--s-ecart-rangee)) / min(var(--rangee-colonnes, 5), 3)); } }
  /* Téléphone : l'en-tête tient sur la largeur (le doigt fait défiler, les flèches s'effacent). */
  @media (max-width: 760px) {
    .rangee.bandeau { padding: 22px 16px 28px; }
    .tete { gap: 16px; }
    .fl { display: none; }
    /* Une colonne de plus petite taille : la suivante dépasse, on devine le défilement. */
    .piste { grid-auto-columns: calc((100% - var(--s-ecart-rangee)) / min(var(--rangee-colonnes, 5), 2.3)); }
  }
</style>
