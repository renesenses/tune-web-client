<script lang="ts">
  /**
   * L'accueil : une `PageWidgets` nourrie du registre général.
   *
   * Tout le mécanisme — chargement paresseux, mode édition, disposition rangée
   * par profil — vit dans `PageWidgets`, que les écrans éditoriaux Qobuz et
   * Tidal instancient de la même façon avec leur propre catalogue.
   */
  import PageWidgets from './PageWidgets.svelte';
</script>

<PageWidgets />
