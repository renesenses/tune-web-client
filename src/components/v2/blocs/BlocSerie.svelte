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

<!-- Design v3 (§9.5) : une série NULLE est une valeur, et elle s'affiche —
     « 0 jour consécutif », pas un message vide. Le record reste en second,
     quand il existe. -->
{#if !donnees}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="serie">
    <div class="bloc1">
      <div class="grand">{donnees.courante}</div>
      <div class="quoi">{$t('dashboard.consecutiveDays' as any)}</div>
    </div>
    {#if donnees.record > 0}
      <div class="bloc2">
        <div class="moyen">{donnees.record}</div>
        <div class="quoi2">{$t('dashboard.personalRecord' as any)}</div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .rien { margin: 0; padding: 22px var(--bloc-marge, 30px); color: var(--v2-txt3); font: 400 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); }

  .serie { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 4px var(--bloc-marge, 30px) 0; }
  .grand {
    font: 700 calc(30px * var(--v2-txt-echelle, 1))/1 var(--v2-sans); letter-spacing: -0.5px;
    color: var(--v2-acc1); font-variant-numeric: tabular-nums;
  }
  .moyen {
    font: 700 calc(24px * var(--v2-txt-echelle, 1))/1 var(--v2-sans); color: var(--v2-txt);
    font-variant-numeric: tabular-nums;
  }
  .bloc2 { text-align: right; align-self: stretch; display: flex; flex-direction: column; justify-content: flex-end;
    border-left: 1px solid var(--v2-line); padding-left: 20px; }
  .quoi { margin-top: 5px; font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }
  .quoi2 { margin-top: 4px; font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3); }

  @media (max-width: 1024px) { .serie { padding-left: var(--bloc-marge, 22px); padding-right: var(--bloc-marge, 22px); } }
  @media (max-width: 640px) {
    .serie { padding-left: var(--bloc-marge, 16px); padding-right: var(--bloc-marge, 16px); }
    .grand { font-size: calc(26px * var(--v2-txt-echelle, 1)); }
  }
</style>
