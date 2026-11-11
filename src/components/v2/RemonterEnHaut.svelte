<script lang="ts">
  /**
   * « Remonter en haut » — web#2798 (Michel, fil 2748). Un seul bouton pour
   * toute la coquille : il suit la dernière longue liste défilée (voir
   * `lib/remonterEnHaut.ts`) et la ramène en haut. 60 px, rond, contrasté.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import {
    conteneurVise, doitAfficher, positionBouton, TAILLE_BOUTON_PX,
  } from '../../lib/remonterEnHaut';

  let cible = $state<Element | null>(null);
  let droite = $state(24);
  let bas = $state(96);

  function placer(el: Element) {
    // Le document lui-même : son rect est celui de la page défilée, pas de
    // la fenêtre. On se cale sur la fenêtre, au-dessus de la barre de transport.
    const r = el === document.scrollingElement
      ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight - 96 }
      : el.getBoundingClientRect();
    const p = positionBouton(r, { largeur: window.innerWidth, hauteur: window.innerHeight });
    droite = p.droite; bas = p.bas;
  }

  function surDefilement(e: Event) {
    const el = conteneurVise(e.target);
    if (!el) return;
    if (doitAfficher(el)) {
      cible = el;
      placer(el);
    } else if (el === cible) {
      cible = null;
    }
  }

  function remonter(e: MouseEvent) {
    const el = cible;
    if (!el) return;
    const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (typeof (el as HTMLElement).scrollTo === 'function') {
      (el as HTMLElement).scrollTo({ top: 0, behavior: doux ? 'smooth' : 'auto' });
    } else {
      el.scrollTop = 0;
    }
    // Défilement doux : on NE retire PAS le bouton ici. Les `scroll` de
    // l'animation le retirent quand la liste passe sous le seuil ; le retirer
    // tout de suite le ferait clignoter (réapparition à chaque `scroll`).
    if (!doitAfficher(el)) cible = null;
    // Au clavier (`detail === 0`), le bouton va disparaître : le focus irait
    // sur <body>. On le rend à la liste elle-même.
    if (e.detail === 0 && el instanceof HTMLElement && el !== document.scrollingElement) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }
  }

  onMount(() => {
    document.addEventListener('scroll', surDefilement, { capture: true, passive: true });
    // La vue a changé, la liste a disparu : le bouton ne doit pas rester seul.
    const veille = window.setInterval(() => {
      if (cible && !doitAfficher(cible)) cible = null;
    }, 1000);
    const surRedim = () => { if (cible) placer(cible); };
    window.addEventListener('resize', surRedim);
    return () => {
      document.removeEventListener('scroll', surDefilement, { capture: true } as EventListenerOptions);
      window.clearInterval(veille);
      window.removeEventListener('resize', surRedim);
    };
  });
</script>

{#if cible}
  <button type="button" class="haut" data-remonter-en-haut
    style="right:{droite}px; bottom:{bas}px; --taille:{TAILLE_BOUTON_PX}px"
    title={$t('v2.backToTop' as any)} aria-label={$t('v2.backToTop' as any)}
    onclick={remonter}>
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <path d="M12 5l-7 7m7-7l7 7M12 5v14" fill="none" stroke="currentColor"
        stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
{/if}

<style>
  .haut{position:fixed; z-index:900; width:var(--taille); height:var(--taille);
    display:flex; align-items:center; justify-content:center; padding:0;
    border-radius:50%; cursor:pointer;
    background:var(--v2-surface, #1B2432); color:var(--v2-txt, #FFFFFF);
    border:2px solid var(--v2-acc1, #00D4AA);
    box-shadow:0 4px 14px rgba(0,0,0,.35); opacity:.92}
  .haut:hover, .haut:focus-visible{opacity:1; background:var(--v2-acc1, #00D4AA); color:var(--v2-on-acc, #041A14)}
  .haut:focus-visible{outline:3px solid var(--v2-txt, #FFFFFF); outline-offset:2px}
</style>
