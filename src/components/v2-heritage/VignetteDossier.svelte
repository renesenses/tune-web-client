<script lang="ts">
  /**
   * tune-server-rust discussion #8273 (rc13) — la pochette d'un dossier dans
   * « Répertoires ».
   *
   * L'icône de dossier reste affichée tant que la vignette n'est pas arrivée,
   * et pour de bon si le serveur n'en a pas (404) : jamais de case vide ni
   * d'image cassée. `loading="lazy"` : seules les lignes visibles demandent
   * leur vignette — une racine de milliers d'artistes ne part pas d'un coup.
   * Le serveur ne rend qu'une vignette (80 px ici, pour 36 px affichés en
   * écran dense), jamais le `folder.jpg` d'origine.
   */
  import * as api from '../../lib/api';

  let { path }: { path: string } = $props();

  const src = $derived(api.folderCoverUrl(path, 80));
  let chargee = $state(false);
  let absente = $state(false);

  // Une ligne recyclée pour un autre dossier repart de l'icône.
  $effect(() => {
    void src;
    chargee = false;
    absente = false;
  });
</script>

<span class="vignette-dossier" data-vignette-dossier aria-hidden="true">
  {#if !chargee}
    <svg class="dir-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  {/if}
  {#if !absente}
    <img
      {src}
      alt=""
      loading="lazy"
      decoding="async"
      width="36"
      height="36"
      class:chargee
      onload={() => (chargee = true)}
      onerror={() => (absente = true)}
    />
  {/if}
</span>

<style>
  .vignette-dossier {
    position: relative;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    overflow: hidden;
  }
  .dir-icon {
    color: var(--tune-text-secondary);
    opacity: 0.7;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  img.chargee {
    opacity: 1;
  }
</style>
