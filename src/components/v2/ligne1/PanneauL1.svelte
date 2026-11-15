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
    entete,
    children,
  }: {
    titre: string;
    /**
     * Largeur MINIMALE en pixels — 15/11/2026, maquette de Levente. Sur un
     * écran large, les panneaux se partagent la ligne à parts égales
     * (`flex: 1 1 0`) ; en dessous de leur plancher, la ligne défile comme
     * avant. La hauteur, elle, n'est JAMAIS un paramètre.
     */
    largeur: number;
    icone?: Snippet;
    /** Ce que le panneau pose à droite de son titre (pastille, « Voir tout »). */
    entete?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="panneau" style:min-width="{largeur}px">
  <header>
    {#if icone}<span class="ico" aria-hidden="true">{@render icone()}</span>{/if}
    <h3>{titre}</h3>
    {#if entete}<span class="entete">{@render entete()}</span>{/if}
  </header>
  <div class="corps">{@render children()}</div>
</section>

<style>
  .panneau {
    flex: 1 1 0; height: var(--l1-h); box-sizing: border-box;
    display: flex; flex-direction: column; gap: 10px; padding: 14px 16px;
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-md);
    background: var(--v2-surface2);
  }

  header { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .ico { display: inline-flex; color: var(--v2-acc1); }
  .ico :global(svg) { width: 18px; height: 18px; }
  /* Le titre de panneau de la maquette : un caractère à empattements, comme
     les titres de section de l'accueil. `--font-display` est le jeton de la
     coquille ; le repli garde un empattement si elle ne le pose pas. */
  h3 {
    flex: 1 1 auto; margin: 0; min-width: 0; color: var(--v2-txt);
    font: 600 calc(16px * var(--v2-txt-echelle, 1)) var(--font-display, Georgia, serif);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .entete { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; }

  /* `min-height: 0` : voir l'en-tête. C'est lui qui empêche un panneau trop
     plein de faire grandir la ligne. */
  .corps { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
</style>
