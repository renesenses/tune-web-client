<script lang="ts">
  /**
   * LA LISTE DE BARRES — un libellé, une barre, une valeur.
   *
   * UN seul composant pour TROIS blocs : genres par branche, par zone, par
   * source. Les trois avaient exactement le même balisage dans l'ancien
   * Tableau de bord (`.bar-list` / `.bar-track` / `.bar-fill`) ; en faire
   * trois composants aurait été trois occasions de diverger au premier
   * ajustement.
   *
   * L'intensité ne varie pas ici : c'est la LONGUEUR qui porte la valeur, et
   * la teinte reste unique. Même principe, autre dimension.
   */
  import { t } from '../../../lib/i18n';

  export interface MatiereBarres {
    lignes: { label: string; valeur: number }[];
    /** Au-delà, la liste se replie derrière « voir plus ». 0 = jamais. */
    plafond?: number;
  }

  let { donnees }: { donnees: MatiereBarres | null } = $props();

  let tout = $state(false);

  const lignes = $derived(donnees?.lignes ?? []);
  const plafond = $derived(donnees?.plafond ?? 0);
  const visibles = $derived(plafond > 0 && !tout ? lignes.slice(0, plafond) : lignes);
  const max = $derived(visibles.length ? Math.max(...visibles.map((l) => l.valeur)) : 0);
</script>

{#if !lignes.length}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <ul class="liste">
    {#each visibles as l (l.label)}
      <li>
        <span class="nom" title={l.label}>{l.label}</span>
        <span class="piste">
          <span class="jauge" style:width="{max ? Math.max((l.valeur / max) * 100, 2) : 0}%"></span>
        </span>
        <span class="val">{l.valeur}</span>
      </li>
    {/each}
  </ul>
  {#if plafond > 0 && lignes.length > plafond}
    <button class="plus" onclick={() => (tout = !tout)}>
      {tout
        ? $t('dashboard.showLess' as any)
        : $t('dashboard.showMoreGenres' as any).replace('{n}', String(lignes.length - plafond))}
    </button>
  {/if}
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .liste { list-style: none; margin: 0; padding: 0 30px; display: flex; flex-direction: column; gap: 7px; }
  .liste li { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .nom {
    flex: 0 0 116px; min-width: 0; font: 400 13px var(--v2-sans); color: var(--v2-txt);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .piste {
    flex: 1 1 auto; height: 9px; border-radius: 5px; overflow: hidden;
    background: color-mix(in srgb, var(--v2-acc1) 12%, transparent);
  }
  .jauge { display: block; height: 100%; border-radius: 5px; background: var(--v2-acc1); }
  .val {
    flex: 0 0 48px; text-align: right; font: 500 12px var(--v2-sans);
    color: var(--v2-txt2); font-variant-numeric: tabular-nums;
  }

  .plus {
    margin: 12px 30px 0; padding: 5px 13px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--v2-acc1) 32%, transparent);
    background: none; color: var(--v2-txt2); font: 500 12px var(--v2-sans); cursor: pointer;
  }
  .plus:hover { border-color: var(--v2-acc1); color: var(--v2-txt); }

  @media (max-width: 1024px) { .liste { padding-left: 22px; padding-right: 22px; } .plus { margin-left: 22px; } }
  @media (max-width: 640px) {
    .liste { padding-left: 16px; padding-right: 16px; }
    .plus { margin-left: 16px; }
    /* Un libellé sur 116 px ne laisse plus de place à la barre sur un
       téléphone : il se réduit, la barre garde le reste. */
    .nom { flex-basis: 84px; font-size: 12px; }
    .val { flex-basis: 36px; }
  }
</style>
