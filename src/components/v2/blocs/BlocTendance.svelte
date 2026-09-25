<script lang="ts">
  /**
   * LE BLOC DOMINANT — la tendance jour par jour.
   *
   * C'est le point focal de l'écran, au sens où Bertrand l'entend depuis
   * l'arbitrage de la Recherche : une carte en grand qui ancre le regard,
   * puis des blocs plus petits et réguliers en dessous. Il est le premier de
   * la disposition par défaut et le plus haut des onze.
   *
   * « Les chiffres avant les axes » : ce qu'on lit d'abord est le TOTAL, en
   * grand, et le nombre de jours écoutés à côté. Les barres viennent ensuite,
   * sans graduation — elles disent la forme, pas la valeur, et l'infobulle
   * donne le détail exact d'une journée.
   *
   * Le rendu est celui de l'ancien Tableau de bord (`.trend-bars`,
   * `.trend-bar`), repris et non redessiné : une barre par jour, hauteur
   * proportionnelle au maximum, teinte unique.
   */
  import { t } from '../../../lib/i18n';

  export interface MatiereTendance {
    jours: { jour: string; plays: number }[];
    /** Le total de la période, déjà formaté dans la langue de l'écran. */
    total: string;
    /** Combien de jours de la période portent au moins une écoute. */
    actifs: number;
  }

  let { donnees }: { donnees: MatiereTendance | null } = $props();

  const jours = $derived(donnees?.jours ?? []);
  const max = $derived(jours.length ? Math.max(...jours.map((d) => d.plays)) : 0);
</script>

{#if !jours.length}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="tete">
    <div class="grand">{donnees?.total ?? '0'}</div>
    <div class="legende">
      <span class="quoi">{$t('dashboard.totals.plays' as any)}</span>
      <span class="appoint">{$t('dashboard.consecutiveDays' as any)} · {donnees?.actifs ?? 0}</span>
    </div>
  </div>
  <div class="barres">
    {#each jours as d (d.jour)}
      <div
        class="barre"
        title={$t('dashboard.trend.tip' as any).replace('{day}', d.jour).replace('{plays}', String(d.plays))}
        style:height="{max ? Math.max((d.plays / max) * 100, d.plays ? 3 : 0) : 0}%"
      ></div>
    {/each}
  </div>
  <p class="axe">{$t('dashboard.trend.axis' as any)}</p>
{/if}

<style>
  /* Tout est en variables `--v2-*` : la coquille v2 porte cinq thèmes, dont
     un CLAIR. Une seule couleur en dur et l'un des deux modes serait raté. */
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .tete { display: flex; align-items: baseline; gap: 14px; padding: 0 30px 14px; flex-wrap: wrap; }
  .grand {
    font: 700 46px/1 var(--v2-sans);
    letter-spacing: -1.5px;
    color: var(--v2-acc1);
    font-variant-numeric: tabular-nums;
  }
  .legende { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .quoi { font: 600 13px var(--v2-sans); color: var(--v2-txt); }
  .appoint { font: 400 12px var(--v2-sans); color: var(--v2-txt3); }

  /* Les barres RESPIRENT : une gouttière franche de 3 px, et une hauteur qui
     prend ce que le bloc lui laisse (`flex:1`) plutôt qu'une valeur fixe —
     c'est ce qui fait que le bloc remplit la hauteur qu'il a déclarée. */
  .barres {
    flex: 1 1 auto;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    min-height: 90px;
    padding: 0 30px;
  }
  .barre {
    flex: 1 1 0;
    min-width: 3px;
    background: var(--v2-acc1);
    border-radius: 3px 3px 0 0;
    transition: opacity 0.15s;
  }
  .barre:hover { opacity: 0.65; }

  .axe { margin: 10px 0 0; padding: 0 30px; font: 400 11.5px var(--v2-sans); color: var(--v2-txt3); }

  /* Tablette et mobile : la page perd ses gouttières de 30 px, comme le reste
     de `PageWidgets` (voir ses propres ruptures à 1024 et 640). Les barres se
     resserrent à 2 px et le grand nombre descend d'un cran — trente jours de
     barres tiennent dans 320 px de large sans déborder, parce qu'elles sont
     en `flex:1 1 0` et non en largeur fixe. */
  @media (max-width: 1024px) {
    .tete, .barres, .axe { padding-left: 22px; padding-right: 22px; }
  }
  @media (max-width: 640px) {
    .tete, .barres, .axe { padding-left: 16px; padding-right: 16px; }
    .grand { font-size: 34px; }
    .barres { gap: 2px; min-height: 70px; }
  }
</style>
