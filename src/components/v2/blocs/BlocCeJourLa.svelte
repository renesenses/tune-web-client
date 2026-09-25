<script lang="ts">
  /**
   * CE JOUR-LÀ — ce qu'on écoutait à la même date, les années d'avant.
   *
   * Rendu repris de `.otd-list` de l'ancien Tableau de bord : l'année à
   * l'accent, puis le titre et l'artiste. Huit lignes au plus, comme avant.
   *
   * ⚠️ Les lignes ne sont pas cliquables ici, et c'était déjà à moitié vrai
   * avant : `openTrack(null, …)` sortait immédiatement sur `if (!trackId)
   * return` — le clic de l'ancien écran ne faisait donc RIEN. On n'emporte
   * pas un geste mort dans le neuf ; `on_this_day` ne porte ni `track_id` ni
   * `source_id` (voir `api.ts`, `DashboardData.on_this_day`), il n'y a donc
   * rien sur quoi brancher une lecture. Dit ici, pas corrigé : ce serait un
   * changement serveur.
   */
  import { t } from '../../../lib/i18n';

  export interface MatiereCeJourLa {
    lignes: { annee: number | null; titre: string; artiste: string | null }[];
  }

  let { donnees }: { donnees: MatiereCeJourLa | null } = $props();

  const lignes = $derived(donnees?.lignes ?? []);
</script>

{#if !lignes.length}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <ul class="liste">
    {#each lignes as l, i (`${i}-${l.titre}`)}
      <li>
        <span class="an">{l.annee ?? '—'}</span>
        <span class="tit" title={l.titre + (l.artiste ? ` — ${l.artiste}` : '')}>
          {l.titre}{#if l.artiste}<span class="sub"> — {l.artiste}</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .liste { list-style: none; margin: 0; padding: 0 30px; display: flex; flex-direction: column; gap: 5px; }
  .liste li { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .an {
    flex: 0 0 42px; font: 600 12px var(--v2-sans); color: var(--v2-acc1);
    font-variant-numeric: tabular-nums;
  }
  .tit {
    flex: 1 1 auto; min-width: 0; font: 400 14px var(--v2-sans); color: var(--v2-txt);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sub { color: var(--v2-txt2); font-size: 12px; }

  @media (max-width: 1024px) { .liste { padding-left: 22px; padding-right: 22px; } }
  @media (max-width: 640px) { .liste { padding-left: 16px; padding-right: 16px; } .an { flex-basis: 36px; } }
</style>
