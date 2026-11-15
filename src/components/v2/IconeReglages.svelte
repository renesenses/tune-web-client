<script lang="ts">
  /**
   * L'icône « Réglages » de la V2 — UNE seule source.
   *
   * Levente (designer de Tune), 15/11/2026, Figma 609:5801 : `settings.svg`,
   * Lucide « settings » (licence ISC), tracés repris tels quels de
   * ~/DEV/coordination/figma-levente-1511/settings.svg. Trait `currentColor`
   * d'épaisseur 2 : la couleur suit le bouton qui la porte.
   *
   * Utilisée par l'en-tête de la barre latérale et par le menu de compte. Une
   * entrée « Réglages » de plus ? Elle passe par ici, sans recopier le tracé.
   */
  let { taille = 24 }: { taille?: number } = $props();
</script>

<svg data-icone="settings" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>
