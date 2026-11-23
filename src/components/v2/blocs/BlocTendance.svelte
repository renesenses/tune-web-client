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
  import { t, locale } from '../../../lib/i18n';
  import { clePeriode, periodeActive } from '../../../lib/tableauDeBordPeriode';

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

  /**
   * Design v3 (§9.4) — les graduations sous les barres. Sept jours : le jour
   * de la semaine, abrégé dans la langue de l'écran. Au-delà, la date, et
   * seulement une étiquette sur `pas` pour que la rangée reste lisible —
   * les barres, elles, restent toutes là (et leur infobulle donne le détail).
   */
  function etiquette(cle: string, langue: string): string {
    const [a, m, j] = cle.split('-').map(Number);
    const d = new Date(a, (m || 1) - 1, j || 1);
    try {
      return jours.length <= 7
        ? new Intl.DateTimeFormat(langue, { weekday: 'short' }).format(d)
        : new Intl.DateTimeFormat(langue, { day: 'numeric', month: 'numeric' }).format(d);
    } catch {
      return cle.slice(5);
    }
  }
  const pas = $derived(jours.length <= 7 ? 1 : Math.ceil(jours.length / 7));
</script>

{#if !jours.length}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="tete">
    <div class="grand">{donnees?.total ?? '0'}</div>
    <!-- Design v3 : « Lectures · 7 jours » — le libellé ET la période. -->
    <span class="quoi">{$t('dashboard.totals.plays' as any)} · {$t(clePeriode(periodeActive()) as any)}</span>
  </div>
  <div class="barres" role="img" aria-label={$t('dashboard.trend.axis' as any)}>
    {#each jours as d (d.jour)}
      <div
        class="barre"
        title={$t('dashboard.trend.tip' as any).replace('{day}', d.jour).replace('{plays}', String(d.plays))}
        style:height="{max ? Math.max((d.plays / max) * 100, d.plays ? 3 : 0) : 0}%"
      ></div>
    {/each}
  </div>
  <div class="ticks" aria-hidden="true">
    {#each jours as d, i (d.jour)}
      <span class="tick">{i % pas === 0 ? etiquette(d.jour, $locale) : ''}</span>
    {/each}
  </div>
{/if}

<style>
  /* Tout est en variables `--v2-*` : la coquille v2 porte cinq thèmes, dont
     un CLAIR. Une seule couleur en dur et l'un des deux modes serait raté. */
  .rien { margin: 0; padding: 22px var(--bloc-marge, 30px); color: var(--v2-txt3); font: 400 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); }

  .tete { display: flex; align-items: baseline; gap: 10px; padding: 0 var(--bloc-marge, 30px) 12px; flex-wrap: wrap; }
  .grand {
    font: 700 calc(30px * var(--v2-txt-echelle, 1))/1 var(--v2-sans);
    letter-spacing: -0.5px;
    color: var(--v2-acc1);
    font-variant-numeric: tabular-nums;
  }
  .legende { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .quoi { font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }

  /* Les barres RESPIRENT : une gouttière franche de 3 px.

     🔴 #1671 — la hauteur de la rangée est FIXE, et c'est ce qui dessine les
     barres. Elle valait `flex:1 1 auto; min-height:90px` : une hauteur que le
     bloc lui laissait, jamais DÉFINIE (le bloc n'a qu'un `min-height`). Or
     chaque barre porte sa valeur en `height: N %`, et un pourcentage d'une
     hauteur indéfinie se résout en `auto` — soit zéro pour un `<div>` vide.
     D'où la capture de Levente : « 108 Plays », 250 px de vide, aucune barre. */
  .barres {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    /* Design v3 (§9.2) : une aire de tracé de 128 à 152 px. */
    height: 140px;
    padding: 0 var(--bloc-marge, 30px);
    background: linear-gradient(var(--v2-line), var(--v2-line)) bottom / calc(100% - 2 * var(--bloc-marge, 30px)) 1px no-repeat;
  }
  .barre {
    flex: 1 1 0;
    min-width: 3px;
    background: var(--v2-acc1);
    border-radius: 3px 3px 0 0;
    min-height: 0;
    transition: opacity 0.15s;
  }
  .barre:hover { opacity: 0.65; }

  /* Les graduations, une par barre et alignées sur elles (même `flex`). */
  .ticks { display: flex; gap: 6px; padding: 6px var(--bloc-marge, 30px) 0; }
  .tick { flex: 1 1 0; min-width: 0; text-align: center; overflow: hidden; white-space: nowrap;
    font: 400 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3); }

  /* Tablette et mobile : la page perd ses gouttières de 30 px, comme le reste
     de `PageWidgets` (voir ses propres ruptures à 1024 et 640). Les barres se
     resserrent à 2 px et le grand nombre descend d'un cran — trente jours de
     barres tiennent dans 320 px de large sans déborder, parce qu'elles sont
     en `flex:1 1 0` et non en largeur fixe. */
  @media (max-width: 1024px) {
    .tete, .barres, .ticks { padding-left: var(--bloc-marge, 22px); padding-right: var(--bloc-marge, 22px); }
  }
  @media (max-width: 640px) {
    .tete, .barres, .ticks { padding-left: var(--bloc-marge, 16px); padding-right: var(--bloc-marge, 16px); }
    .grand { font-size: calc(26px * var(--v2-txt-echelle, 1)); }
    .barres, .ticks { gap: 3px; }
    .barres { height: 128px; }
  }
</style>
