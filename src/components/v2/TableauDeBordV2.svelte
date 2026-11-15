<script lang="ts">
  /**
   * LE TABLEAU DE BORD — une `PageWidgets` nourrie d'un catalogue de BLOCS.
   *
   * Chantier de Bertrand, 25/09/2026. Comme `HomeV2` et comme les écrans
   * éditoriaux Qobuz et Tidal, cet écran n'est qu'une instance du moteur de
   * widgets : chargement paresseux, mode édition, disposition rangée par
   * profil — rien de tout cela n'est écrit ici.
   *
   * Ce qui le distingue des trois autres est son catalogue, et lui seul : onze
   * widgets `forme: 'bloc'`, la seconde forme ouverte le 25/09. La règle
   * « tous horizontaux » du 02/09 continue de tenir sur l'Accueil, Qobuz et
   * Tidal — voir `__tests__/blocsHorsAccueilQobuzTidal.test.ts`.
   *
   * ## Les clés de rangement
   *
   * Trois clés qui n'appartiennent qu'à cet écran. Sans cela, composer le
   * tableau de bord déferait l'accueil — c'est la raison d'être du paramètre
   * `cle` depuis le premier jour.
   *
   * ⚠️ `cleChiffres` est passée bien qu'aucun bloc ne soit `forme: 'chiffres'`
   * aujourd'hui : elle est lue AU CHARGEMENT par `PageWidgets`, avant même de
   * savoir ce que contient le catalogue. Sans clé propre, cet écran lirait et
   * RÉÉCRIRAIT la ligne de chiffres de l'accueil (`home_stats`) à chaque
   * enregistrement de disposition. Le défaut est exactement celui de #1519,
   * pris à l'envers.
   *
   * ## L'ancien écran n'est pas supprimé
   *
   * `v2-heritage/DashboardView.svelte` reste monté sur la vue `dashboard` et
   * reste atteignable par son adresse `#dashboard` — il sert de référence, il
   * garde le sélecteur de période et l'export CSV que cet écran-ci n'a pas
   * encore, et c'est lui qui porte le rendu d'origine. Il était DÉJÀ hors du
   * menu depuis la 0.9.161 (PR #1415) ; rien n'a été retiré pour ce lot.
   */
  import PageWidgets from './PageWidgets.svelte';
  import {
    BLOCS_TABLEAU_DE_BORD,
    DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
  } from '../../lib/tableauDeBordWidgets';
  import type { DashboardPeriod } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import {
    PERIODES,
    choisirPeriode,
    clePeriode,
    delaiPour,
    periodeActive,
  } from '../../lib/tableauDeBordPeriode';

  /*
   * MAQUETTE « MY LISTENING » DE LEVENTE (rc12, Figma 615:5809).
   *
   * La période revient dans l'en-tête, à côté de « Modifier ». Changer de
   * période REMONTE la page (`{#key}`) : chaque bloc recharge sur la nouvelle
   * période et son message vide la nomme. Rien n'est enregistré : l'écran
   * rouvre sur sept jours, la requête partagée avec l'accueil.
   */
  let periode = $state<DashboardPeriod>(periodeActive());

  function changer(p: DashboardPeriod) {
    choisirPeriode(p);
    periode = periodeActive();
  }
</script>

{#snippet choixPeriode()}
  <label class="v2-btn periode" title={$t('dashboard.periodChoice' as any)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
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
    cleTitre="dashboard.title"
    grille
    grilleFluide
    delaiMs={delaiPour(periode)}
    actionsEntete={choixPeriode}
  />
{/key}

<style>
  /* Le menu natif garde le clavier et le lecteur d'écran ; il prend l'habit
     des boutons de l'en-tête (`v2-btn`), sans couleur propre. */
  .periode { position: relative; cursor: pointer; }
  .periode select {
    appearance: none; -webkit-appearance: none; border: 0; background: transparent;
    color: inherit; font: inherit; padding: 0 16px 0 0; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: right 5px center, right 0 center; background-size: 5px 5px; background-repeat: no-repeat;
  }
  .periode select:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 3px; border-radius: 4px; }
  .periode option { color: var(--v2-txt); background: var(--v2-surface); }
</style>
