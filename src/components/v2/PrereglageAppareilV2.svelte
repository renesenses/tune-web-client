<script lang="ts">
  /**
   * Préréglage communautaire d'un appareil (#1743) — portage de
   * `DevicesSettings`, que la phase 5 supprime.
   *
   * Proposé SEULEMENT quand l'appareil de la zone est identifié (marque ET
   * modèle), que la zone n'a encore AUCUN réglage de rendu local, et qu'au
   * moins trois installations concordent. Jamais d'application automatique :
   * un bouton, un PATCH (`applyZoneDevicePreset`, qui ne transmet que les clés
   * de rendu connues), c'est tout. « Ignorer » masque la proposition pour la
   * séance.
   *
   * Le catalogue vit sur mozaiklabs.fr, interrogé par le serveur
   * (`GET /zones/{id}/device-presets`) ; injoignable, il rend une liste vide
   * et la carte se tait.
   */
  import * as api from '../../lib/api';
  import type { DevicePreset } from '../../lib/api';
  import type { Zone } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { syncZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';

  let { zone }: { zone: Zone } = $props();

  const MIN_OCCURRENCES = 3;
  let proposition = $state<DevicePreset | null>(null);
  let application = $state(false);

  function reglagesLocaux(z: Zone): boolean {
    return !!(z.dlna_native_flac || z.alac_passthrough || z.aac_passthrough || z.dlna_lpcm
      || z.dlna_cap_16bit || z.dlna_wav24 || (z.dlna_play_delay_ms ?? 0) > 0
      || (z.gain_trim_db ?? 0) !== 0);
  }

  function resume(p: DevicePreset): string {
    return Object.entries(p.settings).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(' · ');
  }

  // Une seule lecture par zone affichée : l'effet ne dépend que de l'id.
  const zid = $derived(zone.id);
  $effect(() => {
    const id = zid;
    proposition = null;
    if (id == null) return;
    const identifie = !!(zone.brand ?? zone.detected_manufacturer) && !!(zone.model ?? zone.detected_model);
    if (!identifie || reglagesLocaux(zone)) return;
    api.getZoneDevicePresets(id)
      .then((r) => {
        const p = r.presets?.[0];
        if (p && p.occurrences >= MIN_OCCURRENCES && Object.keys(p.settings ?? {}).length) proposition = p;
      })
      .catch(() => { /* catalogue injoignable : pas de proposition, pas d'erreur */ });
  });

  async function appliquer() {
    if (!proposition || zone.id == null) return;
    application = true;
    try {
      syncZone(await api.applyZoneDevicePreset(zone.id, proposition.settings));
      proposition = null;
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
    application = false;
  }
</script>

{#if proposition}
  <div class="preset">
    <div class="txt">
      <strong>{$t('devices.presetTitle' as any).replace('{count}', String(proposition.occurrences))}</strong>
      <span class="resume">{resume(proposition)}</span>
    </div>
    <button class="v2-btn primaire appliquer" disabled={application} onclick={appliquer}>{$t('devices.presetApply' as any)}</button>
    <button class="v2-btn ignorer" onclick={() => (proposition = null)}>{$t('devices.presetDismiss' as any)}</button>
  </div>
{/if}

<style>
  .preset{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px; padding:10px 12px;
    border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .txt{display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; font-size:12.5px; color:var(--v2-txt)}
  .resume{font:11px var(--v2-mono); color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .v2-btn{height:30px; padding:0 13px; font-size:11.5px}
</style>
