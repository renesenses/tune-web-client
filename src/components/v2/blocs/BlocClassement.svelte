<script lang="ts">
  /**
   * LE CLASSEMENT — rang, pochette, titre, artiste, nombre d'écoutes.
   *
   * UN composant pour DEUX blocs : albums les plus écoutés, titres les plus
   * écoutés. Même balisage dans l'ancien Tableau de bord (`.rank-list`), même
   * composant ici.
   *
   * 🔴 CE QUE LE BLOC SAIT FAIRE, ET CE QU'IL NE SAIT PAS.
   *
   * Il reçoit des `Element` déjà normalisés — les mêmes que le gros widget
   * « Vos tops » de l'accueil, fabriqués par les mêmes helpers
   * (`gestesAlbumTop`, `gestePisteTop`). Donc :
   *
   *  - la LIGNE joue (`el.jouer`), quand l'élément est jouable ;
   *  - le NOM D'ARTISTE ouvre la page artiste (`ouvrirArtisteParNom`), qui est
   *    une fonction de bibliothèque et n'a besoin de personne.
   *
   * ⚠️ Il n'OUVRE PAS la fiche d'un album. Cette fiche est un calque tenu par
   * `PageWidgets` (`ficheOuverte`, `AlbumDetailV2`), et un bloc est par
   * construction autonome : il ne reçoit que `donnees`. Ouvrir la fiche
   * depuis ici demanderait soit de passer les gestes de la page à chaque bloc
   * — ce qui recoudrait le couplage que la forme `bloc` défait — soit un
   * SECOND afficheur de fiche, qui divergerait du premier (c'est la leçon
   * écrite de #1016 et #1108). Le geste reste offert par le widget « Vos
   * tops » de l'accueil et par le réservoir `/dashboard`. Limite assumée,
   * dite ici plutôt que découverte par un testeur.
   */
  import type { Element } from '../../../lib/accueilWidgets';
  import { t } from '../../../lib/i18n';
  import { currentZone } from '../../../lib/stores/zones';
  import { ouvrirArtisteParNom } from '../../../lib/libraryNavigation';
  import { signalerEchecLecture } from '../../../lib/echecLecture';
  import AlbumArt from '../../partages/AlbumArt.svelte';

  let { donnees }: { donnees: Element[] | null } = $props();

  const elements = $derived(donnees ?? []);

  async function jouer(el: Element) {
    const zone = $currentZone?.id;
    if (!zone || !el.jouer) return;
    try {
      await el.jouer(zone);
    } catch (e) {
      // #3732 — un échec de lecture avalé rendait le clic muet. Le même
      // signalement que les vignettes de `PageWidgets`.
      signalerEchecLecture(e);
    }
  }
</script>

{#if !elements.length}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <ol class="liste">
    {#each elements as el, rang (el.id)}
      <li>
        <span class="rang">{rang + 1}</span>
        <button
          type="button"
          class="corps"
          disabled={!el.jouer}
          onclick={() => jouer(el)}
          aria-label={`${$t('common.play' as any)} — ${el.titre}`}
          title={el.jouer ? $t('common.play' as any) : undefined}
        >
          <span class="vign"><AlbumArt coverPath={el.cover ?? null} size={36} alt="" /></span>
          <span class="txt"><span class="t">{el.titre}</span></span>
        </button>
        {#if el.sous}
          <button
            type="button"
            class="art"
            onclick={() => ouvrirArtisteParNom(el.sous)}
            title={`${el.sous} — ${$t('dashboard.viewArtist' as any)}`}
          >{el.sous}</button>
        {/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .liste { list-style: none; margin: 0; padding: 0 30px; display: flex; flex-direction: column; gap: 3px; }
  .liste li { display: flex; align-items: center; gap: 8px; min-width: 0; border-radius: 10px; }
  .liste li:hover { background: var(--v2-hover); }
  .rang {
    flex: 0 0 22px; text-align: right; font: 500 12px var(--v2-sans);
    color: var(--v2-txt3); font-variant-numeric: tabular-nums;
  }
  .corps {
    flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 11px;
    padding: 5px 4px; border: 0; border-radius: 10px; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .corps:disabled { cursor: default; }
  .corps:focus-visible, .art:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: -2px; }
  .vign { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 6px; overflow: hidden; }
  .txt { min-width: 0; display: flex; flex-direction: column; }
  .t {
    font: 500 14px var(--v2-sans); color: var(--v2-txt);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .art {
    flex: 0 0 auto; max-width: 38%; padding: 0 8px 0 0; border: 0; background: none;
    font: 400 12px var(--v2-sans); color: var(--v2-txt2); cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right;
  }
  .art:hover { color: var(--v2-acc1); }

  @media (max-width: 1024px) { .liste { padding-left: 22px; padding-right: 22px; } }
  @media (max-width: 640px) {
    .liste { padding-left: 16px; padding-right: 16px; }
    /* Sur téléphone, titre ET artiste sur la même ligne se disputent la
       largeur et s'élident tous les deux. L'artiste passe dessous. */
    .liste li { flex-wrap: wrap; }
    .art { max-width: none; flex: 1 0 100%; text-align: left; padding: 0 0 6px 66px; }
  }
</style>
