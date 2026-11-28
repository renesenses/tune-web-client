<script lang="ts">
  /**
   * Le menu des COLONNES d'un tableau de pistes (GO de Bertrand, 28/11/2026) :
   * ouvert par le clic droit sur un en-tête, ou Maj+F10 / touche Menu. Ce
   * n'est pas un menu de piste : il porte le même habit que `MenuPisteV2`
   * (clavier, focus, ancrage, 44 px au doigt), qu'il monte.
   */
  import MenuPisteV2 from './MenuPisteV2.svelte';
  import type { EntreeMenu } from '../../lib/menuPiste';

  let { ancre, entrees, focusInitial = false, retourFocus = null, etiquette, onClose }: {
    ancre: DOMRect; entrees: EntreeMenu[]; focusInitial?: boolean; retourFocus?: HTMLElement | null;
    etiquette?: string; onClose: () => void;
  } = $props();
</script>

<MenuPisteV2 {ancre} {entrees} {focusInitial} {retourFocus} largeur={240} {etiquette} {onClose} />
