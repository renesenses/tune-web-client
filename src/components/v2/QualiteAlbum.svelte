<script lang="ts">
  /**
   * TROISIÈME LIGNE d'une vignette : d'où vient le disque, et en quelle qualité.
   *
   * Bertrand, 05/09/2026 : « Badge qualité masqué : mets-le sur une troisième
   * ligne » — puis « avec Local d'ailleurs ! ».
   *
   * Le badge de qualité était posé SUR la pochette, en haut à droite. Il y était
   * masqué de deux façons : par la barre d'actions qui apparaît au survol, et
   * par les pochettes claires, sur lesquelles un badge translucide se perd. Il
   * ne s'affichait d'ailleurs qu'à partir du niveau Avancé, et seulement pour
   * le hi-res et le DSD — un disque en CD n'annonçait rien du tout.
   *
   * ## La source, LOCAL compris
   *
   * `AlbumArt` pose un badge de service sur la pochette, mais l'exclut
   * explicitement pour `local`. Résultat : on savait qu'un disque venait de
   * Bandcamp, jamais qu'il était chez soi — alors que c'est l'information la
   * plus utile des deux quand on cherche « miles davis » et qu'on obtient 190
   * albums de quatre provenances mélangées.
   *
   * Ici, la source est TOUJOURS nommée, `LOCAL` compris. C'est la convention de
   * la barre de transport, qui affiche déjà `LOCAL` à côté du titre en cours.
   */
  import ServiceBadge from '../ServiceBadge.svelte';
  import { getQualityTier } from '../../lib/utils';

  interface Props {
    /** Album ou piste : tout objet portant format, fréquence et profondeur. */
    objet: {
      source?: string | null;
      format?: string | null;
      sample_rate?: number | null;
      bit_depth?: number | null;
    } | null | undefined;
  }
  let { objet }: Props = $props();

  /** `null` quand la source n'est pas nommable — une radio n'a pas de provenance
   *  au sens où on l'entend ici. */
  const source = $derived.by(() => {
    const s = objet?.source ?? 'local';
    return s === 'radio' ? null : s;
  });

  /**
   * La qualité, en une expression courte : « FLAC 192/24 », « DSD128 ».
   *
   * Compacte, et non « FLAC · 192 kHz · 24-bit » : sur une vignette de 150 px,
   * la forme longue déborde et se fait élider — donc masquer, à nouveau.
   */
  const qualite = $derived.by(() => {
    if (!objet) return null;
    if (getQualityTier(objet) === 'dsd') {
      return (objet.sample_rate ?? 0) >= 5_000_000 ? 'DSD128' : 'DSD64';
    }
    const fmt = objet.format ? String(objet.format).toUpperCase() : null;
    const khz = objet.sample_rate ? Math.round(objet.sample_rate / 100) / 10 : null;
    const bits = objet.bit_depth ?? null;
    // Un disque sans fréquence connue n'affiche que son format : mieux vaut
    // « FLAC » seul qu'un « FLAC /  » bancal.
    const chiffres = khz ? `${khz}${bits ? '/' + bits : ''}` : null;
    return [fmt, chiffres].filter(Boolean).join(' ') || null;
  });
</script>

{#if source || qualite}
  <span class="qa">
    {#if source}<ServiceBadge {source} compact />{/if}
    {#if qualite}<span class="q">{qualite}</span>{/if}
  </span>
{/if}

<style>
  .qa{display:flex; align-items:center; gap:6px; margin-top:3px; min-width:0}
  /* Le chiffre s'élide, pas le badge : savoir d'où vient un disque prime sur
     savoir en quelle fréquence il est encodé. */
  .q{font:500 10px var(--v2-mono); letter-spacing:.02em; color:var(--v2-txt3);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
