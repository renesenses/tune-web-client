<script lang="ts">
  /**
   * Le texte d'une biographie avec ses liens — renesenses/tune-server-rust#7910.
   *
   * Rendu des `bio_segments` du serveur, sans `{@html}` : un lien interne ouvre
   * la page de l'artiste ou de l'album dans Tune ; un lien de service (#8129)
   * ouvre la fiche Qobuz de l'artiste ou de l'album ; un lien externe (https, sur
   * un domaine de la source) s'ouvre dans un nouvel onglet. Voir
   * `lib/library/bioSegments`. Le texte est écrit d'une seule ligne de balisage
   * pour qu'aucune espace parasite ne s'insère entre deux segments.
   */
  import { get } from 'svelte/store';
  import { activeView } from '../../lib/stores/navigation';
  import { ouvrirLienDeBio, ouvrirLienDeServiceDeBio, type BioSegment } from '../../lib/library/bioSegments';

  interface Props {
    segments: BioSegment[];
  }
  let { segments }: Props = $props();

  function ouvrir(s: BioSegment) {
    if (s.lien) void ouvrirLienDeBio(s.lien, s.texte, get(activeView));
    else if (s.lien_service) void ouvrirLienDeServiceDeBio(s.lien_service, s.texte, get(activeView));
  }
</script>

{#each segments as s, i (i)}{#if s.lien}<button type="button" class="lien-bio" data-lien-bio={s.lien.type} onclick={() => ouvrir(s)}>{s.texte}</button>{:else if s.lien_service}<button type="button" class="lien-bio" data-lien-bio={s.lien_service.type} data-lien-service={s.lien_service.service} onclick={() => ouvrir(s)}>{s.texte}</button>{:else if s.url}<a class="lien-bio-externe" href={s.url} target="_blank" rel="noopener noreferrer">{s.texte}</a>{:else}{s.texte}{/if}{/each}

<style>
  .lien-bio {
    all: unset; cursor: pointer; color: var(--v2-acc1);
    text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 2px;
  }
  .lien-bio:hover, .lien-bio:focus-visible { text-decoration-color: currentColor; }
  .lien-bio:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 2px; border-radius: 2px; }
  .lien-bio-externe { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .lien-bio-externe:hover { color: var(--v2-acc1); }
</style>
