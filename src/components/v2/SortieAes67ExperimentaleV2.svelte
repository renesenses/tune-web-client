<script lang="ts">
  /**
   * Réglages ▸ Audio ▸ Expérimental ▸ Sortie AES67 (Dante/Ravenna)
   * (tune-server-rust#7336, décision de Bertrand du 31/10/2026 : la rc10
   * l'embarque en EXPÉRIMENTAL, DÉSACTIVÉE par défaut).
   *
   * La case pose ou retire l'installation du greffon natif `aes67`, par les
   * routes ordinaires des greffons : `POST /plugins/aes67/install` pour
   * cocher, `DELETE /plugins/aes67` pour décocher. Tant qu'elle n'est pas
   * cochée, le serveur ne charge pas le greffon : aucun socket PTP, SAP ni
   * RTP, aucune zone. Le changement prend effet au redémarrage du serveur,
   * ce que l'écran dit quand le serveur le demande (`restart_required`).
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { estRefusPremium } from '../../lib/premiumRefus';
  import { lireCaseAes67, type CaseAes67 } from '../../lib/sortieAes67';

  let etat = $state<CaseAes67 | null>(null);
  let enCours = $state(false);
  let redemarrage = $state(false);
  let erreur = $state<'premium' | 'panne' | null>(null);

  async function relire() {
    try {
      etat = lireCaseAes67(await api.getPluginDetail('aes67'));
    } catch {
      etat = { cochee: false, disponible: false };
    }
  }

  $effect(() => {
    void relire();
  });

  async function basculer(e: Event) {
    const voulu = (e.currentTarget as HTMLInputElement).checked;
    enCours = true;
    erreur = null;
    try {
      const rep = voulu ? await api.installPlugin('aes67') : await api.uninstallPlugin('aes67');
      if (rep?.restart_required) redemarrage = true;
      etat = { cochee: voulu, disponible: true };
    } catch (err) {
      erreur = estRefusPremium(err) ? 'premium' : 'panne';
      (e.currentTarget as HTMLInputElement).checked = !voulu;
    } finally {
      enCours = false;
    }
  }
</script>

<div class="exp" data-aes67-experimental>
  <p class="avertissement" role="note" data-aes67-avertissement>{$t('aes67.experimental.warning')}</p>
  {#if etat}
    <label class="case">
      <input
        type="checkbox"
        checked={etat.cochee}
        disabled={!etat.disponible || enCours}
        onchange={basculer}
        data-aes67-case
      />
      <span>{$t('aes67.experimental.label')}</span>
    </label>
    <p class="hint">{$t('aes67.experimental.hint')}</p>
    {#if !etat.disponible}
      <p class="hint" data-aes67-indisponible>{$t('aes67.experimental.unavailable')}</p>
    {/if}
    {#if redemarrage}
      <p class="hint alerte" role="status" data-aes67-redemarrage>{$t('aes67.experimental.restart')}</p>
    {/if}
    {#if erreur === 'premium'}
      <p class="hint alerte" role="alert">{$t('aes67.premiumRequired')}</p>
    {:else if erreur === 'panne'}
      <p class="hint alerte" role="alert">{$t('aes67.experimental.error')}</p>
    {/if}
  {:else}
    <p class="hint" role="status">{$t('aes67.loading')}</p>
  {/if}
</div>

<style>
  .exp { display: flex; flex-direction: column; gap: 10px; }
  .avertissement {
    margin: 0; padding: 8px 10px; border-radius: 6px; font-size: 12px;
    border: 1px solid var(--tune-warning, #d97706); color: var(--tune-warning, #d97706);
  }
  .case { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .hint { margin: 0; font-size: 12px; color: var(--tune-text-muted); }
  .alerte { color: var(--tune-warning, #d97706); }
</style>
