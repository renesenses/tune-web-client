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
  import DisponibiliteUpnp from './DisponibiliteUpnp.svelte';
  import ServiceBadge from '../partages/ServiceBadge.svelte';
  import { qualiteCompacte } from '../../lib/typeDeFichier';

  interface Props {
    /** Album ou piste : tout objet portant format, fréquence et profondeur. */
    objet: {
      source?: string | null;
      source_id?: string | null;
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
  // #1901 — la règle vit dans `lib/typeDeFichier`, où elle est éprouvée :
  // le DSD y dit son vrai multiple (DSD256, DSD512) et son conteneur (DSF).
  const qualite = $derived(qualiteCompacte(objet));
</script>

{#if source || qualite}
  <span class="qa">
    {#if source}<ServiceBadge {source} compact />{/if}
    {#if source === 'upnp'}<DisponibiliteUpnp sourceId={objet?.source_id} />{/if}
    {#if qualite}<span class="q">{qualite}</span>{/if}
  </span>
{/if}

<style>
  .qa{display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:3px; min-width:0}
  /* Le chiffre s'élide, pas le badge : savoir d'où vient un disque prime sur
     savoir en quelle fréquence il est encodé. */
  .q{font:500 10px var(--v2-mono); letter-spacing:.02em; color:var(--v2-txt3);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
