<script lang="ts">
  /**
   * web#1674 — le message du voile PURE, commun aux écrans Égaliseur et
   * Crossfeed. En mode PURE le serveur ne construit aucun traitement : le PCM
   * part intact. L'écran grise ses réglages (`<fieldset disabled>`) et dit
   * ici pourquoi, et comment en sortir.
   *
   * L'état PURE n'est PAS relu ici : c'est `audiophileEnabled`
   * (`stores/audiophile.ts`), le même que le bouton PURE de la barre de
   * lecture, que chaque écran passe à son fieldset.
   */
  import { t } from '../../lib/i18n';

  let { cle }: { cle: string } = $props();
</script>

<div class="voile-pur" role="note" data-voile-pur>
  <span class="badge">{$t('audiophile.pure' as any)}</span>
  <span>{$t(cle as any)} {$t('v2.pure.veilExit' as any)}</span>
</div>

<style>
  .voile-pur{display:flex; gap:10px; align-items:flex-start; padding:11px 14px; margin-bottom:16px;
    border-radius:10px; font-size:12.5px; line-height:1.5; color:var(--v2-txt2);
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .badge{flex:0 0 auto; font:700 10px var(--v2-mono); letter-spacing:.08em; color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); border-radius:var(--v2-r-pill); padding:2px 8px}
</style>
