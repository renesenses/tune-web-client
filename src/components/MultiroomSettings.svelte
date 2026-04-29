<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { GroupDelay } from '../lib/types';

  // Inter-techno calibration UI (v0.8.0). The user picks a pair of
  // technologies (snapcast/sonos/dlna/airplay/local) and slides a
  // delay value in milliseconds. The server canonicalises the pair
  // alphabetically, so the same row covers (a, b) and (b, a). Only
  // pairs with at least one of the new natively-synced techs
  // (Snapcast or Sonos) are surfaced — local↔dlna calibration was
  // never a thing in Tune anyway.

  const TECHS = ['snapcast', 'sonos', 'dlna', 'airplay', 'local'] as const;
  type Tech = typeof TECHS[number];

  let delays = $state<GroupDelay[]>([]);
  let loading = $state(true);
  let savedNote = $state<string | null>(null);

  // Build an editable view: matrix of (tech_a, tech_b) pairs where
  // tech_a < tech_b alphabetically. Initial value pulled from the
  // server's existing rows; missing pairs default to 0 ms.
  let edited = $state<Record<string, number>>({});

  function pairKey(a: Tech, b: Tech): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  async function load() {
    loading = true;
    try {
      delays = await api.listGroupDelays();
      edited = {};
      for (const row of delays) {
        edited[pairKey(row.tech_a as Tech, row.tech_b as Tech)] = row.delay_ms;
      }
    } catch (e) {
      console.error('group_delays_load_failed', e);
    } finally {
      loading = false;
    }
  }

  async function savePair(a: Tech, b: Tech) {
    const key = pairKey(a, b);
    const value = edited[key] ?? 0;
    try {
      await api.setGroupDelay(a, b, value);
      savedNote = `${a} ↔ ${b} : ${value} ms enregistré`;
      setTimeout(() => { savedNote = null; }, 2500);
    } catch (e) {
      console.error('group_delay_save_failed', e);
    }
  }

  onMount(load);

  // The pairs we actually want to expose. Snapcast ↔ Sonos is the
  // primary one (mixed Pi cluster + Sonos household). Add the
  // legacy combos just in case someone has DLNA/AirPlay zones in a
  // mixed group with native-sync techs.
  const VISIBLE_PAIRS: Array<[Tech, Tech]> = [
    ['snapcast', 'sonos'],
    ['snapcast', 'airplay'],
    ['snapcast', 'dlna'],
    ['snapcast', 'local'],
    ['sonos', 'airplay'],
    ['sonos', 'dlna'],
    ['sonos', 'local'],
  ];
</script>

<section class="settings-section multiroom-settings">
  <div class="header">
    <h2>Multi-room — calibration inter-techno</h2>
    <button class="refresh" onclick={load} disabled={loading}>{loading ? '…' : '⟲'}</button>
  </div>
  <p class="hint">
    Une seule fois par paire de technologies. La valeur s'applique
    chaque démarrage d'un groupe mixte (par exemple Snapcast Pi +
    Sonos). Positif = la deuxième technologie démarre plus tard
    pour rattraper la première à l'oreille.
  </p>

  {#if loading}
    <div class="state">…</div>
  {:else}
    <div class="pairs-grid">
      {#each VISIBLE_PAIRS as [a, b]}
        {@const key = pairKey(a, b)}
        {@const value = edited[key] ?? 0}
        <div class="pair">
          <div class="pair-label">
            <strong>{a}</strong> ↔ <strong>{b}</strong>
          </div>
          <input
            type="range" min="-500" max="500" step="5"
            value={value}
            oninput={(e) => edited[key] = parseInt((e.target as HTMLInputElement).value, 10)}
          />
          <input
            type="number" min="-500" max="500" step="5"
            value={value}
            oninput={(e) => edited[key] = parseInt((e.target as HTMLInputElement).value, 10) || 0}
            class="num"
          />
          <span class="unit">ms</span>
          <button class="save" onclick={() => savePair(a, b)}>Enregistrer</button>
        </div>
      {/each}
    </div>

    {#if savedNote}
      <p class="saved">{savedNote}</p>
    {/if}
  {/if}
</section>

<style>
  .multiroom-settings { padding: 1rem 1.2rem; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04); border-radius: 12px; margin-bottom: 1rem; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
  .header h2 { font-size: 1rem; margin: 0; color: var(--tune-text); }
  .refresh { background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); border-radius: 6px; padding: 0.2rem 0.6rem; color: var(--tune-text); cursor: pointer; }
  .hint { font-size: 0.8rem; color: var(--tune-text-muted); margin: 0 0 0.8rem 0; }
  .state { padding: 1rem; text-align: center; color: var(--tune-text-muted); }
  .pairs-grid { display: flex; flex-direction: column; gap: 0.5rem; }
  .pair { display: grid; grid-template-columns: 130px 1fr 60px 24px 100px; gap: 0.6rem; align-items: center; padding: 0.4rem 0.6rem; border-radius: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.06); }
  .pair-label { font-size: 0.85rem; color: var(--tune-text); text-transform: uppercase; }
  .pair input[type="range"] { accent-color: var(--tune-accent, #6366f1); }
  .num { width: 60px; padding: 0.2rem 0.3rem; border-radius: 4px; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); background: transparent; color: var(--tune-text); font-size: 0.85rem; }
  .unit { font-size: 0.75rem; color: var(--tune-text-muted); }
  .save { font-size: 0.8rem; padding: 0.3rem 0.7rem; border-radius: 6px; border: none; background: var(--tune-accent, #6366f1); color: white; cursor: pointer; }
  .saved { font-size: 0.8rem; color: #10b981; margin: 0.6rem 0 0 0; }

  @media (max-width: 700px) {
    .pair { grid-template-columns: 1fr; }
    .pair-label { font-weight: 600; }
  }
</style>
