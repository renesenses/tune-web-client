<script lang="ts">
  /**
   * web#3275 (alec_eiffel, fil 2953) — les flèches Précédent / Suivant de
   * l'en-tête. Elles font le geste des boutons du navigateur (`history.back`,
   * `history.forward`) : la coquille repose la vue, la mémoire par entrée
   * (`lib/memoireNavigation`) repose l'état de l'écran et son défilement.
   *
   * Grisées aux extrémités de la session. `disabled`, et non un simple style :
   * un lecteur d'écran dit « indisponible », et le clic ne part pas.
   *
   * 📱 Au palier `tiroir` (≤ 760 px), la seule flèche Précédent : la grappe y
   * porte déjà menu, recherche, signet et avatar sur une fenêtre de 390 px, et
   * Suivant y sert peu. Le geste natif du téléphone (bouton Retour d'Android,
   * balayage de Safari) passe par le même `popstate`, et retrouve donc le même
   * état ; la flèche reste pour l'application ajoutée à l'écran d'accueil
   * d'iOS, qui n'a pas de geste de retour.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { formatEcran } from '../../lib/largeurEcran';
  import { peutReculer, peutAvancer, naviguer, brancherRaccourcisNavigation } from '../../lib/memoireNavigation';

  const surMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  const raccourciReculer = surMac ? '⌘[' : 'Alt+←';
  const raccourciAvancer = surMac ? '⌘]' : 'Alt+→';

  onMount(() => brancherRaccourcisNavigation());
</script>

<div class="fleches-nav" role="group" aria-label={$t('v2.nav.historique' as any)}>
  <button class="raccourci fleche" data-fleche-nav="reculer" disabled={!$peutReculer}
    onclick={() => naviguer('reculer')}
    aria-label={$t('v2.nav.precedent' as any)}
    aria-keyshortcuts={surMac ? 'Meta+BracketLeft Alt+ArrowLeft' : 'Alt+ArrowLeft'}
    title={`${$t('v2.nav.precedent' as any)} (${raccourciReculer})`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
  {#if $formatEcran !== 'tiroir'}
    <button class="raccourci fleche" data-fleche-nav="avancer" disabled={!$peutAvancer}
      onclick={() => naviguer('avancer')}
      aria-label={$t('v2.nav.suivant' as any)}
      aria-keyshortcuts={surMac ? 'Meta+BracketRight Alt+ArrowRight' : 'Alt+ArrowRight'}
      title={`${$t('v2.nav.suivant' as any)} (${raccourciAvancer})`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  {/if}
</div>

<style>
  .fleches-nav{display:flex; align-items:center; gap:4px; flex:0 0 auto}
  .raccourci{width:32px; height:32px; border:0; border-radius:50%; background:var(--v2-surface2);
    color:var(--v2-txt3); display:grid; place-items:center; cursor:pointer; transition:.15s; padding:0}
  .raccourci:hover:not(:disabled){color:var(--v2-acc1); background:var(--v2-hover)}
  .raccourci:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .raccourci:disabled{opacity:.4; cursor:default}
  .raccourci svg{width:16px; height:16px}
</style>
