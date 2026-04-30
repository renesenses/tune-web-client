<script lang="ts">
  const PRESETS = [
    { value: 'flat', label: 'Flat' },
    { value: 'bass_boost', label: 'Bass Boost' },
    { value: 'treble_boost', label: 'Treble Boost' },
    { value: 'vocal', label: 'Vocal' },
    { value: 'rock', label: 'Rock' },
    { value: 'jazz', label: 'Jazz' },
    { value: 'classical', label: 'Classical' },
  ];

  interface Props {
    current: string;
    onSelect: (preset: string) => void;
  }
  let { current, onSelect }: Props = $props();
</script>

<div class="np-eq">
  {#each PRESETS as preset}
    <button
      class="eq-preset"
      class:active={current === preset.value}
      onclick={() => onSelect(preset.value)}
    >
      {preset.label}
    </button>
  {/each}
</div>

<style>
  .np-eq {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    background: rgba(255,255,255,0.04);
    padding: 10px;
    border-radius: 8px;
    margin-top: 8px;
  }
  .eq-preset {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    color: var(--tune-text-muted, rgba(255,255,255,0.7));
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .eq-preset:hover { border-color: var(--tune-accent, #00bcd4); color: var(--tune-text); }
  .eq-preset.active {
    background: rgba(0,188,212,0.15);
    border-color: var(--tune-accent, #00bcd4);
    color: var(--tune-accent, #00bcd4);
  }
</style>
