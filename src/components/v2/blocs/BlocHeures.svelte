<script lang="ts">
  /**
   * L'HEURE DE LA JOURNÉE — un histogramme de vingt-quatre barres.
   *
   * Design v3 de Levente (§9.4) : la rangée de cases dont l'OPACITÉ portait
   * la valeur (le rendu de l'ancien Tableau de bord) devient un histogramme
   * VERTICAL — la hauteur porte la valeur, la teinte reste unique. Le jeu de
   * données et le calcul de la pointe ne changent pas : vingt-quatre valeurs
   * indexées par l'heure, la pointe est la PREMIÈRE heure qui porte le
   * maximum (même règle d'égalité qu'avant).
   *
   * « Les chiffres avant les axes » : l'heure de POINTE est annoncée en grand
   * au-dessus du tracé, avec « Heure de pointe » à côté. Une plage tout à
   * zéro est une vraie plage VIDE : aucune pointe n'est mise en avant.
   *
   * Les comptes exacts restent accessibles : infobulle par barre, et une
   * liste lue par les lecteurs d'écran (les heures écoutées seulement).
   */
  import { t } from '../../../lib/i18n';
  import VideBloc from './VideBloc.svelte';
  import { cleVide, heureDePointe, ICONES } from '../../../lib/tableauDeBordPeriode';

  export interface MatiereHeures {
    /** Vingt-quatre valeurs, indexées par l'heure. Une heure sans écoute vaut 0. */
    parHeure: number[];
  }

  let { donnees }: { donnees: MatiereHeures | null } = $props();

  const parHeure = $derived(donnees?.parHeure ?? []);
  const max = $derived(parHeure.length ? Math.max(...parHeure) : 0);
  /** L'heure qui porte le maximum — `-1` quand rien n'a été écouté. */
  const pointe = $derived(heureDePointe(parHeure));
  const bulle = (h: number, plays: number) =>
    $t('dashboard.hour.tip' as any).replace('{hour}', String(h)).replace('{plays}', String(plays));
</script>

{#if !parHeure.length}
  <!-- #1781 — « aucun historique » était faux : ce bloc ne lit que la période
       choisie. Une plage vide ne dit rien de l'historique plus ancien. -->
  <VideBloc message={$t(cleVide() as any)} icone={ICONES.durees} />
{:else}
  {#if max > 0}
    <div class="tete">
      <div class="grand">{pointe}h</div>
      <span class="quoi">{$t('dashboard.peakListeningTime' as any)}</span>
    </div>
  {/if}
  <div class="cadre">
    <div class="histo" aria-hidden="true">
      {#each parHeure as plays, h (h)}
        <div class="col" title={bulle(h, plays)}>
          <div
            class="barre"
            class:pointe={h === pointe}
            style:height="{max ? Math.max((plays / max) * 100, plays ? 3 : 0) : 0}%"
          ></div>
        </div>
      {/each}
    </div>
    <div class="ticks" aria-hidden="true">
      {#each parHeure as _, h (h)}
        <span class="tick" class:tiers={h % 3 === 0}>{h}</span>
      {/each}
    </div>
  </div>
  {#if max > 0}
    <ul class="lecteur">
      {#each parHeure as plays, h (h)}
        {#if plays > 0}<li>{bulle(h, plays)}</li>{/if}
      {/each}
    </ul>
  {:else}
    <p class="pied">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">{@html ICONES.durees}</svg>
      {$t(cleVide() as any)}
    </p>
  {/if}
{/if}

<style>
  .pied { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0 0;
    padding: 0 var(--bloc-marge, 30px); color: var(--v2-txt3); font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); text-align: center; }
  .pied svg { width: 16px; height: 16px; flex: 0 0 auto; }

  .tete { display: flex; align-items: baseline; gap: 10px; padding: 0 var(--bloc-marge, 30px) 12px; flex-wrap: wrap; }
  .grand {
    font: 700 calc(30px * var(--v2-txt-echelle, 1))/1 var(--v2-sans); letter-spacing: -0.5px;
    color: var(--v2-acc1); font-variant-numeric: tabular-nums;
  }
  .quoi { font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); }

  /* Vingt-quatre colonnes ÉGALES (`minmax(0, 1fr)`) : le tracé se comprime
     au lieu de déborder de sa carte, et les vingt-quatre positions restent. */
  .cadre { container-type: inline-size; padding: 0 var(--bloc-marge, 30px); }
  .histo {
    display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; align-items: end;
    height: 140px;
    border-bottom: 1px solid var(--v2-line2);
  }
  .col { height: 100%; display: flex; align-items: flex-end; min-width: 0; }
  .barre { width: 100%; background: var(--v2-acc1); border-radius: 2px 2px 0 0; opacity: 0.85; }
  /* La pointe se lit à sa HAUTEUR et au chiffre en grand ; elle est pleine,
     les autres légèrement effacées — jamais une seconde teinte. */
  .barre.pointe { opacity: 1; }

  .ticks { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; padding-top: 5px; }
  .tick { min-width: 0; text-align: center; overflow: hidden; white-space: nowrap;
    font: 400 calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3); font-variant-numeric: tabular-nums; }
  /* Étroit : une heure sur trois garde son chiffre, les vingt-quatre
     positions restent. */
  @container (max-width: 420px) { .tick:not(.tiers) { visibility: hidden; } }

  .lecteur { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  @media (max-width: 640px) {
    .tete, .cadre { padding-left: var(--bloc-marge, 16px); padding-right: var(--bloc-marge, 16px); }
    .grand { font-size: calc(26px * var(--v2-txt-echelle, 1)); }
    .histo, .ticks { gap: 2px; }
    .histo { height: 128px; }
  }
</style>
