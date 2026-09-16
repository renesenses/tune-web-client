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
   *
   * 🔴 #987 — le catalogue de l'accueil n'est plus une CONSTANTE. FabienM,
   * fil 1774, point 6 : « il manque les playlists Qobuz (alors que le widget
   * playlist Qobuz est bien présent dans le menu streaming) ». Les catégories
   * de playlists n'ont pas de nom écrit en dur — Qobuz peut en ouvrir une
   * demain — donc elles se DEMANDENT. La page se monte tout de suite avec le
   * registre, et les APPREND quand elles arrivent, par un geste du parent
   * (`apprendreCatalogue`) : `PageWidgets` restaure alors ceux qu'une
   * disposition enregistrée citait déjà.
   */
  import PageWidgets from './PageWidgets.svelte';
  import { categoriesPlaylistsPourAccueil } from '../../lib/widgetsService';

  let page = $state<PageWidgets | null>(null);
  $effect(() => {
    let vivant = true;
    categoriesPlaylistsPourAccueil('qobuz').then((w) => {
      if (vivant && w.length) page?.apprendreCatalogue(w);
    });
    return () => { vivant = false; };
  });
</script>

<PageWidgets salut bind:this={page} />
