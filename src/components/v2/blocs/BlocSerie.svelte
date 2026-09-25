<script lang="ts">
  /**
   * LA SÉRIE — jours consécutifs d'écoute, et le record.
   *
   * Le plus petit bloc de l'écran, et le plus littéral : deux nombres. Rendu
   * repris de `.streak-card` de l'ancien Tableau de bord — le grand chiffre à
   * l'accent, le record en second, plus discret.
   *
   * « Streak » était écrit en dur en anglais sur un écran français (#1155,
   * Didier, fil 1566). Le titre du bloc vient de `dashboard.section.streak`,
   * traduit dans les onze langues, et rien n'est écrit en dur ici.
   */
  import { t } from '../../../lib/i18n';

  export interface MatiereSerie {
    courante: number;
    record: number;
  }

  let { donnees }: { donnees: MatiereSerie | null } = $props();
</script>

{#if !donnees || (donnees.courante === 0 && donnees.record === 0)}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="serie">
    <div class="bloc1">
      <div class="grand">{donnees.courante}</div>
      <div class="quoi">{$t('dashboard.consecutiveDays' as any)}</div>
    </div>
    <div class="bloc2">
      <div class="moyen">{donnees.record}</div>
      <div class="quoi2">{$t('dashboard.personalRecord' as any)}</div>
    </div>
  </div>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .serie { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 4px 30px 0; }
  .grand {
    font: 800 46px/1 var(--v2-sans); letter-spacing: -1.8px;
    color: var(--v2-acc1); font-variant-numeric: tabular-nums;
  }
  .moyen {
    font: 700 24px/1 var(--v2-sans); color: var(--v2-txt);
    font-variant-numeric: tabular-nums;
  }
  .bloc2 { text-align: right; }
  .quoi { margin-top: 5px; font: 400 13px var(--v2-sans); color: var(--v2-txt2); }
  .quoi2 { margin-top: 4px; font: 400 12px var(--v2-sans); color: var(--v2-txt3); }

  @media (max-width: 1024px) { .serie { padding-left: 22px; padding-right: 22px; } }
  @media (max-width: 640px) {
    .serie { padding-left: 16px; padding-right: 16px; }
    .grand { font-size: 36px; }
  }
</style>
