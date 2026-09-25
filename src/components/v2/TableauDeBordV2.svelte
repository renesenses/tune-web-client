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
</script>

<PageWidgets
  catalogue={BLOCS_TABLEAU_DE_BORD}
  dispositionDefaut={DISPOSITION_DEFAUT_TABLEAU_DE_BORD}
  cle="tableau_de_bord_widgets"
  cleChiffres="tableau_de_bord_stats"
  cleChiffresMigre="tableau_de_bord_stats_migre"
  cleTitre="dashboard.title"
/>
