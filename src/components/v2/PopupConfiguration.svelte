<script lang="ts">
  /**
   * rc14, refonte TESS — LOT 1 : la popup de configuration GÉNÉRIQUE
   * (`lib/popupConfiguration`).
   *
   * Montée dans `<main>` de la coquille : elle en couvre toute la surface, à
   * droite du menu vertical, sans toucher à la barre de lecture. Elle :
   *   - se ferme par la croix, par Échap, et quand on change d'écran ;
   *   - GARDE le focus (Tab et Maj+Tab tournent à l'intérieur) et le rend à
   *     l'élément qui l'avait à l'ouverture ;
   *   - ne change pas l'adresse : ce n'est pas un écran.
   *
   * Contenu d'aujourd'hui : Crossfeed Pro et Crosstalk (leurs écrans, montés
   * tels quels, sur la zone courante — celle que règle TESS). Demain :
   * correction de pièce, suréchantillonneur. Une vue inconnue ne s'ouvre pas.
   * Le store vient du fichier contrat (`stores/tessOuverture`).
   */
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { popupConfiguration, fermerPopupConfiguration } from '../../lib/stores/tessOuverture';
  import { estEcranEnPopup, type EcranEnPopup } from '../../lib/popupConfiguration';
  import CrossfeedProV2 from './CrossfeedProV2.svelte';
  import CrosstalkV2 from './CrosstalkV2.svelte';

  const TITRES: Record<EcranEnPopup, string> = {
    crossfeedpro: 'v2.nav.crossfeedPro',
    crosstalk: 'v2.nav.crosstalk',
  };
  /** La vue montée, seulement si la popup sait la montrer. */
  const vue = $derived<EcranEnPopup | null>(estEcranEnPopup($popupConfiguration?.vue) ? ($popupConfiguration!.vue as EcranEnPopup) : null);

  let boite = $state<HTMLElement | null>(null);
  let focusAvant: HTMLElement | null = null;

  const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // À l'ouverture : retenir le focus d'avant, le poser dans la popup.
  $effect(() => {
    if (!vue) return;
    focusAvant = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    void tick().then(() => boite?.focus());
    return () => {
      // À la fermeture : rendre le focus à qui l'avait, s'il est encore là.
      const f = focusAvant;
      focusAvant = null;
      if (f && f.isConnected && typeof f.focus === 'function') f.focus();
    };
  });

  function auClavier(e: KeyboardEvent) {
    if (!vue || !boite) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fermerPopupConfiguration();
      return;
    }
    if (e.key !== 'Tab') return;
    const liste = Array.from(boite.querySelectorAll<HTMLElement>(FOCUSABLES)).filter((el) => !el.hasAttribute('inert'));
    if (liste.length === 0) { e.preventDefault(); boite.focus(); return; }
    const premier = liste[0];
    const dernier = liste[liste.length - 1];
    const actif = document.activeElement;
    if (e.shiftKey && (actif === premier || actif === boite)) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && actif === dernier) { e.preventDefault(); premier.focus(); }
    else if (actif && !boite.contains(actif)) { e.preventDefault(); premier.focus(); }
  }

  // Le focus qui s'échappe (clic ailleurs, lecteur d'écran) revient dans la popup.
  function surFocusHors(e: FocusEvent) {
    if (!vue || !boite) return;
    const cible = e.target as Node | null;
    if (cible && !boite.contains(cible) && !(cible as HTMLElement).closest?.('.transport-bar')) boite.focus();
  }
</script>

<svelte:window onkeydown={auClavier} onfocusin={surFocusHors} />

{#if vue}
  {@const titre = $t(TITRES[vue] as any)}
  <div class="popup-config" data-popup-configuration={vue}>
    <div class="boite" bind:this={boite} role="dialog" aria-modal="true" aria-label={titre} tabindex="-1">
      <header class="tete">
        <h2>{titre}</h2>
        <button type="button" class="fermer" data-popup-fermer aria-label={$t('common.close' as any)}
          title={$t('common.close' as any)} onclick={fermerPopupConfiguration}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </header>
      <div class="corps">
        {#if vue === 'crossfeedpro'}
          <CrossfeedProV2 />
        {:else if vue === 'crosstalk'}
          <CrosstalkV2 />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .popup-config{position:absolute; inset:0; z-index:40; display:flex; align-items:stretch; justify-content:stretch;
    padding:16px; background:color-mix(in srgb, var(--v2-bg, #000) 55%, transparent); box-sizing:border-box}
  .boite{flex:1 1 auto; min-width:0; min-height:0; display:flex; flex-direction:column; outline:none;
    border-radius:var(--v2-r-lg, 14px); border:1px solid var(--v2-line2, rgba(255,255,255,.12));
    background:var(--v2-bg, var(--tune-bg, #111)); box-shadow:0 12px 40px rgba(0,0,0,.45); overflow:hidden}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px;
    border-bottom:1px solid var(--v2-line, rgba(255,255,255,.08))}
  .tete h2{margin:0; font:700 calc(16px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt, inherit)}
  .fermer{display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:999px;
    border:1px solid var(--v2-line2, rgba(255,255,255,.12)); background:transparent; color:var(--v2-txt, currentColor); cursor:pointer}
  .fermer:hover{border-color:var(--v2-acc2, currentColor)}
  .fermer:focus-visible{outline:2px solid var(--v2-acc2, currentColor); outline-offset:2px}
  .corps{flex:1 1 auto; min-height:0; overflow:auto}
  @media (max-width: 767px){ .popup-config{padding:0} .boite{border-radius:0} }
</style>
