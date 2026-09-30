<script lang="ts">
  // tune-server-rust#5353 — badge et note d'une zone jouée hors du backend
  // choisi. La règle vit dans `lib/zoneHorsBackend` ; ce composant ne fait que
  // la dessiner, pareil dans la grille et dans la liste.
  import { t } from '../../lib/i18n';
  import type { Zone } from '../../lib/types';
  import { signalementHorsBackend } from '../../lib/zoneHorsBackend';

  let { zone }: { zone: Zone } = $props();
  const signalement = $derived(signalementHorsBackend(zone));
</script>

{#if signalement}
  <span class="hb" data-hors-backend
    title={signalement.noteAsio ? $t('v2.zone.horsBackendAsio' as any) : undefined}>{signalement.badge}</span>
  {#if signalement.noteAsio}
    <span class="hbnote">{$t('v2.zone.horsBackendAsio' as any)}</span>
  {/if}
{/if}

<style>
  /* Même pastille que `.rc.warn` de ZonesV2 (#1006), dont le style est scopé. */
  .hb{font:10px var(--v2-mono); padding:2px 8px; border-radius:999px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); white-space:nowrap}
  .hbnote{font-size:11px; font-family:var(--v2-sans); color:var(--v2-txt2); flex-basis:100%}
</style>
