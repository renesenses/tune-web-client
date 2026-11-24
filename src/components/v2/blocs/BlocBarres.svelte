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
  import VideBloc from './VideBloc.svelte';
  import { cleVide, ICONES } from '../../../lib/tableauDeBordPeriode';

  export interface MatiereBarres {
    /** `texte` remplace la valeur affichée (une durée, tune-server-rust#6682) ;
     *  la barre suit toujours `valeur`. */
    lignes: { label: string; valeur: number; texte?: string }[];
    /** Au-delà, la liste se replie derrière « voir plus ». 0 = jamais. */
    plafond?: number;
    /**
     * Design v3 (§9.5) — le libellé AU-DESSUS de sa barre (genres), le compte
     * au bout de la ligne de la barre. Sans lui : libellé, barre courte et
     * compte sur une ligne (zones, sources, radio).
     */
    empile?: boolean;
  }

  let { donnees }: { donnees: MatiereBarres | null } = $props();

  let tout = $state(false);

  const lignes = $derived(donnees?.lignes ?? []);
  const plafond = $derived(donnees?.plafond ?? 0);
  const visibles = $derived(plafond > 0 && !tout ? lignes.slice(0, plafond) : lignes);
  const empile = $derived(!!donnees?.empile);
  /**
   * L'échelle est LOCALE à la liste : `valeur / max`, zéro à l'origine. Un
   * maximum absent ou nul ne divise rien, et une valeur nulle n'a pas de
   * barre — mais garde son compte exact. Deux comptes égaux, deux longueurs
   * égales. Le plancher de 2 % ne vaut que pour une valeur POSITIVE, pour
   * qu'elle reste visible.
   */
  const max = $derived(visibles.length ? Math.max(0, ...visibles.map((l) => l.valeur)) : 0);
  const largeur = (v: number) => (max > 0 && v > 0 ? Math.max((v / max) * 100, 2) : 0);
</script>

{#if !lignes.length}
  <!-- #1781 — « aucun historique » était faux : ce bloc ne lit que les SEPT
       derniers jours (`PERIODE` de `tableauDeBordWidgets`). Une semaine
       vide ne dit rien de l'historique plus ancien. -->
  <VideBloc message={$t(cleVide() as any)} icone={ICONES.barres} />
{:else}
  <ul class="liste" class:empile>
    <!-- 🔴 #1763 — clé par RANG, jamais par libellé. `by_zone` est groupé par
         `zone_id` côté serveur : deux zones du même nom (« Cet ordinateur »
         sur deux machines, un DMP-A8 recréé) donnent deux lignes au même
         libellé. Une clé en double lève `each_key_duplicate` pendant le
         rendu, et l'erreur laisse l'ordonnanceur de Svelte bloqué : plus
         aucune mise à jour ne s'affiche, et la barre latérale ne fait plus
         changer de vue (FabienM, fil 2037). -->
    {#each visibles as l, i (i)}
      <li>
        <span class="nom" title={l.label}>{l.label}</span>
        <span class="piste">
          <span class="jauge" style:width="{largeur(l.valeur)}%"></span>
        </span>
        <span class="val">{l.texte ?? l.valeur}</span>
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

  .liste { list-style: none; margin: 0; padding: 0 var(--bloc-marge, 30px); display: flex; flex-direction: column; gap: 7px; }
  .liste li { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .nom {
    flex: 0 0 116px; min-width: 0; font: 400 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt);
    overflow-wrap: anywhere;
  }
  /* Design v3 (§9.3) : des barres de 6 à 8 px, arrondies ; le rail est une
     teinte de l'accent tirée des jetons. */
  .piste {
    flex: 1 1 auto; height: 7px; border-radius: 4px; overflow: hidden;
    background: color-mix(in srgb, var(--v2-acc1) 12%, transparent);
  }
  .jauge { display: block; height: 100%; border-radius: 4px; background: var(--v2-acc1); }

  /* Empilé (genres) : le libellé passe au-dessus, sur toute la largeur, et
     peut se replier ; la barre et le compte partagent la ligne du dessous. */
  .liste.empile { gap: 10px; }
  .liste.empile li { flex-wrap: wrap; row-gap: 4px; }
  .liste.empile .nom { flex: 1 0 100%; white-space: normal; overflow-wrap: anywhere; }
  .liste.empile .piste { flex: 1 1 0; }
  /* La valeur ne se coupe jamais (« 84 h 48 » sur deux lignes, vérification
     du 15/11 sur le .18) : elle prend sa largeur, la barre cède la place. */
  .val {
    flex: 0 0 auto; min-width: 36px; white-space: nowrap; text-align: right; font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    color: var(--v2-txt2); font-variant-numeric: tabular-nums;
  }

  .plus {
    margin: 12px var(--bloc-marge, 30px) 0; padding: 5px 13px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--v2-acc1) 32%, transparent);
    background: none; color: var(--v2-txt2); font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor: pointer;
  }
  .plus:hover { border-color: var(--v2-acc1); color: var(--v2-txt); }

  @media (max-width: 1024px) { .liste { padding-left: var(--bloc-marge, 22px); padding-right: var(--bloc-marge, 22px); } .plus { margin-left: var(--bloc-marge, 22px); } }
  @media (max-width: 640px) {
    .liste { padding-left: var(--bloc-marge, 16px); padding-right: var(--bloc-marge, 16px); }
    .plus { margin-left: var(--bloc-marge, 16px); }
    /* Un libellé sur 116 px ne laisse plus de place à la barre sur un
       téléphone : il se réduit, la barre garde le reste. */
    .liste:not(.empile) .nom { flex-basis: 84px; }
    .nom { font-size: calc(12px * var(--v2-txt-echelle, 1)); }
  }
</style>
