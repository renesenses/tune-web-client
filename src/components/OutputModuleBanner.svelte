<script lang="ts">
  /**
   * Dit pourquoi un module de sortie payant n'affiche aucun appareil (#2392).
   *
   * Le serveur nomme ce refus depuis #2392 ; personne ne le lisait. Un
   * bêta-testeur du module Diretta a réinstallé Fedora, changé de système de
   * fichiers et recompilé trente minutes durant, alors que son droit était
   * valide depuis sept jours : il lui manquait une connexion de compte, et
   * l'écran ne pouvait pas le lui apprendre. Voir `lib/refusModuleSortie.ts`
   * pour la charge utile et pour la différence entre les deux codes.
   *
   * Le message dit TROIS choses, pas une :
   *   1. que le module est bien là et que ni l'installation ni la clé de
   *      licence ne sont en cause — sans quoi l'utilisateur cherche la panne
   *      là où le testeur l'a cherchée ;
   *   2. ce qui manque exactement ;
   *   3. où cliquer pour le réparer.
   *
   * Le code technique (`module_account_not_linked`) n'est PAS affiché : il
   * n'a jamais épargné une réinstallation à personne. Il reste dans le rapport
   * de diagnostic, qui est sa place.
   */
  import { t } from '../lib/i18n';
  import { activeView, settingsInitialTab } from '../lib/stores/navigation';
  import {
    COMPTE_NON_RELIE,
    MODULE_NON_POSSEDE,
    refusAAfficher,
    type RefusAffichable,
  } from '../lib/refusModuleSortie';

  // `unknown` et non un type précis : la charge utile vient du réseau, et un
  // type déclaré n'est pas un contrat vérifié. `refusAAfficher` la sonde.
  let { instantane }: { instantane?: unknown } = $props();

  let refus = $derived(refusAAfficher(instantane));

  /** Le nom des modules, ou un générique traduit si le serveur n'en donne aucun. */
  function nomModules(r: RefusAffichable): string {
    return r.modules.length > 0 ? r.modules.join(', ') : $t('outputModule.genericName');
  }

  function titre(r: RefusAffichable): string {
    const cle =
      r.code === COMPTE_NON_RELIE
        ? 'outputModule.notLinkedTitle'
        : r.code === MODULE_NON_POSSEDE
          ? 'outputModule.notOwnedTitle'
          : 'outputModule.unknownTitle';
    return $t(cle).replace('{module}', nomModules(r));
  }

  function corps(r: RefusAffichable): string {
    const cle =
      r.code === COMPTE_NON_RELIE
        ? 'outputModule.notLinkedBody'
        : r.code === MODULE_NON_POSSEDE
          ? 'outputModule.notOwnedBody'
          : 'outputModule.unknownBody';
    return $t(cle).replace('{module}', nomModules(r));
  }

  /** Réglages ▸ Système ▸ Cloud ▸ mozaiklabs.fr, où vit le bouton de connexion. */
  function ouvrirLiaisonCompte() {
    settingsInitialTab.set('system');
    activeView.set('settings');
  }
</script>

{#each refus as r (r.code)}
  <div class="output-module-banner" role="status" data-refus={r.code}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <div class="output-module-banner-text">
      <strong>{titre(r)}</strong>
      <span>{corps(r)}</span>
    </div>
    {#if r.code === COMPTE_NON_RELIE}
      <button class="output-module-banner-action" onclick={ouvrirLiaisonCompte}>
        {$t('outputModule.notLinkedAction')}
      </button>
    {:else if r.code === MODULE_NON_POSSEDE && r.upgradeUrl}
      <a
        class="output-module-banner-action"
        href={r.upgradeUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {$t('outputModule.notOwnedAction')}
      </a>
    {/if}
  </div>
{/each}

<style>
  .output-module-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    margin: 0 0 0.75rem;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: var(--text, #e6e6e6);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .output-module-banner svg {
    flex: 0 0 auto;
    margin-top: 0.1rem;
    color: #f59e0b;
  }
  .output-module-banner-text {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .output-module-banner-text strong {
    font-weight: 600;
  }
  .output-module-banner-action {
    flex: 0 0 auto;
    align-self: center;
    background: transparent;
    border: 1px solid rgba(245, 158, 11, 0.55);
    color: inherit;
    border-radius: 999px;
    padding: 0.25rem 0.7rem;
    font-size: 0.8rem;
    line-height: 1.3;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }
  .output-module-banner-action:hover {
    background: rgba(245, 158, 11, 0.2);
  }
</style>
