<script lang="ts">
  /**
   * L'icône « radio » — UNE seule source (rc14, retour de Rémi, go de
   * Bertrand du 26/11/2026).
   *
   * Un petit poste de radio stylisé, presque carré, au trait léger : un corps
   * rectangulaire, une antenne en biais terminée par une boule, un
   * haut-parleur rond à droite et trois lignes (la grille) à gauche. Elle
   * remplace l'antenne satellite (emoji 📡) posée devant le nom de la station
   * dans la barre de lecture.
   *
   * Trait `currentColor` d'épaisseur 1,5, comme les pictogrammes de la barre
   * (bouclier PURE, étapes du chemin du signal) : la couleur suit ce qui la
   * porte. Une autre place pour cette icône ? Elle passe par ici, sans
   * recopier le tracé.
   */
  let { taille = 16 }: { taille?: number } = $props();
</script>

<svg data-icone="radio" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M7.5 8 15.2 3.6"/><circle cx="16.6" cy="2.9" r="1.2" fill="currentColor"/><circle cx="15.5" cy="14.5" r="3"/><path d="M6.5 12h3M6.5 14.5h3M6.5 17h3"/></svg>
