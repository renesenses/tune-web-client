<script lang="ts">
  /**
   * Réglages ▸ Système ▸ À propos ▸ « Démarrer Tune avec Windows »
   * (tune-server-rust#8054).
   *
   * Fil forum 2850 (sashasha) : après l'installation, au premier redémarrage
   * de Windows, Tune ne repartait pas et l'interface affichait « serveur hors
   * ligne ». L'installeur pose désormais une valeur `HKCU\…\Run` (case cochée
   * par défaut) ; cet interrupteur la pose ou la retire après coup.
   *
   * `GET /system/autostart` rend `{ supported, enabled, disabled_by_windows }`.
   * Hors Windows (`supported: false`), ou face à un serveur qui ne connaît
   * pas la route, l'écran ne montre RIEN : la ligne n'a pas de sens sur un
   * Mac ou un Raspberry Pi, et « À propos » est vu par tous.
   *
   * Tant que le GET n'a pas répondu, aucun contrôle n'est rendu : une case
   * décochée par défaut mentirait sur un PC où Tune démarre déjà.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  let etat = $state<api.DemarrageWindows | null>(null);
  let enCours = $state(false);
  let erreur = $state(false);

  $effect(() => {
    api.getDemarrageWindows().then(
      (e) => { etat = e.supported ? e : null; },
      () => { etat = null; },
    );
  });

  async function basculer(e: Event) {
    const cible = e.currentTarget as HTMLInputElement;
    const voulu = cible.checked;
    if (enCours) return;
    enCours = true;
    erreur = false;
    try {
      etat = await api.setDemarrageWindows(voulu);
    } catch {
      erreur = true;
      cible.checked = !voulu;
    } finally {
      enCours = false;
    }
  }
</script>

{#if etat}
  <div class="demarrage-windows" data-demarrage-windows>
    <label class="case">
      <input
        type="checkbox"
        checked={etat.enabled}
        disabled={enCours}
        onchange={basculer}
        data-demarrage-windows-case
      />
      <span>{$t('demarrageWindows.label' as any)}</span>
    </label>
    <p class="hint">{$t('demarrageWindows.hint' as any)}</p>
    {#if etat.disabled_by_windows}
      <p class="hint alerte" role="status" data-demarrage-windows-coupe>{$t('demarrageWindows.disabledByWindows' as any)}</p>
    {/if}
    {#if erreur}
      <p class="hint alerte" role="alert">{$t('demarrageWindows.error' as any)}</p>
    {/if}
  </div>
{/if}

<style>
  .demarrage-windows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .case { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .hint { margin: 0; font-size: calc(12px * var(--v2-txt-echelle, 1)); color: var(--tune-text-muted); }
  .alerte { color: var(--tune-warning, #d97706); }
</style>
