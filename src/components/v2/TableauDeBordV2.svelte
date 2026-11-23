<script lang="ts">
  /**
   * LE TABLEAU DE BORD — une `PageWidgets` nourrie d'un catalogue de BLOCS.
   *
   * Chantier de Bertrand, 25/09/2026. Comme `HomeV2` et comme les écrans
   * éditoriaux Qobuz et Tidal, cet écran n'est qu'une instance du moteur de
   * widgets : chargement paresseux, mode édition, disposition rangée par
   * profil — rien de tout cela n'est écrit ici.
   *
   * Ce qui le distingue est son catalogue de widgets `forme: 'bloc'` (la règle
   * « tous horizontaux » tient ailleurs : `blocsHorsAccueilQobuzTidal.test.ts`)
   * et ses trois clés de rangement, propres pour ne pas défaire l'accueil.
   *
   * ⚠️ `cleChiffres` est passée bien qu'aucun bloc ne soit `forme: 'chiffres'`
   * aujourd'hui : elle est lue AU CHARGEMENT par `PageWidgets`, avant même de
   * savoir ce que contient le catalogue. Sans clé propre, cet écran lirait et
   * RÉÉCRIRAIT la ligne de chiffres de l'accueil (`home_stats`) à chaque
   * enregistrement de disposition. Le défaut est exactement celui de #1519,
   * pris à l'envers.
   *
   * L'ancien écran (`v2-heritage/DashboardView.svelte`, `#dashboard`) reste
   * monté : il garde l'export CSV. Design v3 (22/11/2026) : en-tête, bandes et
   * carte groupée — voir `PageWidgets` (`groupes`) et `tableauDeBordWidgets`.
   */
  import PageWidgets from './PageWidgets.svelte';
  import {
    AJOUTS_TABLEAU_DE_BORD,
    BLOCS_TABLEAU_DE_BORD,
    DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
    GROUPES_TABLEAU_DE_BORD,
  } from '../../lib/tableauDeBordWidgets';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import type { DashboardPeriod } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import {
    PERIODES,
    PERIODE_DEFAUT,
    choisirPeriode,
    clePeriode,
    delaiPour,
    periodeActive,
  } from '../../lib/tableauDeBordPeriode';

  // Maquette « My listening » de Levente (rc12, Figma 615:5809) : la période
  // dans l'en-tête ; la changer remonte la page (`{#key}`). `active` est une
  // variable de module : remise à sept jours à chaque montage.
  choisirPeriode(PERIODE_DEFAUT);
  let periode = $state<DashboardPeriod>(periodeActive());

  function changer(p: DashboardPeriod) {
    choisirPeriode(p);
    periode = periodeActive();
  }
</script>

{#snippet choixPeriode()}
  <label class="v2-btn periode" data-tdb-periode title={$t('dashboard.periodChoice' as any)}>
    <CalendarDays size={16} strokeWidth={1.8} aria-hidden="true" />
    <select
      aria-label={$t('dashboard.periodChoice' as any)}
      value={periode}
      onchange={(e) => changer((e.currentTarget as HTMLSelectElement).value as DashboardPeriod)}
    >
      {#each PERIODES as p (p)}
        <option value={p}>{$t(clePeriode(p) as any)}</option>
      {/each}
    </select>
  </label>
{/snippet}

{#key periode}
  <PageWidgets
    catalogue={BLOCS_TABLEAU_DE_BORD}
    dispositionDefaut={DISPOSITION_DEFAUT_TABLEAU_DE_BORD}
    cle="tableau_de_bord_widgets"
    cleChiffres="tableau_de_bord_stats"
    cleChiffresMigre="tableau_de_bord_stats_migre"
    ajoutsUniques={AJOUTS_TABLEAU_DE_BORD}
    cleEyebrow="dashboard.eyebrow"
    cleTitre="dashboard.title"
    cleSous="dashboard.subtitle"
    groupes={GROUPES_TABLEAU_DE_BORD}
    grille
    grilleFluide
    delaiMs={delaiPour(periode)}
    actionsEntete={choixPeriode}
  />
{/key}

<style>
  /* Menu natif (clavier, lecteur d'écran) à l'habit de `v2-btn`. */
  .periode { position: relative; cursor: pointer; }
  .periode select {
    appearance: none; -webkit-appearance: none; border: 0; background: transparent;
    color: inherit; font: inherit; padding: 0 16px 0 0; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: right 5px center, right 0 center; background-size: 5px 5px; background-repeat: no-repeat;
  }
  .periode select:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 3px; border-radius: 4px; }
  .periode option { color: var(--v2-txt); background: var(--v2-surface); }
  /* Vérification du 15/11 sur le .18 : sur téléphone, la période et
     « Modifier » chevauchaient le titre ; ils passent dessous (cet écran seul). */
  /* Sans enveloppe : une boîte autour de PageWidgets la rétrécissait (.18). */
  /* Design v3 (§9.2) : l'en-tête s'aligne sur le cadre centré de 1 100 px
     des bandes ; la réserve de droite reste `--v2-grappe-w`. */
  :global(.v2-top:has([data-tdb-periode])) {
    padding-left: max(30px, calc((100% - 1100px) / 2));
    flex-wrap: wrap;
  }
  /* Sur-titre en capitales par la feuille, jamais dans la chaîne. */
  :global(.v2-top:has([data-tdb-periode]) .v2-eyebrow) { text-transform: uppercase; }
  @media (max-width: 640px) {
    :global(.v2-top:has([data-tdb-periode])) { flex-wrap: wrap; align-items: flex-start; padding-left: 12px; }
    :global(.v2-top:has([data-tdb-periode]) .v2-titres) { flex: 1 0 100%; }
    :global(.v2-top:has([data-tdb-periode]) .v2-actions) { flex: 1 0 100%; justify-content: flex-start; }
  }
</style>
