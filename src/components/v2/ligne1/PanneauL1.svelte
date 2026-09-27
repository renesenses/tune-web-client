<script lang="ts">
  /**
   * LE CADRE COMMUN DES PANNEAUX DE LA PREMIÈRE LIGNE.
   *
   * Trois panneaux — genres, concerts, statistiques — partagent exactement le
   * même cadre : une hauteur imposée par la ligne, un en-tête discret, et un
   * corps qui défile verticalement si sa matière déborde.
   *
   * 🔴 Ce cadre existe pour UNE raison, et elle est la même que celle de
   * `premiereLigne.ts` : trois cadres écrits trois fois auraient divergé au
   * premier ajustement, et sur une ligne où les panneaux se touchent, un
   * écart de deux pixels se voit. `__tests__/premiereLigneAccueil.test.ts`
   * vérifie qu'aucun panneau ne se donne sa propre hauteur.
   *
   * ## Le corps DÉFILE, il ne pousse pas
   *
   * `min-height: 0` sur le corps : sans lui, un enfant flex refuse de
   * rétrécir sous sa taille de contenu et le panneau grandit — donc la ligne
   * entière avec lui, ce qui est précisément ce qu'on veut interdire.
   */
  import type { Snippet } from 'svelte';

  let {
    titre,
    largeur,
    icone,
    children,
  }: {
    titre: string;
    /** Largeur en pixels. La hauteur, elle, n'est JAMAIS un paramètre. */
    largeur: number;
    icone?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="panneau" style:width="{largeur}px">
  <header>
    {#if icone}<span class="ico" aria-hidden="true">{@render icone()}</span>{/if}
    <h3>{titre}</h3>
  </header>
  <div class="corps">{@render children()}</div>
</section>

<style>
  .panneau {
    flex: 0 0 auto; height: var(--l1-h); box-sizing: border-box;
    display: flex; flex-direction: column; gap: 8px; padding: 12px;
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card);
    background: var(--v2-surface2);
  }

  header { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .ico { display: inline-flex; color: var(--v2-acc1); }
  .ico :global(svg) { width: 15px; height: 15px; }
  h3 {
    margin: 0; min-width: 0; color: var(--v2-txt);
    font: 600 13px var(--v2-sans);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* `min-height: 0` : voir l'en-tête. C'est lui qui empêche un panneau trop
     plein de faire grandir la ligne. */
  .corps { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
</style>
