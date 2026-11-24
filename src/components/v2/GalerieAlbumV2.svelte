<script lang="ts">
  /**
   * Fil forum 3050 (Manfred, GO du 24/11/2026) — la GALERIE des images du
   * dossier d'un album de la bibliothèque : scans du livret, dos, disque…
   * Une grille de vignettes sous la liste des pistes, et une vue plein écran
   * qui se parcourt au clavier (flèches, Début/Fin, Échap).
   *
   * Rien n'est rendu quand l'album n'a aucune image : la fiche reste celle
   * d'avant. Le livret PDF garde son bouton, à part (#6481).
   *
   * La vue plein écran est portée à la racine du document (`use:portail`),
   * comme les autres surcouches : `fixed` dans la fiche se ferait enfermer.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { chargerImagesAlbum, indiceApresTouche, libelleImage, type ImageAlbum } from '../../lib/imagesAlbum';

  interface Props {
    albumId: number;
  }
  let { albumId }: Props = $props();

  let images = $state.raw<ImageAlbum[]>([]);
  /** L'indice de l'image en plein écran, `null` quand la vue est fermée. */
  let ouverte = $state<number | null>(null);
  let declencheur: HTMLElement | null = null;
  let vue = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const id = albumId;
    images = [];
    ouverte = null;
    let perime = false;
    void chargerImagesAlbum(id, {
      base: api.BASE,
      liste: api.getAlbumImages,
      navigateur: api.urlDeNavigation,
    }).then((l) => { if (!perime) images = l; });
    return () => { perime = true; };
  });

  function ouvrir(i: number, e: MouseEvent) {
    declencheur = e.currentTarget as HTMLElement;
    ouverte = i;
  }
  function fermer() {
    ouverte = null;
    declencheur?.focus();
  }
  function aller(delta: number) {
    if (ouverte === null || !images.length) return;
    ouverte = (ouverte + delta + images.length) % images.length;
  }

  $effect(() => {
    if (ouverte !== null) vue?.focus();
  });

  function auClavier(e: KeyboardEvent) {
    if (ouverte === null) return;
    const suite = indiceApresTouche(e.key, ouverte, images.length);
    if (suite === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    if (suite === null) fermer();
    else ouverte = suite;
  }

  const courante = $derived(ouverte === null ? null : images[ouverte] ?? null);
</script>

{#if images.length}
  <section class="galerie" data-galerie-album aria-labelledby="galerie-titre-{albumId}">
    <h3 id="galerie-titre-{albumId}">{$t('v2.album.images.title' as any)}</h3>
    <ul class="grille">
      {#each images as image, i (image.id)}
        <li>
          <button class="vignette" data-image-album={image.id} onclick={(e) => ouvrir(i, e)}
            title={libelleImage(image)} aria-label={$t('v2.album.images.open' as any).replace('{name}', libelleImage(image))}>
            <img src={image.vignette} alt="" loading="lazy" decoding="async" />
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if courante && ouverte !== null}
  <div class="fond tune-v2" role="presentation" use:portail onclick={fermer}>
    <div class="vue" role="dialog" aria-modal="true" tabindex="-1" bind:this={vue}
      aria-label={$t('v2.album.images.viewer' as any)} data-galerie-plein-ecran
      onkeydown={auClavier} onclick={(e) => e.stopPropagation()}>
      <img class="pleine" src={courante.url} alt={libelleImage(courante)} />
      <div class="barre">
        <span class="legende">{libelleImage(courante)}</span>
        <span class="compteur" aria-live="polite">{ouverte + 1} / {images.length}</span>
      </div>
      {#if images.length > 1}
        <button class="nav prec" data-galerie-prec aria-label={$t('v2.album.images.previous' as any)}
          title={$t('v2.album.images.previous' as any)} onclick={() => aller(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <button class="nav suiv" data-galerie-suiv aria-label={$t('v2.album.images.next' as any)}
          title={$t('v2.album.images.next' as any)} onclick={() => aller(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      {/if}
      <button class="fermer" data-galerie-fermer aria-label={$t('common.close' as any)}
        title={$t('common.close' as any)} onclick={fermer}>×</button>
    </div>
  </div>
{/if}

<style>
  .galerie{margin:28px 0 8px}
  .galerie h3{margin:0 0 12px; font:600 calc(15px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  .grille{list-style:none; margin:0; padding:0; display:grid; gap:12px;
    grid-template-columns:repeat(auto-fill, minmax(132px, 1fr))}
  .vignette{display:block; width:100%; aspect-ratio:1; padding:0; border:1px solid var(--v2-line2); border-radius:8px;
    overflow:hidden; background:var(--v2-surface2); cursor:zoom-in}
  .vignette img{display:block; width:100%; height:100%; object-fit:cover}
  .vignette:hover{border-color:var(--v2-txt3)}
  .vignette:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}

  .fond{position:fixed; inset:0; z-index:950; background:rgba(0,0,0,.88)}
  .vue{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; outline:none;
    padding:48px 72px 64px; box-sizing:border-box}
  .pleine{max-width:100%; max-height:100%; object-fit:contain; box-shadow:0 18px 60px rgba(0,0,0,.6)}
  .barre{position:absolute; left:0; right:0; bottom:16px; display:flex; justify-content:center; gap:16px;
    color:#eee; font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .compteur{opacity:.7; font-variant-numeric:tabular-nums}
  .nav,.fermer{position:absolute; display:grid; place-items:center; width:44px; height:44px; padding:0; border:0;
    border-radius:50%; background:rgba(255,255,255,.1); color:#fff; cursor:pointer}
  .nav:hover,.fermer:hover{background:rgba(255,255,255,.22)}
  .nav:focus-visible,.fermer:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .nav svg{width:24px; height:24px}
  .prec{left:16px; top:50%; transform:translateY(-50%)}
  .suiv{right:16px; top:50%; transform:translateY(-50%)}
  .fermer{top:12px; right:16px; font-size:calc(26px * var(--v2-txt-echelle, 1)); line-height:1}
  @media (max-width:600px){
    .vue{padding:48px 8px 64px}
    .prec{left:4px} .suiv{right:4px}
  }
</style>
