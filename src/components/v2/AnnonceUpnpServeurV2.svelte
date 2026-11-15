<script lang="ts">
  /**
   * Réglages ▸ Audio ▸ Serveur multimédia UPnP/DLNA (web#2784).
   *
   * Demande d'Alex, relayée par Bertrand le 10/11/2026 : « Is there a way to
   * disable Tune Server UPnP Server from advertising on the network? ». Le
   * serveur portait déjà le réglage (`GET`/`POST /api/v1/upnp/config`,
   * champs `enabled` et `friendly_name`), lu au démarrage par
   * `spawn_upnp_advertiser` ; aucun écran ne l'exposait.
   *
   * Un POST par changement, pas de bouton Enregistrer — comme les cases des
   * sections voisines. La bascule et le renommage prennent effet au
   * redémarrage de Tune : l'écran le dit après chaque changement enregistré.
   *
   * Tant que le GET n'a pas répondu, aucun contrôle n'est rendu : une case
   * « décochée » par défaut mentirait sur un serveur qui annonce.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  let config = $state<api.UpnpServerConfig | null>(null);
  let nom = $state('');
  let enCours = $state(false);
  let redemarrage = $state(false);
  let erreur = $state<'panne' | 'chargement' | null>(null);

  async function relire() {
    try {
      config = await api.getUpnpServerConfig();
      nom = config.friendly_name ?? '';
    } catch {
      config = null;
      erreur = 'chargement';
    }
  }

  $effect(() => {
    void relire();
  });

  async function enregistrer(patch: Partial<api.UpnpServerConfig>): Promise<boolean> {
    if (enCours) return false;
    enCours = true;
    erreur = null;
    try {
      await api.setUpnpServerConfig(patch);
      config = { ...(config ?? { enabled: true, friendly_name: '' }), ...patch };
      redemarrage = true;
      return true;
    } catch {
      erreur = 'panne';
      return false;
    } finally {
      enCours = false;
    }
  }

  async function basculer(e: Event) {
    const cible = e.currentTarget as HTMLInputElement;
    const voulu = cible.checked;
    if (!(await enregistrer({ enabled: voulu }))) cible.checked = !voulu;
  }

  /** Le nom part quand on quitte le champ ou qu'on valide par Entrée ; un
   *  nom inchangé ou vide ne déclenche rien. */
  async function renommer() {
    const propre = nom.trim();
    if (!config || !propre || propre === config.friendly_name) {
      nom = config?.friendly_name ?? nom;
      return;
    }
    if (await enregistrer({ friendly_name: propre })) nom = propre;
    else nom = config.friendly_name;
  }
</script>

<div class="upnp-serveur" data-upnp-serveur>
  {#if config}
    <label class="case">
      <input
        type="checkbox"
        checked={config.enabled}
        disabled={enCours}
        onchange={basculer}
        data-upnp-serveur-case
      />
      <span>{$t('upnpServeur.label')}</span>
    </label>
    <p class="hint">{$t('upnpServeur.hint')}</p>
    <label class="champ">
      <span>{$t('upnpServeur.name')}</span>
      <input
        type="text"
        bind:value={nom}
        disabled={enCours}
        maxlength="64"
        autocomplete="off"
        onblur={renommer}
        onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
        data-upnp-serveur-nom
      />
    </label>
    {#if redemarrage}
      <p class="hint alerte" role="status" data-upnp-serveur-redemarrage>{$t('upnpServeur.restart')}</p>
    {/if}
    {#if erreur === 'panne'}
      <p class="hint alerte" role="alert">{$t('upnpServeur.error')}</p>
    {/if}
  {:else if erreur === 'chargement'}
    <p class="hint" role="alert" data-upnp-serveur-indisponible>{$t('upnpServeur.unavailable')}</p>
  {:else}
    <p class="hint" role="status">{$t('upnpServeur.loading')}</p>
  {/if}
</div>

<style>
  .upnp-serveur { display: flex; flex-direction: column; gap: 10px; }
  .case { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .champ { display: flex; flex-direction: column; gap: 4px; max-width: 360px; font-size: calc(12px * var(--v2-txt-echelle, 1)); color: var(--tune-text-muted); }
  .champ input {
    font: inherit; font-size: calc(13px * var(--v2-txt-echelle, 1)); padding: 6px 8px; border-radius: 6px;
    color: var(--tune-text); background: var(--tune-bg-input, transparent);
    border: 1px solid var(--tune-border);
  }
  .champ input:focus-visible { outline: 2px solid var(--tune-accent, currentColor); outline-offset: 1px; }
  .hint { margin: 0; font-size: calc(12px * var(--v2-txt-echelle, 1)); color: var(--tune-text-muted); }
  .alerte { color: var(--tune-warning, #d97706); }
</style>
