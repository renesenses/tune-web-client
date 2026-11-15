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
    levente = false,
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
    /**
     * La présentation de Levente (15/11/2026) — widget « première ligne,
     * nouvelle présentation ». Sans elle, le cadre est EXACTEMENT celui
     * d'avant : largeur fixe, titre sans empattement.
     */
    levente?: boolean;
    children: Snippet;
  } = $props();
</script>

<section class="panneau" class:levente
         style:width={levente ? undefined : `${largeur}px`}>
  <header>
    {#if icone}<span class="ico" aria-hidden="true">{@render icone()}</span>{/if}
    <h3>{titre}</h3>
    {#if entete}<span class="entete">{@render entete()}</span>{/if}
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
    font: 600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ── Présentation de Levente (15/11/2026) ── le panneau remplit sa case de
     la grille posée par la ligne (`.grille-levente`, PageWidgets) : AUCUNE
     largeur propre, sans quoi il déborderait de sa case et serait coupé
     (vérification du .18 à 1440 px). Coins plus ronds, titre à empattements
     (`--font-display`, repli Georgia). */
  .panneau.levente { width: auto; min-width: 0; gap: 10px; padding: 14px 16px; border-radius: var(--v2-r-md); }
  .levente header { gap: 9px; }
  .levente .ico :global(svg) { width: 18px; height: 18px; }
  /* Le titre passe à la ligne plutôt que d'être coupé (« Concerts near … »
     dans une case de 260 px). */
  .levente h3 { flex: 1 1 auto; font: 600 calc(16px * var(--v2-txt-echelle, 1))/1.2 var(--font-display, Georgia, serif);
    white-space: normal; overflow-wrap: anywhere; text-overflow: clip; }
  .entete { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; }

  /* `min-height: 0` : voir l'en-tête. C'est lui qui empêche un panneau trop
     plein de faire grandir la ligne. */
  .corps { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
</style>
