<script lang="ts">
  /**
   * Éteindre la machine — appliance Tune OS uniquement. PORTÉ de l'ancienne
   * interface (`SettingsView`, `eteindreLaMachine`) avant la phase 5.
   *
   * Monté par `SettingsV2` sous « Redémarrer / Arrêter le serveur », et
   * seulement si la configuration dit `appliance` : hors appliance la route
   * rend 404.
   *
   * Le bouton ne revient PAS à son état initial après l'ordre : la machine
   * s'arrête, et le reproposer ferait croire à un échec. Une coupure de
   * transport est attendue (le serveur meurt avant de répondre) ; une vraie
   * réponse d'erreur, elle, prouve que l'ordre a été refusé — le bouton
   * redevient utilisable et l'erreur est dite.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { errText } from '../../lib/utils';

  let enCours = $state(false);

  async function eteindre() {
    if (!(await dialogs.confirm($t('diagnostics.confirmShutdown' as any), { danger: true }))) return;
    enCours = true;
    try {
      await api.applianceShutdown();
    } catch (e) {
      const msg = errText(e);
      // `null` : coupure de transport générique — la machine s'éteint.
      if (msg !== null) {
        enCours = false;
        notifications.error(msg);
      }
    }
  }
</script>

<button class="lnk danger eteindre" disabled={enCours} onclick={eteindre}>
  {enCours ? $t('diagnostics.shuttingDown' as any) : $t('diagnostics.shutdown' as any)}
</button>

<style>
  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; font-size: 13px; cursor: pointer;
  }
  .lnk:disabled { opacity: 0.5; cursor: default; }
  .lnk.danger { color: var(--v2-danger); }
  .lnk.danger:hover:not(:disabled) { border-color: var(--v2-danger); }
</style>
