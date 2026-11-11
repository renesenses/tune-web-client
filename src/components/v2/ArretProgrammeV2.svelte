<script lang="ts">
  /**
   * Arrêt programmé à heure fixe (tune-server-rust#8213, web #2802).
   *
   * laguespa (fil forum 2720) veut que Tune s'arrête de lui-même à une heure
   * fixe, tous les jours ou certains jours. La minuterie de sommeil compte une
   * durée et se relance chaque soir ; ce réglage est une ÉCHÉANCE, rangée sur
   * le serveur. Réponse 10786 : il veut aussi éteindre la MACHINE. Le choix
   * « éteindre la machine » n'apparaît que si le serveur dit que c'est
   * possible (`poweroff_available`, Tune OS seulement).
   *
   * Aucune écriture au chargement : on lit, puis on n'écrit qu'au clic sur
   * « Enregistrer » ou « Supprimer ».
   */
  import { onDestroy, onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { joursDepuisMasque, masqueDepuisJours } from '../../lib/joursReveil';
  import '../../styles/tune-v2.css';

  let chargement = $state(true);
  /** `false` : serveur d'avant #8213 (404). */
  let disponible = $state(true);
  let enregistrement = $state(false);
  let existe = $state(false);
  let prochain = $state<string | null>(null);
  let extinctionPossible = $state(false);

  let fActif = $state(true);
  let fHeure = $state('23:00');
  let fJours = $state<number[]>([0, 1, 2, 3, 4, 5, 6]);
  let fToutes = $state(true);
  let fZones = $state<number[]>([]);
  let fAction = $state<api.ActionArretProgramme>('stop_playback');

  let zones = $state<{ id: number; name: string }[]>([]);
  let vivant = true;
  onDestroy(() => { vivant = false; });
  onMount(() => { void charger(); });

  // Indice = convention du serveur : 0 = lundi … 6 = dimanche.
  const joursCourts = $derived([
    $t('alarms.dayMon'), $t('alarms.dayTue'), $t('alarms.dayWed'),
    $t('alarms.dayThu'), $t('alarms.dayFri'), $t('alarms.daySat'), $t('alarms.daySun'),
  ]);

  function appliquer(etat: api.EtatArretProgramme) {
    const r = etat.scheduled_stop;
    existe = r !== null;
    prochain = etat.next_stop_at ?? null;
    extinctionPossible = etat.poweroff_available === true;
    if (r) {
      fActif = r.enabled;
      fHeure = r.time.length === 4 ? `0${r.time}` : r.time;
      fJours = joursDepuisMasque(r.days_of_week);
      fToutes = r.zone_ids === null;
      fZones = r.zone_ids ?? [];
      fAction = r.action === 'poweroff' ? 'poweroff' : 'stop_playback';
    }
  }

  async function charger() {
    chargement = true;
    try {
      const [etat, z] = await Promise.all([
        api.getArretProgramme(),
        api.fetchJSON<any[]>(`${api.BASE}/zones`).catch(() => []),
      ]);
      if (!vivant) return;
      zones = (z ?? []).filter((x: any) => typeof x?.id === 'number').map((x: any) => ({ id: x.id, name: x.name }));
      appliquer(etat);
    } catch (e: any) {
      if (!vivant) return;
      if (e?.status === 404) disponible = false;
      else notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) chargement = false;
  }

  function basculerJour(j: number) {
    fJours = fJours.includes(j) ? fJours.filter((d) => d !== j) : [...fJours, j].sort((a, b) => a - b);
  }

  function basculerZone(id: number) {
    fZones = fZones.includes(id) ? fZones.filter((z) => z !== id) : [...fZones, id];
  }

  async function enregistrer() {
    if (enregistrement) return;
    if (!fToutes && fZones.length === 0) {
      notifications.error($t('scheduledStop.pickZone' as any));
      return;
    }
    // Éteindre la machine : une confirmation, la seule action irréversible.
    if (fActif && fAction === 'poweroff'
      && !(await dialogs.confirm($t('scheduledStop.confirmPoweroff' as any).replace('{time}', fHeure), { danger: true }))) return;
    enregistrement = true;
    try {
      const etat = await api.setArretProgramme({
        enabled: fActif,
        time: fHeure,
        days_of_week: masqueDepuisJours(fJours),
        zone_ids: fToutes ? null : fZones,
        action: fAction,
      });
      if (!vivant) return;
      appliquer(etat);
      notifications.success($t('common.saved' as any));
    } catch (e: any) {
      if (!vivant) return;
      if (e?.code === 'poweroff_unavailable') {
        extinctionPossible = false;
        fAction = 'stop_playback';
        notifications.error($t('scheduledStop.poweroffUnavailable' as any));
      } else {
        notifierErreur($t('common.error' as any), e, { motifSeul: true });
      }
    }
    if (vivant) enregistrement = false;
  }

  async function supprimer() {
    if (enregistrement) return;
    enregistrement = true;
    try {
      const etat = await api.supprimerArretProgramme();
      if (!vivant) return;
      appliquer(etat);
      notifications.success($t('common.saved' as any));
    } catch (e) {
      if (vivant) notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
    if (vivant) enregistrement = false;
  }

  /** `2026-11-11T23:00:00` (heure locale du serveur, sans fuseau) → texte. */
  function prochainTexte(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const jour = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return `${jour}, ${m[4]}:${m[5]}`;
  }
</script>

<div class="arret-programme" data-arret-programme>
  {#if chargement}
    <p class="hint">…</p>
  {:else if !disponible}
    <p class="hint">{$t('scheduledStop.unavailable' as any)}</p>
  {:else}
    <p class="hint">{$t('scheduledStop.hint' as any)}</p>

    <label class="ligne">
      <input type="checkbox" bind:checked={fActif} />
      <span>{$t('scheduledStop.enabled' as any)}</span>
    </label>

    <div class="champ">
      <span class="lbl">{$t('scheduledStop.time' as any)}</span>
      <input type="time" bind:value={fHeure} aria-label={$t('scheduledStop.time' as any)} />
    </div>

    <div class="champ">
      <span class="lbl">{$t('scheduledStop.days' as any)}</span>
      <div class="jours">
        {#each joursCourts as j, i}
          <button type="button" class="jour" class:on={fJours.includes(i)} aria-pressed={fJours.includes(i)}
            onclick={() => basculerJour(i)}>{j}</button>
        {/each}
      </div>
    </div>

    <div class="champ">
      <span class="lbl">{$t('scheduledStop.zones' as any)}</span>
      <label class="ligne">
        <input type="checkbox" bind:checked={fToutes} />
        <span>{$t('scheduledStop.allZones' as any)}</span>
      </label>
      {#if !fToutes}
        <div class="zones">
          {#each zones as z (z.id)}
            <label class="ligne">
              <input type="checkbox" checked={fZones.includes(z.id)} onchange={() => basculerZone(z.id)} />
              <span>{z.name}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    {#if extinctionPossible || fAction === 'poweroff'}
      <div class="champ" data-action-arret>
        <span class="lbl">{$t('scheduledStop.action' as any)}</span>
        <label class="ligne">
          <input type="radio" name="action-arret" value="stop_playback" bind:group={fAction} />
          <span>{$t('scheduledStop.actionStop' as any)}</span>
        </label>
        <label class="ligne">
          <input type="radio" name="action-arret" value="poweroff" bind:group={fAction} disabled={!extinctionPossible} />
          <span>{$t('scheduledStop.actionPoweroff' as any)}</span>
        </label>
        {#if fAction === 'poweroff'}
          <p class="hint avert">{$t('scheduledStop.poweroffHint' as any)}</p>
        {/if}
      </div>
    {/if}

    <p class="hint" data-prochain-arret>
      {#if existe && prochain}
        {$t('scheduledStop.next' as any).replace('{when}', prochainTexte(prochain))}
      {:else}
        {$t('scheduledStop.none' as any)}
      {/if}
    </p>

    <div class="actions">
      {#if existe}
        <button class="v2-btn" disabled={enregistrement} onclick={supprimer}>{$t('common.delete' as any)}</button>
      {/if}
      <button class="v2-btn primary" disabled={enregistrement} onclick={enregistrer}>{$t('common.save' as any)}</button>
    </div>
  {/if}
</div>

<style>
  .arret-programme { display: flex; flex-direction: column; gap: 12px; }
  .hint { margin: 0; font: 400 12px var(--v2-sans); color: var(--v2-txt2); }
  .hint.avert { color: var(--v2-txt); }
  .champ { display: flex; flex-direction: column; gap: 6px; }
  .lbl { font: 500 13px var(--v2-sans); color: var(--v2-txt); }
  .ligne { display: flex; align-items: center; gap: 8px; font: 400 14px var(--v2-sans); color: var(--v2-txt); cursor: pointer; }
  .champ input[type='time'] {
    align-self: flex-start;
    padding: 9px 11px; border-radius: var(--v2-r-input, 8px); border: 1px solid var(--v2-line2);
    background: var(--v2-bg); color: var(--v2-txt); font: 400 14px var(--v2-sans);
  }
  .jours { display: flex; gap: 6px; flex-wrap: wrap; }
  .jour {
    min-width: 42px; padding: 7px 0; border-radius: var(--v2-r-pill); cursor: pointer;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2);
    font: 600 12px var(--v2-sans);
  }
  .jour.on { background: var(--v2-acc1); border-color: var(--v2-acc1); color: var(--v2-on-acc); }
  .zones { display: flex; flex-direction: column; gap: 4px; padding-left: 4px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
