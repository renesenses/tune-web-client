<script lang="ts" module>
  /**
   * Les services que ce badge sait dessiner. Un appelant qui veut un repli
   * (web#3145 : un service inconnu laissait un repère VIDE) le demande ici
   * plutôt que de recopier la liste.
   */
  export const SERVICES_BADGE: ReadonlySet<string> = new Set([
    'tidal', 'qobuz', 'deezer', 'spotify', 'youtube', 'amazon', 'local', 'bandcamp', 'upnp',
  ]);
</script>

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
    local:   { name: 'LOCAL',   bg: '#4B5563', color: '#ffffff' },
    // Bandcamp est une source de lecture au même titre que les autres depuis
    // qu'elle sort par la zone. Sans cette entrée, la puce ne s'affichait pas
    // du tout : le lecteur ne disait pas d'où venait le morceau.
    bandcamp:{ name: 'BANDCAMP',bg: '#1DA0C3', color: '#ffffff' },
    // Serveur UPnP/DLNA du réseau — arbitrage du 14/09/2026 (D1bis de
    // `unifier-serveurs-upnp-et-bibliotheque.md`) : la provenance est UPnP, pas
    // « local », et il n'y a PAS un badge par serveur. Un ambre : aucune des
    // sept autres puces ne l'occupe, et il se lit comme elles sur fond sombre.
    upnp:    { name: 'UPNP',     bg: '#D97706', color: '#ffffff' },
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
    font-size: calc(9px * var(--v2-txt-echelle, 1));
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
    font-size: calc(8px * var(--v2-txt-echelle, 1));
    padding: 1px 4px;
    letter-spacing: 0.3px;
  }

  /* web#3232 — le texte de chaque puce lit `--v2-puce-<source>` : la couleur
     d'origine (fond sombre) en repli, une variante assombrie sur les thèmes
     clairs et sur un « Mon thème » clair (`src/lib/pucesSource.ts`). */

  /* Tidal: cyan text on dark bg with subtle border */
  .service-badge.tidal {
    color: var(--v2-puce-tidal, #00FFFF);
    background: rgba(0, 255, 255, 0.10);
    border: 1px solid rgba(0, 255, 255, 0.30);
  }

  /* Qobuz: blue tones */
  .service-badge.qobuz {
    color: var(--v2-puce-qobuz, #6B9FFF);
    background: rgba(44, 84, 165, 0.15);
    border: 1px solid rgba(44, 84, 165, 0.35);
  }

  /* Deezer: purple tones */
  .service-badge.deezer {
    color: var(--v2-puce-deezer, #C98FFF);
    background: rgba(162, 56, 255, 0.12);
    border: 1px solid rgba(162, 56, 255, 0.30);
  }

  /* Spotify: green tones */
  .service-badge.spotify {
    color: var(--v2-puce-spotify, #1DB954);
    background: rgba(29, 185, 84, 0.12);
    border: 1px solid rgba(29, 185, 84, 0.30);
  }

  /* YouTube: red tones */
  .service-badge.youtube {
    color: var(--v2-puce-youtube, #FF6B6B);
    background: rgba(255, 0, 0, 0.10);
    border: 1px solid rgba(255, 0, 0, 0.25);
  }

  /* Amazon: cyan-blue tones */
  .service-badge.amazon {
    color: var(--v2-puce-amazon, #00C8FF);
    background: rgba(0, 168, 225, 0.12);
    border: 1px solid rgba(0, 168, 225, 0.30);
  }

  /* Bandcamp: teal tones */
  .service-badge.bandcamp {
    color: var(--v2-puce-bandcamp, #4FC3E0);
    background: rgba(29, 160, 195, 0.12);
    border: 1px solid rgba(29, 160, 195, 0.30);
  }

  /* UPnP/DLNA server: amber tones */
  .service-badge.upnp {
    color: var(--v2-puce-upnp, #F5B942);
    background: rgba(217, 119, 6, 0.14);
    border: 1px solid rgba(217, 119, 6, 0.35);
  }

  /* Local library: neutral grey tones */
  .service-badge.local {
    color: var(--v2-puce-local, #B4BCC8);
    background: rgba(75, 85, 99, 0.18);
    border: 1px solid rgba(75, 85, 99, 0.40);
  }
</style>
