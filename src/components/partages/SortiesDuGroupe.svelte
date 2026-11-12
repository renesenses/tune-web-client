<script lang="ts">
  /**
   * tune-server-rust#8419 — sous les étapes du chemin du signal : en lecture
   * groupée, chaque sortie du groupe et ce qu'elle reçoit (son étage final).
   * Rien hors groupe, ni face à un serveur qui ne publie pas le champ.
   */
  import { t } from '../../lib/i18n';
  import { sortiesDuGroupe, etageFinal } from '../../lib/sortiesDuGroupe';
  import type { SignalPath } from '../../lib/types';

  let { signalPath }: { signalPath: SignalPath | null | undefined } = $props();

  let sorties = $derived(sortiesDuGroupe(signalPath));
</script>

{#if sorties.length}
  <div class="sdg" data-sorties-du-groupe={sorties.length}>
    <p class="sdg-titre">{$t('signal.groupOutputs' as any).replace('{n}', String(sorties.length))}</p>
    <ul>
      {#each sorties as s (s.zone_id)}
        <li data-sortie-du-groupe={s.zone_id} class:ici={s.this_zone}>
          <span class="sdg-point" class:bp={s.bit_perfect === true}></span>
          <span class="sdg-nom">{s.name}{#if s.this_zone} <em>{$t('signal.groupThisOutput' as any)}</em>{/if}</span>
          <span class="sdg-etage">
            {#if s.state !== 'playing' && s.state !== 'paused'}
              {$t('signal.groupOutputIdle' as any)}
            {:else}
              {etageFinal(s) ?? $t('signal.unknownFormat' as any)}
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .sdg{margin-top:10px; padding-top:8px; border-top:1px solid var(--v2-line)}
  .sdg-titre{margin:0 0 6px; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px}
  li{display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  li.ici .sdg-nom{font-weight:600}
  .sdg-nom em{font-style:normal; color:var(--v2-txt3)}
  .sdg-etage{color:var(--v2-txt3)}
  .sdg-point{width:7px; height:7px; border-radius:50%; background:var(--v2-txt3); flex:none; align-self:center}
  .sdg-point.bp{background:var(--v2-acc1)}
</style>
