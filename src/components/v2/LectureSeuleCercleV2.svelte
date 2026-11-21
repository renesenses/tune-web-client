<script lang="ts">
  // Tune Circle (19/11/2026) : la phrase de la lecture seule (profil non
  // administrateur, ou client distant), partagée par tous les écrans du cercle.
  import { t } from '../../lib/i18n';
  import { cercleLectureSeule, CLES_LECTURE_SEULE } from '../../lib/circleDroits';
</script>

{#if $cercleLectureSeule}
  <p class="note lecture-seule-cercle" role="status" data-lecture-seule={$cercleLectureSeule}>{$t(CLES_LECTURE_SEULE[$cercleLectureSeule] as any)}</p>
{/if}

<style>
  .lecture-seule-cercle{margin:0 0 12px; padding:8px 12px; border-radius:8px; border:1px solid var(--v2-border, rgba(127,127,127,.25)); color:var(--v2-txt2, inherit); font-size:calc(12px * var(--v2-txt-echelle, 1))}
</style>
