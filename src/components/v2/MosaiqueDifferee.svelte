<script lang="ts">
  /**
   * Une MOSAÏQUE dont les pochettes arrivent APRÈS l'affichage.
   *
   * Les widgets de favoris de l'Accueil (25/09/2026) montrent des playlists
   * et des collections. Le serveur ne rend aucune pochette avec une playlist
   * locale, ni toujours avec une collection : les écrans Playlists et
   * Collections les tirent des pistes ou des albums, une requête par objet,
   * et laissent la grille s'afficher d'abord. On fait pareil : la vignette
   * montre l'initiale, puis la mosaïque la rejoint. Un échec ne coûte que la
   * sienne.
   *
   * Le rendu reste celui de `MosaiquePochettes` : quatre cases, toujours.
   */
  import MosaiquePochettes from './MosaiquePochettes.svelte';

  interface Props {
    /** Pochettes connues d'avance. Non vide : aucune requête. */
    pochettes?: string[];
    /** Où les chercher sinon. */
    charger?: (() => Promise<string[]>) | null;
    initiales?: string | null;
    alt?: string;
  }
  let { pochettes = [], charger = null, initiales = null, alt = '' }: Props = $props();

  let chargees = $state<string[]>([]);
  $effect(() => {
    if (pochettes.length || !charger) return;
    let vivant = true;
    charger()
      .then((p) => {
        if (vivant) chargees = Array.isArray(p) ? p : [];
      })
      .catch(() => {
        /* la vignette garde son initiale */
      });
    return () => {
      vivant = false;
    };
  });
  const vues = $derived(pochettes.length ? pochettes : chargees);
</script>

<!-- Un CARRÉ, quel que soit le conteneur : la vignette de bande n'a pas de
     hauteur à elle, et la mosaïque prend `height: 100%`. -->
<div class="cadre">
  <MosaiquePochettes pochettes={vues} {initiales} {alt} />
</div>

<style>
  .cadre {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }
</style>
