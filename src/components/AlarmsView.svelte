<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { currentZone } from '../lib/stores/zones';

  interface Alarm {
    id: number;
    name: string;
    time: string;
    days: string;
    skip_holidays: number;
    holiday_country: string;
    zone_id: number | null;
    source_type: string;
    source_id: string;
    source_name: string | null;
    volume: number;
    fade_in_seconds: number;
    enabled: number;
  }

  let alarms = $state<Alarm[]>([]);
  let zones = $state<any[]>([]);
  let editing = $state<Alarm | null>(null);
  let showForm = $state(false);

  const dayLabels = $derived([
    $t('alarms.daySun'), $t('alarms.dayMon'), $t('alarms.dayTue'),
    $t('alarms.dayWed'), $t('alarms.dayThu'), $t('alarms.dayFri'), $t('alarms.daySat'),
  ]);

  let formName = $state($t('alarms.defaultName'));
  let formTime = $state('07:00');
  let formDays = $state([1, 2, 3, 4, 5]);
  let formSkipHolidays = $state(true);
  let formZoneId = $state<number | null>(null);
  let formSourceType = $state('radio');
  let formSourceId = $state('');
  let formSourceName = $state('');
  let formVolume = $state(50);
  let formFadeIn = $state(30);

  $effect(() => {
    loadAlarms();
    loadZones();
  });

  async function loadAlarms() {
    try {
      alarms = await api.fetchJSON<Alarm[]>(`${api.BASE}/alarms/`);
    } catch (e) {
      console.error('Load alarms error:', e);
    }
  }

  async function loadZones() {
    try {
      zones = await api.fetchJSON<any[]>(`${api.BASE}/zones`);
    } catch (e) {
      console.error('Load zones error:', e);
    }
  }

  function openCreate() {
    editing = null;
    formName = $t('alarms.defaultName');
    formTime = '07:00';
    formDays = [1, 2, 3, 4, 5];
    formSkipHolidays = true;
    formZoneId = $currentZone?.id ?? null;
    formSourceType = 'radio';
    formSourceId = '';
    formSourceName = '';
    formVolume = 50;
    formFadeIn = 30;
    showForm = true;
  }

  function openEdit(alarm: Alarm) {
    editing = alarm;
    formName = alarm.name;
    formTime = alarm.time;
    formDays = alarm.days.split(',').map(Number);
    formSkipHolidays = !!alarm.skip_holidays;
    formZoneId = alarm.zone_id;
    formSourceType = alarm.source_type;
    formSourceId = alarm.source_id;
    formSourceName = alarm.source_name || '';
    formVolume = alarm.volume;
    formFadeIn = alarm.fade_in_seconds;
    showForm = true;
  }

  function toggleDay(day: number) {
    if (formDays.includes(day)) {
      formDays = formDays.filter(d => d !== day);
    } else {
      formDays = [...formDays, day].sort();
    }
  }

  async function save() {
    const body = {
      name: formName,
      time: formTime,
      days: formDays.join(','),
      skip_holidays: formSkipHolidays,
      holiday_country: 'FR',
      zone_id: formZoneId,
      source_type: formSourceType,
      source_id: formSourceId,
      source_name: formSourceName || null,
      volume: formVolume,
      fade_in_seconds: formFadeIn,
      enabled: true,
    };

    try {
      if (editing) {
        await api.fetchJSON(`${api.BASE}/alarms/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await api.fetchJSON(`${api.BASE}/alarms/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      showForm = false;
      await loadAlarms();
    } catch (e) {
      console.error('Save alarm error:', e);
    }
  }

  async function toggleEnabled(alarm: Alarm) {
    await api.fetchJSON(`${api.BASE}/alarms/${alarm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !alarm.enabled }),
    });
    await loadAlarms();
  }

  async function deleteAlarm(alarm: Alarm) {
    await api.fetchJSON(`${api.BASE}/alarms/${alarm.id}`, { method: 'DELETE' });
    await loadAlarms();
  }

  function formatDays(days: string): string {
    const nums = days.split(',').map(Number);
    if (nums.length === 7) return $t('alarms.everyday');
    if (nums.length === 5 && [1,2,3,4,5].every(d => nums.includes(d))) return $t('alarms.weekdays');
    if (nums.length === 2 && [0,6].every(d => nums.includes(d))) return $t('alarms.weekend');
    return nums.map(d => dayLabels[d]).join(', ');
  }
</script>

<div class="alarms-view">
  <div class="alarms-header">
    <h2>{$t('alarms.title')}</h2>
    <button class="create-btn" onclick={openCreate}>+ {$t('alarms.newAlarm')}</button>
  </div>

  {#if alarms.length === 0 && !showForm}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <circle cx="12" cy="13" r="8"></circle>
        <path d="M12 9v4l2 2"></path>
        <path d="M5 3L2 6"></path>
        <path d="M22 6l-3-3"></path>
      </svg>
      <p>{$t('alarms.noneConfigured')}</p>
      <p class="hint">{$t('alarms.emptyHint')}</p>
    </div>
  {/if}

  {#if !showForm}
    <div class="alarms-list">
      {#each alarms as alarm}
        <div class="alarm-card" class:disabled={!alarm.enabled}>
          <div class="alarm-main" onclick={() => openEdit(alarm)}>
            <span class="alarm-time">{alarm.time}</span>
            <div class="alarm-info">
              <span class="alarm-name">{alarm.name}</span>
              <span class="alarm-days">{formatDays(alarm.days)}{alarm.skip_holidays ? ' ' + $t('alarms.exceptHolidays') : ''}</span>
              <span class="alarm-source">{alarm.source_name || alarm.source_id}</span>
            </div>
          </div>
          <div class="alarm-actions">
            <label class="toggle">
              <input type="checkbox" checked={!!alarm.enabled} onchange={() => toggleEnabled(alarm)} />
              <span class="slider"></span>
            </label>
            <button class="delete-btn" onclick={() => deleteAlarm(alarm)} title={$t('common.delete')}>×</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if showForm}
    <div class="alarm-form">
      <h3>{editing ? $t('alarms.editAlarm') : $t('alarms.newAlarm')}</h3>

      <label class="form-field">
        <span>{$t('alarms.fieldName')}</span>
        <input type="text" bind:value={formName} />
      </label>

      <label class="form-field">
        <span>{$t('alarms.fieldTime')}</span>
        <input type="time" bind:value={formTime} />
      </label>

      <div class="form-field">
        <span>{$t('alarms.fieldDays')}</span>
        <div class="day-picker">
          {#each dayLabels as label, i}
            <button
              class="day-btn"
              class:active={formDays.includes(i)}
              onclick={() => toggleDay(i)}
            >{label}</button>
          {/each}
        </div>
      </div>

      <label class="form-field checkbox-field">
        <input type="checkbox" bind:checked={formSkipHolidays} />
        <span>{$t('alarms.skipHolidays')}</span>
      </label>

      <label class="form-field">
        <span>{$t('alarms.playbackZone')}</span>
        <select bind:value={formZoneId}>
          <option value={null}>{$t('alarms.defaultZone')}</option>
          {#each zones as zone}
            <option value={zone.id}>{zone.name}</option>
          {/each}
        </select>
      </label>

      <label class="form-field">
        <span>{$t('alarms.source')}</span>
        <select bind:value={formSourceType}>
          <option value="radio">{$t('alarms.sourceRadio')}</option>
          <option value="playlist">{$t('alarms.sourcePlaylist')}</option>
          <option value="album">{$t('alarms.sourceAlbum')}</option>
        </select>
      </label>

      <label class="form-field">
        <span>{formSourceType === 'radio' ? $t('alarms.radioUrl') : $t('alarms.id')}</span>
        <input type="text" bind:value={formSourceId} placeholder={formSourceType === 'radio' ? 'https://stream.fip.fr/fip-hifi.aac' : $t('alarms.idPlaceholder')} />
      </label>

      <label class="form-field">
        <span>{$t('alarms.nameOptional')}</span>
        <input type="text" bind:value={formSourceName} placeholder={$t('alarms.namePlaceholder')} />
      </label>

      <label class="form-field">
        <span>{$t('alarms.volume').replace('{value}', String(formVolume))}</span>
        <input type="range" min="0" max="100" bind:value={formVolume} />
      </label>

      <label class="form-field">
        <span>{$t('alarms.fadeIn').replace('{value}', String(formFadeIn))}</span>
        <input type="range" min="0" max="120" step="5" bind:value={formFadeIn} />
      </label>

      <div class="form-actions">
        <button class="cancel-btn" onclick={() => showForm = false}>{$t('common.cancel')}</button>
        <button class="save-btn" onclick={save}>{$t('common.save')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .alarms-view {
    padding: 24px;
    max-width: 700px;
    margin: 0 auto;
  }
  .alarms-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  .alarms-header h2 {
    margin: 0;
    font-size: 1.5rem;
  }
  .create-btn {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md, 8px);
    padding: 8px 16px;
    cursor: pointer;
    font-weight: 600;
  }
  .empty-state {
    text-align: center;
    padding: 48px;
    color: var(--tune-text-secondary);
  }
  .empty-state svg { opacity: 0.3; margin-bottom: 16px; }
  .hint { font-size: 0.85rem; opacity: 0.7; }

  .alarms-list { display: flex; flex-direction: column; gap: 12px; }
  .alarm-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--tune-card-bg, rgba(255,255,255,0.05));
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    padding: 16px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .alarm-card.disabled { opacity: 0.4; }
  .alarm-main { display: flex; align-items: center; gap: 16px; flex: 1; }
  .alarm-time { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .alarm-info { display: flex; flex-direction: column; gap: 2px; }
  .alarm-name { font-weight: 600; }
  .alarm-days { font-size: 0.85rem; color: var(--tune-text-secondary); }
  .alarm-source { font-size: 0.8rem; color: var(--tune-text-secondary); opacity: 0.7; }
  .alarm-actions { display: flex; align-items: center; gap: 12px; }

  .toggle { position: relative; width: 44px; height: 24px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; inset: 0; background: var(--tune-border);
    border-radius: 24px; cursor: pointer; transition: 0.3s;
  }
  .slider::before {
    content: ''; position: absolute; height: 18px; width: 18px;
    left: 3px; bottom: 3px; background: white;
    border-radius: 50%; transition: 0.3s;
  }
  .toggle input:checked + .slider { background: var(--tune-accent); }
  .toggle input:checked + .slider::before { transform: translateX(20px); }

  .delete-btn {
    background: none; border: none; font-size: 20px;
    color: var(--tune-text-secondary); cursor: pointer;
    opacity: 0.5; padding: 4px 8px;
  }
  .delete-btn:hover { color: #e74c3c; opacity: 1; }

  .alarm-form {
    background: var(--tune-card-bg, rgba(255,255,255,0.05));
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    padding: 24px;
  }
  .alarm-form h3 { margin: 0 0 20px; }
  .form-field {
    display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;
  }
  .form-field span { font-size: 0.85rem; color: var(--tune-text-secondary); }
  .form-field input[type="text"],
  .form-field input[type="time"],
  .form-field select {
    background: var(--tune-bg); border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm, 4px); padding: 8px 12px;
    color: var(--tune-text); font-size: 1rem;
  }
  .checkbox-field { flex-direction: row; align-items: center; }
  .checkbox-field input { width: 18px; height: 18px; }

  .day-picker { display: flex; gap: 6px; }
  .day-btn {
    width: 40px; height: 36px; border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--tune-border); background: none;
    color: var(--tune-text-secondary); cursor: pointer; font-size: 0.8rem;
  }
  .day-btn.active { background: var(--tune-accent); color: white; border-color: var(--tune-accent); }

  .form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }
  .cancel-btn {
    background: none; border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px); padding: 8px 20px;
    color: var(--tune-text); cursor: pointer;
  }
  .save-btn {
    background: var(--tune-accent); color: white; border: none;
    border-radius: var(--radius-md, 8px); padding: 8px 20px;
    cursor: pointer; font-weight: 600;
  }
</style>
