<script lang="ts">
  /**
   * Appareils ignorés — portage de la section de `SettingsView` (#1280).
   *
   * Un appareil ignoré n'est plus annoncé NULLE PART : ni dans la liste des
   * appareils réseau, ni dans la création de zone. Sans cet écran, un appareil
   * ignoré par erreur ne pourrait plus revenir depuis l'interface — c'est la
   * raison pour laquelle le geste « ignorer » n'existe pas sans son inverse.
   *
   * `recharge` : un compteur que le parent incrémente après avoir ignoré un
   * appareil ailleurs dans l'écran. Sans lui, la liste chargée à l'ouverture
   * resterait muette sur l'appareil qu'on vient d'y envoyer.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import {
    detailAppareilIgnore,
    libelleAppareilIgnore,
    transportAppareilIgnore,
    type AppareilIgnore,
  } from '../../lib/appareilsIgnores';

  let { recharge = 0 }: { recharge?: number } = $props();

  let liste = $state<AppareilIgnore[]>([]);
  let charge = $state(false);
  let occupe = $state(false);

  async function charger() {
    try {
      const r = await api.listIgnoredDevices();
      liste = r.items ?? [];
    } catch {
      // Serveur antérieur à la route, ou hors ligne : liste vide, sans alarme.
      liste = [];
    }
    charge = true;
  }

  $effect(() => { void recharge; void charger(); });

  async function retablir(d: AppareilIgnore) {
    occupe = true;
    try {
      await api.unignoreDevice(d.device_id);
      await charger();
      // L'appareil ne revient qu'au prochain passage de découverte : on le dit,
      // plutôt que de laisser croire à un échec devant une liste inchangée.
      notifications.success($t('settings.deviceUnignored' as any).replace('{name}', libelleAppareilIgnore(d)));
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    } finally {
      occupe = false;
    }
  }
</script>

<p class="hint">{$t('settings.ignoredDevicesIntro' as any)}</p>
<div class="liste">
  {#each liste as d (d.device_id)}
    <div class="ligne">
      <span class="nom">{libelleAppareilIgnore(d)}</span>
      {#if transportAppareilIgnore(d)}<span class="type">{transportAppareilIgnore(d)}</span>{/if}
      <span class="detail">{detailAppareilIgnore(d)}</span>
      <button class="v2-btn retablir" disabled={occupe} onclick={() => retablir(d)}>
        {$t('settings.unignoreDevice' as any)}
      </button>
    </div>
  {:else}
    {#if charge}<p class="hint">{$t('settings.noIgnoredDevices' as any)}</p>{/if}
  {/each}
</div>

<style>
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); margin:8px 0 0}
  .liste{display:flex; flex-direction:column; gap:1px; margin-top:10px}
  .ligne{display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; align-items:center; gap:11px;
    padding:8px 10px; border-radius:9px; color:var(--v2-txt2)}
  .ligne:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .nom{font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .type{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .detail{font:10px var(--v2-mono); color:var(--v2-txt3)}
  .retablir{height:28px; padding:0 12px; font-size:11.5px}
</style>
