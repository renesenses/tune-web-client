<script lang="ts">
  /**
   * Témoin des fils 3098 / 3104 : l'action `fenetreAlbumsPaginee` câblée
   * comme dans `LibraryV2` — `use:` avec un objet d'options, et un
   * `surFenetre` qui LIT la tranche courante avant de l'écrire
   * (`poserTranchePaginee`).
   */
  import { fenetreAlbumsPaginee, type TrancheAlbums } from '../fenetreAlbumsPaginee';

  let { total, apresPose }: { total: number; apresPose?: (el: HTMLElement) => void } = $props();
  let tranche = $state<TrancheAlbums>({ debut: 0, fin: 200, avant: 0, apres: 0 });
  let el: HTMLElement | undefined = $state();
  export const poses: TrancheAlbums[] = [];
  function poserTranche(t: TrancheAlbums) {
    poses.push(t);
    if (t.debut !== tranche.debut || t.fin !== tranche.fin || t.avant !== tranche.avant || t.apres !== tranche.apres) tranche = t;
    if (el) apresPose?.(el);
  }
</script>

<div class="grid paginee" bind:this={el}
  use:fenetreAlbumsPaginee={{ total, mode: 'grid', taille: null, surFenetre: poserTranche, surPret: () => {} }}>
  <span data-tranche>{tranche.debut}-{tranche.fin}</span>
</div>
