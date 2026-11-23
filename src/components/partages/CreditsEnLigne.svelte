<script lang="ts" module>
  import type { TrackCredit } from '../../lib/types';

  export interface GroupeDeCredits {
    role: string;
    membres: TrackCredit[];
    reste: boolean;
  }
</script>

<script lang="ts">
  /**
   * LA LIGNE DES CRÉDITS de « Lecture en cours » — « Compositeur : A, B ·
   * Musicien : C (piano), D (basse), … » — web#2770 : chaque nom est un lien.
   *
   * Recette du 14/11 (Bertrand, « El niño ») : la ligne s'affichait
   * « Compositeur: Georges-Olivier Mondo,Nicolas Voulzy-Musicien: Alexis
   * Valet(vibraphone),… ». Les crédits étaient bien structurés en base ; c'est
   * le BALISAGE qui collait tout. Svelte 5 retire les espaces au début et à la
   * fin d'un bloc (`{#if}…{/if}`) et d'un élément : la virgule restait
   * collée au nom suivant, « (vibraphone) » perdait l'espace qui le précède,
   * « · » ses deux espaces. Les séparateurs sont donc écrits en EXPRESSIONS (`{', '}`),
   * que le compilateur ne touche jamais.
   */
  import LienEntite from './LienEntite.svelte';

  let {
    groupes,
    libelle,
  }: {
    groupes: GroupeDeCredits[];
    /** Le libellé traduit d'un rôle (« Compositeur », « Musicien »). */
    libelle: (role: string) => string;
  } = $props();
</script>

{#each groupes as g, gi (g.role)}{#if gi > 0}<span class="inline-credits-sep">{' · '}</span>{/if}{`${libelle(g.role)}: `}{#each g.membres as m, mi (mi)}{#if mi > 0}{', '}{/if}<LienEntite entite={{ type: 'personne', nom: m.artist_name, artiste: m.artist_id ? { id: m.artist_id, name: m.artist_name, source: 'local' } : { name: m.artist_name } }} />{#if m.instrument}{` (${m.instrument})`}{/if}{/each}{#if g.reste}{', …'}{/if}{/each}

<style>
  .inline-credits-sep { color: var(--tune-text-muted); }
</style>
