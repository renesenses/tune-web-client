<script lang="ts">
  /**
   * web#3275 (alec_eiffel, fil 2953) — les flèches Précédent / Suivant de
   * l'en-tête. Elles font le geste des boutons du navigateur (`history.back`,
   * `history.forward`) : la coquille repose la vue, la mémoire par entrée
   * (`lib/memoireNavigation`) repose l'état de l'écran et son défilement.
   *
   * Grisées aux extrémités de la session par `aria-disabled` (relecture de
   * #3278) : un lecteur d'écran dit « indisponible », le clic ne part pas
   * (`naviguer` refuse), et — contrairement à `disabled` — le bouton GARDE le
   * focus quand on atteint l'extrémité au clavier.
   *
   * 📱 Au palier `tiroir` (≤ 760 px), la seule flèche Précédent : la grappe y
   * porte déjà menu, recherche, signet et avatar sur une fenêtre de 390 px, et
   * Suivant y sert peu. Le geste natif du téléphone (bouton Retour d'Android,
   * balayage de Safari) passe par le même `popstate`, et retrouve donc le même
   * état ; la flèche reste pour l'application ajoutée à l'écran d'accueil
   * d'iOS, qui n'a pas de geste de retour.
   *
   * rc14 (retour de Rémi, go de Bertrand) — « trop petites, et près de la
   * loupe : on ripe ». Elles quittent la grappe haut-droite pour le coin
   * HAUT-GAUCHE, comme dans un navigateur : en tête de la barre latérale
   * (`Sidebar`, paliers `large` et `etroit`), dans le coin haut-gauche de la
   * coquille au palier `tiroir` (`ShellV2`, `.av-tl`). Cible de 40 px au
   * moins, loin de la loupe. `disposition="colonne"` :
   * la barre en icônes n'a que 52 px utiles, les deux flèches s'y empilent.
   */
  import { t } from '../../lib/i18n';
  import { formatEcran } from '../../lib/largeurEcran';
  import { peutReculer, peutAvancer, naviguer } from '../../lib/memoireNavigation';

  // `navigator.platform` est déprécié : l'indice client d'abord, l'agent ensuite.
  const plateforme = typeof navigator !== 'undefined'
    ? String((navigator as any).userAgentData?.platform || navigator.userAgent || '') : '';
  const surMac = /Mac|iPhone|iPad|iOS/i.test(plateforme);
  const raccourciReculer = surMac ? '⌘[' : 'Alt+←';
  const raccourciAvancer = surMac ? '⌘]' : 'Alt+→';

  let { disposition = 'ligne' }: { disposition?: 'ligne' | 'colonne' } = $props();

  // Les raccourcis clavier (⌘[ ⌘], Alt+← Alt+→) sont branchés UNE fois par
  // la coquille (`ShellV2`) : ils valent aussi quand les flèches sont hors
  // champ (tiroir fermé, mode sans distraction).
</script>

<div class="fleches-nav" class:colonne={disposition === 'colonne'} data-disposition={disposition} role="group" aria-label={$t('v2.nav.historique' as any)}>
  <button class="fleche" data-fleche-nav="reculer" aria-disabled={!$peutReculer}
    onclick={() => naviguer('reculer')}
    aria-label={$t('v2.nav.precedent' as any)}
    aria-keyshortcuts={surMac ? 'Meta+BracketLeft Alt+ArrowLeft' : 'Alt+ArrowLeft'}
    title={`${$t('v2.nav.precedent' as any)} (${raccourciReculer})`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
  {#if $formatEcran !== 'tiroir'}
    <button class="fleche" data-fleche-nav="avancer" aria-disabled={!$peutAvancer}
      onclick={() => naviguer('avancer')}
      aria-label={$t('v2.nav.suivant' as any)}
      aria-keyshortcuts={surMac ? 'Meta+BracketRight Alt+ArrowRight' : 'Alt+ArrowRight'}
      title={`${$t('v2.nav.suivant' as any)} (${raccourciAvancer})`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  {/if}
</div>

<style>
  /* rc14 — 40 px de cible, pictogramme de 22 px : la
     cible du doigt recommandée, et assez d'écart pour ne pas riper. */
  .fleches-nav{display:flex; align-items:center; gap:6px; flex:0 0 auto}
  .fleches-nav.colonne{flex-direction:column}
  .fleche{width:40px; height:40px; min-width:40px; min-height:40px; border:0; border-radius:50%; background:var(--v2-surface2);
    color:var(--v2-txt3); display:grid; place-items:center; cursor:pointer; transition:.15s; padding:0}
  .fleche:hover:not([aria-disabled="true"]){color:var(--v2-acc1); background:var(--v2-hover)}
  .fleche:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .fleche[aria-disabled="true"]{opacity:.4; cursor:default}
  .fleche svg{width:22px; height:22px}
</style>
