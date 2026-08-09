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
    /** Mode PURE actif sur la zone : l'égaliseur n'est jamais appliqué. */
    pureMode?: boolean;
  }
  let { current, onSelect, pureMode = false }: Props = $props();
</script>

<div class="np-eq">
  {#if pureMode}
    <!-- En mode PURE, load_eq_processor n'est jamais construit : le PCM atteint
         la sortie intact. Laisser cliquer un préréglage qui ne fera rien, sans
         rien dire, c'était le signalement de Bilou. -->
    <p class="eq-pure-notice">
      Mode PURE actif sur cette zone : le signal est transmis intact, sans aucun
      traitement. Les préréglages ci-dessous resteront donc sans effet tant que
      le mode PURE est activé.
    </p>
  {/if}
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
  .eq-pure-notice {
    margin: 0 0 0.6rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--tune-text-muted, #a0a0a8);
    max-width: 48ch;
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
