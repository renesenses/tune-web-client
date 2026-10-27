<script lang="ts">
  /**
   * « Metadata+ » (web#2443, demande de Rémi) : la station a une
   * `radio_metadata_key` — radio-metadata.fr publie son titre et son artiste
   * en cours. Le même badge dans la liste, sur la fiche et dans « En cours de
   * lecture ».
   */
  import { t } from '../../lib/i18n';
</script>

<span class="mdp" title={$t('v2.radio.metadataPlusTip' as any)}>{$t('v2.radio.metadataPlus' as any)}</span>

<style>
  .mdp{display:inline-block; flex:none; padding:1px 6px; border-radius:var(--v2-r-pill, 999px);
    border:1px solid var(--v2-acc2, currentColor); color:var(--v2-acc2, currentColor);
    font:700 9.5px/1.5 var(--v2-mono, monospace); letter-spacing:.02em; white-space:nowrap; vertical-align:middle}
</style>
