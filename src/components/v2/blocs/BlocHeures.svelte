<script lang="ts">
  /**
   * L'HISTOGRAMME HORAIRE — vingt-quatre cases dont l'OPACITÉ porte la valeur.
   *
   * C'est le rendu de l'ancien Tableau de bord, repris tel quel
   * (`DashboardView.svelte:598-612`) : `style:opacity={0.15 + intensite *
   * 0.85}` sur une case de teinte unique. Aucun graphique n'est dessiné, il
   * n'y a ni `<svg>` ni `<canvas>` — et c'est précisément le principe que
   * Bertrand veut voir tenir sur tout l'écran : l'intensité dit la valeur, la
   * teinte ne change pas.
   *
   * « Les chiffres avant les axes » : l'heure de POINTE est annoncée en grand
   * au-dessus de la rangée, parce que c'est la seule chose qu'on vient
   * chercher ici. La rangée, elle, donne la forme de la journée.
   */
  import { t } from '../../../lib/i18n';

  export interface MatiereHeures {
    /** Vingt-quatre valeurs, indexées par l'heure. Une heure sans écoute vaut 0. */
    parHeure: number[];
  }

  let { donnees }: { donnees: MatiereHeures | null } = $props();

  const parHeure = $derived(donnees?.parHeure ?? []);
  const max = $derived(parHeure.length ? Math.max(...parHeure) : 0);
  /** L'heure qui porte le maximum — `-1` quand rien n'a été écouté. */
  const pointe = $derived(max > 0 ? parHeure.indexOf(max) : -1);
</script>

{#if !parHeure.length || max === 0}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="tete">
    <div class="grand">{pointe}h</div>
    <span class="quoi">{$t('dashboard.section.hourly' as any)}</span>
  </div>
  <div class="rangee">
    {#each parHeure as plays, h (h)}
      <div
        class="case"
        class:pointe={h === pointe}
        title={$t('dashboard.hour.tip' as any).replace('{hour}', String(h)).replace('{plays}', String(plays))}
        style:opacity={0.15 + (max ? plays / max : 0) * 0.85}
      >
        <span class="h">{h}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .tete { display: flex; align-items: baseline; gap: 12px; padding: 0 30px 12px; }
  .grand {
    font: 700 32px/1 var(--v2-sans); letter-spacing: -1px;
    color: var(--v2-acc1); font-variant-numeric: tabular-nums;
  }
  .quoi { font: 600 13px var(--v2-sans); color: var(--v2-txt2); }

  /* Vingt-quatre colonnes ÉGALES : `1fr` et non une largeur fixe, donc la
     rangée se comprime au lieu de déborder sur un téléphone. */
  .rangee { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; padding: 0 30px; }
  .case {
    aspect-ratio: 1; background: var(--v2-acc1); border-radius: 4px;
    display: grid; place-items: center;
  }
  /* L'heure de pointe est CERNÉE, pas recolorée : une seconde teinte ferait
     le « tableau de bord d'aéroport » que Bertrand refuse. */
  .case.pointe { outline: 2px solid var(--v2-acc1); outline-offset: 2px; }
  .h { font: 600 9px var(--v2-sans); color: var(--v2-on-acc); opacity: 0.75; }

  @media (max-width: 1024px) {
    .tete, .rangee { padding-left: 22px; padding-right: 22px; }
  }
  @media (max-width: 640px) {
    .tete, .rangee { padding-left: 16px; padding-right: 16px; }
    .grand { font-size: 26px; }
    .rangee { gap: 2px; }
    /* Sous 640 px, 24 chiffres dans 288 px feraient 12 px par case : le
       chiffre devient illisible et sale. On le retire, l'infobulle reste. */
    .h { display: none; }
  }
</style>
