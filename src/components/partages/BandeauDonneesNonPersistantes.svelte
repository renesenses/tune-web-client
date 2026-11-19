<script lang="ts">
  /**
   * tune-server-rust#8747 — bandeau « vos données ne survivront pas à la
   * recréation du conteneur ». Sur un Synology, la mise à jour se fait d'un
   * clic (Container Manager › Image › Mettre à jour) : le journal ne se lit
   * pas, seul l'écran peut prévenir AVANT que la base ne reparte de zéro.
   *
   * Rien ne s'affiche hors conteneur, sur des données persistantes, ou face à
   * un serveur qui ne publie pas `data_persistence`.
   */
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { donneesNonPersistantes, type PersistanceDonnees } from '../../lib/persistanceDonnees';

  let alerte = $state<PersistanceDonnees | null>(null);
  $effect(() => {
    api.getSystemEnv()
      .then((env) => { alerte = donneesNonPersistantes(env); })
      .catch(() => { alerte = null; });
  });
</script>

{#if alerte}
  <div class="bandeau-donnees" role="alert" data-donnees-non-persistantes={alerte.kind}>
    <strong>{$t('settings.dataNotPersistentTitle' as any)}</strong>
    <span>{$t('settings.dataNotPersistent' as any).split('{dir}').join(alerte.dir)}</span>
  </div>
{/if}

<style>
  .bandeau-donnees {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0 0 12px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--tune-error, #ef4444);
    background: color-mix(in srgb, var(--tune-error, #ef4444) 12%, transparent);
    color: var(--tune-text);
    font-size: calc(13px * var(--v2-txt-echelle, 1));
    line-height: 1.45;
  }
  .bandeau-donnees strong { font-weight: 600; }
</style>
