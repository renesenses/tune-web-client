<script lang="ts">
  /** L'icône TESS (option C « Wave T », maquette A5). */
  import { ICONE_TESS } from '../../../lib/tess';
  let { taille = 18 }: { taille?: number } = $props();
</script>

<svg class="icone-tess" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={ICONE_TESS} />
</svg>

<style>
  .icone-tess{flex:0 0 auto; display:block}
</style>
