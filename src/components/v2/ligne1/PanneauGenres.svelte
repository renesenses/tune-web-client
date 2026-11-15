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
   *
   * ## Le classement : CE QU'ON ÉCOUTE, pas ce qu'on possède (v0.9.168)
   *
   * Bertrand, 27/09/2026 : les pastilles se rangent par volume d'écoute
   * décroissant, et le panneau ne montre QUE les genres réellement écoutés.
   * `/library/genres` sert `plays` à côté de `count` depuis la 0.9.168 : la
   * même requête, déjà faite ici, porte les deux chiffres — la première ligne
   * se peint au démarrage et n'en supporterait pas une seconde.
   *
   * 🔴 Tant qu'aucune écoute n'est connue, l'ordre par taille de bibliothèque
   * REPREND la main : sans cela, une installation neuve afficherait une colonne
   * vide, qui passe pour une panne. Voir `classerGenresDuPanneau`.
   */
  import { tick } from 'svelte';
  import * as api from '../../../lib/api';
  import { t } from '../../../lib/i18n';
  import { activeView } from '../../../lib/stores/navigation';
  import { LARGEUR_GENRES, LARGEUR_GENRES_LEVENTE, TUILES_GENRES, classerGenresDuPanneau } from '../../../lib/premiereLigne';
  import PanneauL1 from './PanneauL1.svelte';

  /** La présentation de Levente (15/11/2026) : des tuiles sur deux colonnes. */
  let { levente = false }: { levente?: boolean } = $props();

  let phase = $state<'attente' | 'charge' | 'echec'>('attente');
  let genres = $state<{ name: string; count?: number; plays?: number }[]>([]);

  $effect(() => {
    let vivant = true;
    api
      .getGenres()
      .then((g) => {
        if (!vivant) return;
        // 🔴 LES PLUS ÉCOUTÉS d'abord, et eux SEULS — v0.9.168.
        //
        // Le panneau triait sur `count`, le nombre d'albums en bibliothèque :
        // il mettait donc en tête ce qu'on POSSÈDE le plus, pas ce qu'on
        // ÉCOUTE. La règle, le repli quand rien n'a encore été écouté, et
        // l'ordre d'égalité vivent dans `classerGenresDuPanneau` — une seule
        // définition, gardée par `panneauGenresParEcoutes168.test.ts`.
        genres = classerGenresDuPanneau(g ?? []);
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

<PanneauL1 titre={$t('nav.genres' as any)} largeur={levente ? LARGEUR_GENRES_LEVENTE : LARGEUR_GENRES} {levente}>
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
  {:else if levente}
    <!-- 15/11/2026, maquette de Levente : des TUILES sur deux colonnes, et
         non plus une colonne de pastilles. La maquette pose une photo derrière
         chaque genre ; le serveur n'en a pas — la tuile prend une teinte de
         l'accent du thème, jamais une couleur écrite ici. -->
    <ul class="tuiles">
      {#each genres.slice(0, TUILES_GENRES) as g, i (g.name)}
        <li>
          <button class="tuile" data-teinte={i % 3} onclick={() => ouvrir(g.name)} title={g.name}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" aria-hidden="true"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>
            <span>{g.name}</span>
          </button>
        </li>
      {/each}
    </ul>
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
  .etat { margin: 0; color: var(--v2-txt3); font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  li { min-width: 0; }
  button {
    display: block; width: 100%; text-align: left; min-width: 0;
    padding: 5px 10px; border-radius: var(--v2-r-pill);
    border: 1px solid var(--v2-line2); background: var(--v2-surface);
    color: var(--v2-txt2); font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  button:hover { border-color: var(--v2-acc1); color: var(--v2-txt); }
  ul.tuiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tuile {
    display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; height: 60px;
    padding: 0 12px; border-radius: var(--v2-r-md); text-align: left; cursor: pointer;
    border: 1px solid var(--v2-line2);
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--v2-acc1) 30%, var(--v2-surface)),
      var(--v2-surface));
    color: var(--v2-txt); font: 600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans);
  }
  .tuile[data-teinte='1'] {
    background: linear-gradient(135deg, color-mix(in srgb, var(--v2-acc2) 30%, var(--v2-surface)), var(--v2-surface));
  }
  .tuile[data-teinte='2'] {
    background: linear-gradient(135deg, color-mix(in srgb, var(--v2-acc1) 14%, var(--v2-surface2)), var(--v2-surface));
  }
  .tuile:hover { border-color: var(--v2-acc1); }
  .tuile svg { flex: 0 0 auto; width: 16px; height: 16px; color: var(--v2-acc1); }
  .tuile span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

</style>
