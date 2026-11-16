<script lang="ts">
  /**
   * La mosaïque de pochettes d'une carte de playlist de cercle, posée PAR-DESSUS
   * la vignette du thème (qui reste quand rien n'est trouvé). Chargée quand la
   * carte approche de l'écran, une playlist à la fois (`circlePochettesCartes`).
   */
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { pochettesDeCarte, tuilesDeCarte } from '../../lib/circlePochettesCartes';
  import type { IdOpaque } from '../../lib/circlePlaylists';
  import type { PochetteMorceau } from '../../lib/circlePlaylistVue';

  interface Props { id: IdOpaque; version: number; count: number }
  let { id, version, count }: Props = $props();

  let hote = $state<HTMLDivElement>();
  let pochettes = $state<PochetteMorceau[]>([]);
  const tuiles = $derived(tuilesDeCarte(pochettes));

  $effect(() => {
    const el = hote;
    const cle = id; const v = version;
    pochettes = [];
    if (!el || count === 0 || typeof IntersectionObserver === 'undefined') return;
    let actif = true;
    const io = new IntersectionObserver((entrees) => {
      if (!entrees.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void pochettesDeCarte(cle, v).then((p) => { if (actif) pochettes = p; });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { actif = false; io.disconnect(); };
  });
</script>

<div class="pochettes-carte" class:une={tuiles.length === 1} class:vide={tuiles.length === 0} bind:this={hote} aria-hidden="true">
  {#each tuiles as p, k (k)}
    <span class="tuile"><AlbumArt coverPath={p.coverPath} albumId={p.albumId} size={0} alt="" /></span>
  {/each}
</div>

<style>
  .pochettes-carte{position:absolute; inset:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr;
    overflow:hidden; border-radius:inherit; pointer-events:none}
  .pochettes-carte.une{grid-template-columns:1fr; grid-template-rows:1fr}
  .pochettes-carte.vide{display:none}
  .tuile{display:block; min-width:0; min-height:0; overflow:hidden}
</style>
