<script lang="ts">
  /**
   * Pochette d'une playlist : une mosaïque 2×2 des pochettes qui la composent.
   *
   * ## Toujours QUATRE cases
   *
   * Décision de Bertrand du 01/09/2026 : « divise en 4 pour montrer que c'est
   * un assemblage ». Le carré est donc toujours partagé en quatre, même quand
   * la playlist ne contient qu'un seul album — et c'est le cas de neuf des
   * treize playlists mesurées sur son serveur, qui sont des albums rangés en
   * playlists.
   *
   * Une case unique occupant tout le carré ressemblerait à une pochette
   * d'album : exactement ce qu'une playlist n'est pas. Le découpage est le
   * signal, pas la conséquence du nombre d'images.
   *
   * ## Ce qu'on fait quand il y a moins de quatre pochettes
   *
   * On CYCLE sur celles qu'on a. Une pochette remplit les quatre cases, deux se
   * répartissent en damier, trois bouclent sur la quatrième. Le motif répété
   * reste lisible comme un assemblage, là où trois cases vides se liraient
   * comme une donnée manquante — et enverraient chercher un défaut qui n'existe
   * pas.
   *
   * Aucune pochette du tout : on rend l'initiale, comme partout ailleurs.
   */
  import AlbumArt from '../AlbumArt.svelte';

  interface Props {
    /** Pochettes DISTINCTES, dans l'ordre de la playlist. Au plus quatre sont lues. */
    pochettes: string[];
    /** Repli quand la playlist n'a aucune pochette. */
    initiales?: string | null;
    alt?: string;
  }
  let { pochettes, initiales = null, alt = '' }: Props = $props();

  /**
   * Les quatre cases.
   *
   * `pochettes[i % n]` : le cycle. Avec deux pochettes A et B, on obtient
   * A B A B — un damier, pas une répétition en bloc, donc le regard voit deux
   * images et non une bordure douteuse.
   */
  const cases = $derived.by(() => {
    const src = pochettes.filter(Boolean).slice(0, 4);
    if (!src.length) return [];
    return Array.from({ length: 4 }, (_, i) => src[i % src.length]);
  });
</script>

{#if cases.length}
  <div class="mos" aria-label={alt}>
    {#each cases as c, i (i)}
      <div class="case">
        <AlbumArt coverPath={c} albumId={null} size={0} alt="" />
      </div>
    {/each}
  </div>
{:else}
  <!-- Aucune pochette : le repli habituel, pas un carré vide découpé en quatre
       qui donnerait l'air d'un chargement interrompu. -->
  <AlbumArt coverPath={null} albumId={null} size={0} {alt} fallbackInitials={initiales} />
{/if}

<style>
  .mos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    width: 100%;
    height: 100%;
    /* Le trait qui SÉPARE les quatre : sans lui, quatre pochettes proches de
       ton sur ton se fondraient en une seule image, et le découpage — qui est
       tout le propos — disparaîtrait. */
    gap: 1px;
    background: var(--v2-line2);
    overflow: hidden;
  }
  .case {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  /* `:global` : l'image est rendue par AlbumArt, donc hors de la portée des
     styles de ce composant. */
  .case :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
