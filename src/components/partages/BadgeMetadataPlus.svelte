<script lang="ts">
  /**
   * « Metadata+ » (web#2443, demande de Rémi) : la station a une
   * `radio_metadata_key` — radio-metadata.fr publie son titre et son artiste
   * en cours. Le même badge dans la liste, sur la fiche et dans « En cours de
   * lecture ».
   *
   * Retour de Rémi sur la rc12 (go de Bertrand du 17/11) : PLUS DE CADRE. Un
   * libellé encadré se lit comme un bouton, et le badge ne se clique pas ;
   * dans le filtre Metadata+, le cadre du badge s'ajoutait à celui du bouton
   * (double cadre). Il reste un mot, à la couleur d'accent. Le futur badge
   * Cover+ suivra la même règle.
   */
  import { t } from '../../lib/i18n';
</script>

<span class="mdp" title={$t('v2.radio.metadataPlusTip' as any)}>{$t('v2.radio.metadataPlus' as any)}</span>

<style>
  .mdp{display:inline-block; flex:none; padding:0; border:0; background:none; color:var(--v2-acc2, currentColor);
    font:700 calc(9.5px * var(--v2-txt-echelle, 1))/1.5 var(--v2-mono, monospace); letter-spacing:.02em; white-space:nowrap; vertical-align:middle}
</style>
