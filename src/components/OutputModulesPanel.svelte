<script lang="ts">
  /**
   * Panneau « Modules de sortie » de l'écran Diagnostics (#2392, arbitrage du
   * 01/09/2026).
   *
   * Le bandeau `OutputModuleBanner` ne dit que les REFUS, en langage courant,
   * et cache volontairement le code technique. Ici c'est l'inverse, et c'est
   * complémentaire : Diagnostics est l'écran qu'on envoie au support, il doit
   * montrer l'ÉTAT COMPLET que le serveur sert déjà sous `output_providers` —
   * chaque fournisseur de sortie, le module qu'il exige, le nombre d'appareils
   * vus, et, s'il est refusé, le code exact du refus. Les trois cas que le
   * serveur distingue depuis v0.9.115 deviennent lisibles à l'écran :
   *
   *   - absent de la liste          → non compilé dans ce binaire ;
   *   - `refusal` renseigné         → droit manquant, et le code dit lequel ;
   *   - sans refus et `devices: 0`  → il cherche vraiment et ne trouve rien.
   *
   * Le composant reçoit le tableau DÉJÀ lu (`tableauFournisseurs`) : c'est
   * l'écran hôte qui décide de ne rien monter du tout quand un serveur ancien
   * n'envoie pas `output_providers`. Aucune requête ici.
   *
   * `variante` choisit la navigation vers l'écran compte/licence : le client
   * actuel passe par `settingsInitialTab`, le nouveau par `v2SettingsTarget`.
   */
  import { t } from '../lib/i18n';
  import { activeView, settingsInitialTab } from '../lib/stores/navigation';
  import { v2SettingsTarget } from '../lib/stores/v2SettingsNav';
  import {
    COMPTE_NON_RELIE,
    MODULE_NON_POSSEDE,
    type CodeRefusModule,
    type TableauFournisseurs,
  } from '../lib/refusModuleSortie';

  let {
    tableau,
    variante = 'v1',
  }: { tableau: TableauFournisseurs; variante?: 'v1' | 'v2' } = $props();

  function libelleRefus(code: CodeRefusModule): string {
    return $t(
      code === COMPTE_NON_RELIE
        ? 'diagnostics.outputRefusedNotLinked'
        : code === MODULE_NON_POSSEDE
          ? 'diagnostics.outputRefusedNotOwned'
          : 'diagnostics.outputRefusedUnknown',
    );
  }

  /** Réglages ▸ Système ▸ Cloud, où vit le bouton de connexion du compte. */
  function ouvrirCompte() {
    if (variante === 'v2') v2SettingsTarget.set({ tab: 'system', section: 'cloud' });
    else settingsInitialTab.set('system');
    activeView.set('settings');
  }

  /** Réglages ▸ Licence : ce que le compte possède, et le lien vers la boutique. */
  function ouvrirLicence() {
    if (variante === 'v2') v2SettingsTarget.set({ tab: 'license', section: 'license' });
    else settingsInitialTab.set('system');
    activeView.set('settings');
  }
</script>

<div class="output-modules" data-account-linked={String(tableau.accountLinked)}>
  <p class="output-modules-summary">
    {#if tableau.accountLinked === true}
      <span class="output-modules-badge ok">{$t('diagnostics.outputAccountLinked')}</span>
    {:else if tableau.accountLinked === false}
      <span class="output-modules-badge warn">{$t('diagnostics.outputAccountNotLinked')}</span>
    {/if}
    <span class="output-modules-licensed">
      {#if tableau.licensedModules.length > 0}
        {$t('diagnostics.outputLicensedModules').replace('{list}', tableau.licensedModules.join(', '))}
      {:else}
        {$t('diagnostics.outputNoLicensedModules')}
      {/if}
    </span>
  </p>

  {#if tableau.lignes.length === 0}
    <p class="output-modules-empty">{$t('diagnostics.outputNoProviders')}</p>
  {:else}
    <div class="output-modules-scroll">
      <table class="output-modules-table">
        <thead>
          <tr>
            <th>{$t('diagnostics.outputProvider')}</th>
            <th>{$t('diagnostics.outputRequiredModule')}</th>
            <th class="num">{$t('diagnostics.outputDevices')}</th>
            <th>{$t('diagnostics.outputStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {#each tableau.lignes as l, i (`${l.provider}:${i}`)}
            <tr data-provider={l.provider} data-refus={l.refus?.code ?? 'ok'}>
              <td class="output-modules-name">{l.provider || $t('outputModule.genericName')}</td>
              <td>
                {#if l.requiredModule}
                  <code>{l.requiredModule}</code>
                {:else}
                  <span class="output-modules-muted">{$t('diagnostics.outputNoModuleRequired')}</span>
                {/if}
              </td>
              <td class="num mono">{l.devices ?? '—'}</td>
              <td>
                {#if l.refus}
                  <div class="output-modules-refus">
                    <span class="output-modules-badge warn">{libelleRefus(l.refus.code)}</span>
                    {#if l.refus.codeBrut}
                      <code class="output-modules-code">{l.refus.codeBrut}</code>
                    {/if}
                    {#if l.refus.code === COMPTE_NON_RELIE}
                      <button type="button" class="output-modules-action" onclick={ouvrirCompte}>
                        {$t('outputModule.notLinkedAction')}
                      </button>
                    {:else}
                      <button type="button" class="output-modules-action" onclick={ouvrirLicence}>
                        {$t('diagnostics.outputOpenLicense')}
                      </button>
                      {#if l.refus.code === MODULE_NON_POSSEDE && l.refus.upgradeUrl}
                        <a
                          class="output-modules-action"
                          href={l.refus.upgradeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {$t('outputModule.notOwnedAction')}
                        </a>
                      {/if}
                    {/if}
                  </div>
                {:else}
                  <span class="output-modules-badge ok">{$t('diagnostics.outputActive')}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  /* Volontairement sans jeton de thème : le panneau vit dans les deux clients
     (jetons `--tune-*` et `--v2-*`) et hérite la couleur de texte de son hôte. */
  .output-modules {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    font-size: 13px;
    line-height: 1.4;
  }
  .output-modules-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }
  .output-modules-licensed,
  .output-modules-muted,
  .output-modules-empty {
    opacity: 0.72;
  }
  .output-modules-empty {
    margin: 0;
  }
  .output-modules-scroll {
    overflow-x: auto;
  }
  .output-modules-table {
    width: 100%;
    border-collapse: collapse;
  }
  .output-modules-table th,
  .output-modules-table td {
    text-align: left;
    padding: 0.45rem 0.5rem 0.45rem 0;
    border-bottom: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    vertical-align: top;
  }
  .output-modules-table th {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }
  .output-modules-table tbody tr:last-child td {
    border-bottom: none;
  }
  .output-modules-table .num {
    text-align: right;
    white-space: nowrap;
  }
  .output-modules-name {
    font-weight: 600;
  }
  .mono,
  code {
    font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
    font-size: 12px;
  }
  .output-modules-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .output-modules-badge.ok {
    background: rgba(87, 198, 185, 0.15);
    color: #3fb8a8;
  }
  .output-modules-badge.warn {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }
  .output-modules-refus {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .output-modules-code {
    opacity: 0.8;
  }
  .output-modules-action {
    background: transparent;
    border: 1px solid rgba(245, 158, 11, 0.55);
    color: inherit;
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 11.5px;
    line-height: 1.3;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }
  .output-modules-action:hover {
    background: rgba(245, 158, 11, 0.2);
  }
</style>
