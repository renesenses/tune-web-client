<script lang="ts">
  /**
   * L'ONGLET « Artistes similaires » de la page artiste — maquette de Levente
   * (Figma 616:5811, rc12).
   *
   * Une grille de portraits : le nom, et la RAISON que donnent les
   * métadonnées (`similar_artists[].reason`) à la place du genre de la
   * maquette, que l'API ne rend pas pour un voisin. Le portrait vient de la
   * bibliothèque quand le voisin y est (voir `portraitsSimilaires`), sinon ses
   * initiales. Un clic ouvre le voisin exactement comme la puce de l'aperçu
   * (`ouvrirSimilaire` de la page).
   */
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { t } from '../../lib/i18n';
  import { initialesArtiste } from '../../lib/initialesArtiste';
  import type { PortraitSimilaire } from '../../lib/pageArtisteMaquette';

  interface Props {
    nom: string;
    /** `image` : le portrait que rend le service (fil 3009, point 7). */
    similaires: { name: string; reason: string; image?: string | null; id?: string | null }[];
    portraits?: Record<string, PortraitSimilaire>;
    /** Le voisin lui-même, pas son nom : deux homonymes ne se confondent pas. */
    onOuvrir: (voisin: { name: string; reason: string; image?: string | null; id?: string | null }) => void;
  }
  let { nom, similaires, portraits = {}, onOuvrir }: Props = $props();
</script>

<section class="similaires" data-similaires-grille>
  <h2>{$t('artist.similarArtists' as any)}</h2>
  <p class="intro">{$t('artist.page.similarIntro' as any).replace('{nom}', nom)}</p>
  <ul class="grille">
    <!-- Clé : l'identifiant, sinon le rang (deux homonymes, fil 3009). -->
    {#each similaires as sa, i (sa.id ?? `rang-${i}`)}
      <li>
        <button type="button" class="carte" data-similaire={sa.name} onclick={() => onOuvrir(sa)}>
          <span class="portrait">
            <AlbumArt coverPath={portraits[sa.name]?.image ?? sa.image ?? null} albumId={null} size={0} recadrer
              alt={sa.name} fallbackInitials={initialesArtiste(sa.name)} />
          </span>
          <span class="nom">{sa.name}</span>
          {#if sa.reason?.trim()}<span class="raison" title={sa.reason}>{sa.reason}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .similaires{margin:6px 0 24px}
  h2{margin:0; font:600 calc(20px * var(--v2-txt-echelle, 1))/1.2 var(--v2-sans); color:var(--v2-txt)}
  .intro{margin:6px 0 18px; font-size:calc(13px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .grille{list-style:none; margin:0; padding:0; display:grid; gap:22px 18px;
    grid-template-columns:repeat(auto-fill, minmax(150px, 1fr))}
  .carte{all:unset; box-sizing:border-box; width:100%; cursor:pointer; display:flex; flex-direction:column; gap:4px}
  .carte:focus-visible{outline:2px solid var(--v2-focus); outline-offset:3px; border-radius:var(--v2-r-card)}
  .portrait{display:block; aspect-ratio:1/1; border-radius:var(--v2-r-card); overflow:hidden; background:var(--v2-surface2);
    border:1px solid var(--v2-line); margin-bottom:6px; transition:transform .15s ease}
  .portrait :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .carte:hover .portrait{transform:translateY(-2px)}
  .nom{font:600 calc(14px * var(--v2-txt-echelle, 1))/1.3 var(--v2-sans); color:var(--v2-txt)}
  .raison{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-acc1); overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap}
  @media (max-width: 640px){
    .grille{grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px 12px}
  }
</style>
