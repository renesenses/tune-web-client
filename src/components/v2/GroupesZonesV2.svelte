<script lang="ts">
  /**
   * Groupes de zones — portage de la section « groupes » de `ZoneManagerView`,
   * que la phase 5 supprime.
   *
   * `listGroups` n'avait aucun appelant v2 : la v2 savait grouper (la modale de
   * zone de la barre de lecture, au clic droit), mais elle ne recevait JAMAIS
   * la liste des groupes (`groups={[]}`) — un groupe créé ne se voyait nulle
   * part, et ne pouvait donc pas se défaire.
   *
   * Grouper et dégrouper passent par `groupZones` / `ungroupZones`
   * (`/zones/group`), les routes que l'ancien gestionnaire employait. La
   * PREMIÈRE zone cochée mène le groupe, et l'écran le dit.
   */
  import * as api from '../../lib/api';
  import type { Zone, ZoneGroupResponse } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';

  let { zones, onChange }: { zones: Zone[]; onChange?: () => void } = $props();

  let groupes = $state<(ZoneGroupResponse & { name?: string })[]>([]);
  let formulaire = $state(false);
  let choisies = $state<number[]>([]);
  let occupe = $state(false);

  async function charger() {
    // Serveur sans la route : pas de groupes, sans alarme.
    try { groupes = (await api.listGroups()) ?? []; } catch { groupes = []; }
  }
  $effect(() => { void charger(); });

  const nomDe = (id: number) => zones.find((z) => z.id === id)?.name ?? `#${id}`;
  const dejaGroupees = $derived(new Set(groupes.flatMap((g) => g.zone_ids ?? [])));
  const groupables = $derived(zones.filter((z) => z.id != null && !dejaGroupees.has(z.id)));

  function basculer(id: number) {
    choisies = choisies.includes(id) ? choisies.filter((x) => x !== id) : [...choisies, id];
  }
  function fermer() { formulaire = false; choisies = []; }

  async function grouper() {
    if (choisies.length < 2 || occupe) return;
    occupe = true;
    try {
      await api.groupZones(choisies[0], choisies);
      notifications.success($t('zone.groupCreated' as any));
      fermer();
      await charger();
      onChange?.();
    } catch (e: any) {
      notifications.error(e?.message || $t('zone.groupError' as any));
    }
    occupe = false;
  }

  async function degrouper(g: ZoneGroupResponse) {
    if (occupe) return;
    occupe = true;
    try {
      await api.ungroupZones(g.group_id);
      notifications.success($t('zone.groupDissolved' as any));
      await charger();
      onChange?.();
    } catch (e: any) {
      notifications.error(e?.message || $t('zone.ungroupError' as any));
    }
    occupe = false;
  }
</script>

{#if groupes.length || groupables.length >= 2}
  <section class="groupes">
    <div class="ph">
      <span class="cl">{$t('zone.groupedPlayback' as any)}</span>
      {#if !formulaire && groupables.length >= 2}
        <button class="v2-btn ouvrir" onclick={() => (formulaire = true)}>{$t('zone.group' as any)}</button>
      {/if}
    </div>

    {#if formulaire}
      <p class="phint">{$t('zone.selectZones' as any)}</p>
      <div class="choix">
        {#each groupables as z (z.id)}
          {@const rang = choisies.indexOf(z.id as number)}
          <label class="coche">
            <input type="checkbox" checked={rang >= 0} onchange={() => basculer(z.id as number)} />
            <span>{z.name}</span>
            {#if rang === 0}<span class="meneuse">{$t('zone.leader' as any)}</span>{/if}
          </label>
        {/each}
      </div>
      <div class="acts">
        <button class="v2-btn primaire grouper" disabled={choisies.length < 2 || occupe} onclick={grouper}>{$t('zone.group' as any)}</button>
        <button class="v2-btn" onclick={fermer}>{$t('common.cancel' as any)}</button>
      </div>
    {/if}

    {#each groupes as g (g.group_id)}
      <div class="groupe">
        <span class="gn">{g.name || (g.zone_ids ?? []).map(nomDe).join(' + ')}</span>
        <span class="membres">
          {#each g.zone_ids ?? [] as id (id)}
            <span class="membre">{nomDe(id)}{#if id === g.leader_id} · {$t('zone.leader' as any)}{/if}</span>
          {/each}
        </span>
        <button class="v2-btn degrouper" disabled={occupe} onclick={() => degrouper(g)}>{$t('zone.ungroup' as any)}</button>
      </div>
    {/each}
  </section>
{/if}

<style>
  .groupes{margin-top:22px}
  .ph{display:flex; align-items:center; justify-content:space-between; gap:10px}
  .cl{font:700 11px var(--v2-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .phint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); margin:8px 0 0}
  .choix{display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:10px}
  .coche{display:flex; align-items:center; gap:7px; font-size:13px; color:var(--v2-txt2); cursor:pointer}
  .coche input{accent-color:var(--v2-acc1); width:15px; height:15px}
  .meneuse{font:600 10px var(--v2-sans); color:var(--v2-acc-tint)}
  .acts{display:flex; gap:8px; margin-top:10px}
  .groupe{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:10px; padding:10px 12px;
    border:1px solid var(--v2-line); border-radius:10px}
  .gn{font-size:13px; font-weight:600; color:var(--v2-txt)}
  .membres{display:flex; gap:6px; flex-wrap:wrap; flex:1; min-width:0}
  .membre{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .v2-btn{height:30px; padding:0 13px; font-size:11.5px}
</style>
