<script lang="ts">
  /**
   * web#2966 — « l'assistant IA n'est pas activé sur ce serveur », dit dans
   * chaque fenêtre de l'assistant, avec le chemin pour l'activer.
   *
   * Recette rc12 sur le .18 (13/11/2026) : le greffon y est dormant
   * (`opt_in=false`), ses routes ne sont pas montées, et « + Nouvelle ›
   * Suggérée par l'IA » échouait sans un mot. L'état vient de
   * `assistantIaAbsent` : posé par la sonde du démarrage, puis par chaque
   * appel (`appelIa`) — aucune requête de plus ici. Seul un 404 de route
   * absente l'allume ; une clé manquante ou refusée a déjà sa phrase dans
   * l'échec rendu.
   *
   * Le lien mène à Réglages › Extensions, où le greffon s'active.
   */
  import { t } from '../../lib/i18n';
  import { assistantIaAbsent } from '../../lib/assistantIa';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';

  interface Props {
    /** Ferme la fenêtre qui porte le message, avant d'aller aux Réglages. */
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  function ouvrirExtensions() {
    v2SettingsTarget.set({ tab: 'extensions', section: 'plugins' });
    activeView.set('settings');
    onClose?.();
  }
</script>

{#if $assistantIaAbsent}
  <div class="inactif" role="alert" data-assistant-ia-inactif>
    <p><strong>{$t('assistantIa.err.assistant_inactif' as any)}</strong> {$t('assistantIa.inactif.explication' as any)}</p>
    <button class="lnk" onclick={ouvrirExtensions} data-ouvrir-extensions>
      {$t('assistantIa.inactif.ouvrirExtensions' as any)}
    </button>
  </div>
{/if}

<style>
  .inactif { margin: 8px 0 10px; padding: 10px 12px; border: 1px solid var(--v2-line2); border-radius: 8px; background: var(--v2-bg); }
  .inactif p { margin: 0 0 6px; font-size: calc(12.5px * var(--v2-txt-echelle, 1)); color: var(--v2-txt2); }
  .lnk { border: 0; padding: 0; background: none; color: var(--v2-acc1); cursor: pointer; font-size: calc(12.5px * var(--v2-txt-echelle, 1)); text-decoration: underline; }
</style>
