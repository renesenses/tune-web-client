<script lang="ts">
  /**
   * LE PANNEAU DES GENRES de la première ligne — une colonne de pastilles.
   *
   * ## Le clic ouvre le GENRE, pas la liste des genres
   *
   * « Je sélectionne une smart collection et le raccourci me renvoie sur la
   * liste » (Bertrand, 05/09/2026) : un raccourci qui dépose sur un écran
   * général ne rend pas le service qu'il promet. La Bibliothèque sait déjà
   * sauter sur une valeur de facette — elle écoute `tune:v2-facette`, que les
   * Favoris et la Recherche émettent déjà. On rejoue ce chemin plutôt que
   * d'en inventer un second (leçon du `?? onPlay` de #1016).
   *
   * ⚠️ Ce saut est réservé au niveau INTERMÉDIAIRE : `LibraryV2` refuse
   * l'évènement en deçà, parce que les onglets de facette n'y sont pas
   * affichés. Le clic ouvre alors la Bibliothèque sans sauter — jamais un
   * écran vide.
   *
   * ## Pourquoi `/library/genres` et non le magasin `genres`
   *
   * `stores/library.ts` dérive une liste de genres des albums DÉJÀ chargés :
   * elle ne vaut que ce que la coquille a eu le temps de charger, et une
   * bibliothèque paginée la rend fausse. La route, elle, compte sur la base.
   */
  import { tick } from 'svelte';
  import * as api from '../../../lib/api';
  import { t } from '../../../lib/i18n';
  import { activeView } from '../../../lib/stores/navigation';
  import { LARGEUR_GENRES } from '../../../lib/premiereLigne';
  import PanneauL1 from './PanneauL1.svelte';

  let phase = $state<'attente' | 'charge' | 'echec'>('attente');
  let genres = $state<{ name: string; count: number }[]>([]);

  $effect(() => {
    let vivant = true;
    api
      .getGenres()
      .then((g) => {
        if (!vivant) return;
        // Les plus fournis d'abord : une colonne de quinze pastilles rangée
        // par ordre alphabétique commencerait par ce que personne n'écoute.
        genres = (g ?? [])
          .filter((x) => x?.name?.trim())
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
        phase = 'charge';
      })
      .catch(() => {
        if (vivant) phase = 'echec';
      });
    return () => { vivant = false; };
  });

  async function ouvrir(nom: string) {
    activeView.set('library');
    await tick();
    window.dispatchEvent(
      new CustomEvent('tune:v2-facette', { detail: { onglet: 'genres', valeur: nom } }),
    );
  }
</script>

<PanneauL1 titre={$t('nav.genres' as any)} largeur={LARGEUR_GENRES}>
  {#snippet icone()}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round"><circle cx="7" cy="18" r="3"/><path d="M10 18V5l10-2v13"/><circle cx="17" cy="16" r="3"/></svg>
  {/snippet}

  {#if phase === 'attente'}
    <p class="etat">{$t('common.loading' as any)}</p>
  {:else if phase === 'echec'}
    <p class="etat">{$t('v2.home.widgetFailed' as any)}</p>
  {:else if !genres.length}
    <p class="etat">{$t('v2.home.widgetEmpty' as any)}</p>
  {:else}
    <ul>
      {#each genres as g (g.name)}
        <li>
          <button onclick={() => ouvrir(g.name)} title={g.name}>{g.name}</button>
        </li>
      {/each}
    </ul>
  {/if}
</PanneauL1>

<style>
  .etat { margin: 0; color: var(--v2-txt3); font: 400 12px var(--v2-sans); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  li { min-width: 0; }
  button {
    display: block; width: 100%; text-align: left; min-width: 0;
    padding: 5px 10px; border-radius: var(--v2-r-pill);
    border: 1px solid var(--v2-line2); background: var(--v2-surface);
    color: var(--v2-txt2); font: 500 12px var(--v2-sans); cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  button:hover { border-color: var(--v2-acc1); color: var(--v2-txt); }
</style>
