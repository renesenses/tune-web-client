<script lang="ts">
  /**
   * Le panneau ZONES de la vue mini (maquette A3) : une carte par zone, son
   * type de sortie, son état, ce qui joue, et son volume.
   *
   * La zone CHOISIE porte le curseur de volume complet (`VolumeControl`, en
   * dB, avec ses limites et ses verrous PURE). Les autres montrent leur volume
   * en lecture : `VolumeControl` ne pilote que la zone courante, et un second
   * curseur réécrit ici en contournerait les gardes. Toucher une carte la
   * choisit — et son curseur apparaît.
   */
  import VolumeControl from '../../partages/VolumeControl.svelte';
  import { zones, currentZoneId, switchZone } from '../../../lib/stores/zones';
  import { zoneTypeLabel, zoneDeviceName } from '../../../lib/zoneIdentity';
  import { gainDeLaZone } from '../../../lib/courbeDeVolume';
  import { formaterDb } from '../../../lib/volumeDb';
  import { feuilleMini } from '../../../lib/vueMini';
  import { t } from '../../../lib/i18n';
  import { bulleTexte } from '../../../lib/infobulleTexte';
  import type { Zone } from '../../../lib/types';

  function volumeLu(z: Zone): string {
    if (typeof z.volume !== 'number') return '';
    return `${formaterDb(gainDeLaZone(z, z.volume))} dB`;
  }

  async function choisir(z: Zone) {
    if (z.id == null || z.id === $currentZoneId) return;
    await switchZone(z.id);
  }
</script>

<div class="zones" data-zones-mini>
  {#each $zones as z (z.id)}
    {@const choisie = z.id === $currentZoneId}
    <div class="carte" class:choisie data-zone-mini={z.id}>
      <button class="tete" onclick={() => choisir(z)} aria-pressed={choisie}>
        <span class="nom" use:bulleTexte>{z.name}</span>
        {#if z.output_type}<span class="type">{zoneTypeLabel(z.output_type)}</span>{/if}
        <span class="etat" class:joue={z.state === 'playing'}>{z.state === 'playing' || z.state === 'paused' || z.state === 'stopped' ? $t(`zone.${z.state}` as any) : ''}</span>
      </button>
      <div class="detail" use:bulleTexte>{[zoneDeviceName(z), z.current_track?.title].filter(Boolean).join(' · ')}</div>
      {#if choisie}
        <VolumeControl enDb />
      {:else if volumeLu(z)}
        <div class="vol-lu">{volumeLu(z)}</div>
      {/if}
    </div>
  {/each}
  <button class="fin" onclick={() => feuilleMini.set(null)}>{$t('common.close' as any)}</button>
</div>

<style>
  .zones{display:flex; flex-direction:column; gap:8px; padding:4px 12px 12px; font-family:var(--v2-sans)}
  .carte{padding:10px 12px; border-radius:10px; background:var(--v2-surface); border:1px solid var(--v2-line2)}
  .carte.choisie{border-color:var(--v2-acc1); box-shadow:0 0 0 1px var(--v2-acc1) inset}
  .tete{width:100%; display:flex; align-items:center; gap:8px; border:0; background:none; padding:0; cursor:pointer;
    color:var(--v2-txt); text-align:left}
  .nom{font-size:13.5px; font-weight:700; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .type{font-size:10.5px; color:var(--v2-txt3); padding:1px 6px; border:1px solid var(--v2-line2); border-radius:4px; flex:0 0 auto}
  .etat{margin-left:auto; font-size:11px; color:var(--v2-txt2); flex:0 0 auto}
  .etat.joue{color:var(--v2-acc1)}
  .detail{font-size:11.5px; color:var(--v2-txt2); margin:4px 0 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .vol-lu{font:600 11.5px var(--v2-mono); color:var(--v2-txt2); text-align:right}
  .fin{align-self:center; margin-top:4px; padding:6px 14px; border-radius:20px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt2); cursor:pointer; font:500 12px var(--v2-sans)}
</style>
