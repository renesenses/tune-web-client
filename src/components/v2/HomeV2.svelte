<script lang="ts">
  /**
   * L'accueil : une `PageWidgets` nourrie du registre général.
   *
   * Tout le mécanisme — chargement paresseux, mode édition, disposition rangée
   * par profil — vit dans `PageWidgets`, que les écrans éditoriaux Qobuz et
   * Tidal instancient de la même façon avec leur propre catalogue.
   *
   * `salut` est ce qui distingue CETTE instance des leurs : le bandeau y salue
   * la personne (« Bonsoir Bertrand ! ») au lieu de nommer la page (Bertrand,
   * 03/09/2026). Les écrans éditoriaux gardent le leur, qui dit où l'on est.
   */
  import PageWidgets from './PageWidgets.svelte';
</script>

<PageWidgets salut />
