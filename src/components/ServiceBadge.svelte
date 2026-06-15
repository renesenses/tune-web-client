<script lang="ts">
  interface Props {
    source?: string | null;
    compact?: boolean;
  }
  let { source = null, compact = false }: Props = $props();

  const services: Record<string, { name: string; bg: string; color: string }> = {
    tidal:   { name: 'TIDAL',   bg: '#000000', color: '#00FFFF' },
    qobuz:   { name: 'QOBUZ',   bg: '#2C54A5', color: '#ffffff' },
    deezer:  { name: 'DEEZER',  bg: '#A238FF', color: '#ffffff' },
    spotify: { name: 'SPOTIFY', bg: '#1DB954', color: '#ffffff' },
    youtube: { name: 'YT',      bg: '#FF0000', color: '#ffffff' },
    amazon:  { name: 'AMAZON',  bg: '#00A8E1', color: '#ffffff' },
  };

  let info = $derived(source ? services[source] ?? null : null);
</script>

{#if info}
  <span
    class="service-badge {source}"
    class:compact
    style="--sb-bg: {info.bg}; --sb-color: {info.color}"
    title={info.name}
  >
    {info.name}
  </span>
{/if}

<style>
  .service-badge {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-label, system-ui);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.4;
    text-transform: uppercase;
  }

  .service-badge.compact {
    font-size: 8px;
    padding: 1px 4px;
    letter-spacing: 0.3px;
  }

  /* Tidal: cyan text on dark bg with subtle border */
  .service-badge.tidal {
    color: #00FFFF;
    background: rgba(0, 255, 255, 0.10);
    border: 1px solid rgba(0, 255, 255, 0.30);
  }

  /* Qobuz: blue tones */
  .service-badge.qobuz {
    color: #6B9FFF;
    background: rgba(44, 84, 165, 0.15);
    border: 1px solid rgba(44, 84, 165, 0.35);
  }

  /* Deezer: purple tones */
  .service-badge.deezer {
    color: #C98FFF;
    background: rgba(162, 56, 255, 0.12);
    border: 1px solid rgba(162, 56, 255, 0.30);
  }

  /* Spotify: green tones */
  .service-badge.spotify {
    color: #1DB954;
    background: rgba(29, 185, 84, 0.12);
    border: 1px solid rgba(29, 185, 84, 0.30);
  }

  /* YouTube: red tones */
  .service-badge.youtube {
    color: #FF6B6B;
    background: rgba(255, 0, 0, 0.10);
    border: 1px solid rgba(255, 0, 0, 0.25);
  }

  /* Amazon: cyan-blue tones */
  .service-badge.amazon {
    color: #00C8FF;
    background: rgba(0, 168, 225, 0.12);
    border: 1px solid rgba(0, 168, 225, 0.30);
  }
</style>
