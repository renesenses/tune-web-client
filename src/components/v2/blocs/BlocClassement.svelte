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
   *  - la LIGNE OUVRE l'album de la bibliothèque quand l'élément en désigne un
   *    (`ouvrir: 'album'` + `fiche.id`) — web#2770, lot 4 : « clic =
   *    navigation, jamais lecture » ; la lecture garde alors son bouton ▶ ;
   *  - sans album à ouvrir, la ligne joue (`el.jouer`), comme avant ;
   *  - le NOM D'ARTISTE ouvre la page artiste commune (`ouvrirArtisteDepuis`,
   *    #1232), qui n'a besoin de personne.
   *
   * ⚠️ L'album s'ouvre dans la BIBLIOTHÈQUE (`pendingLibraryAlbum`, le contrat
   * que `LibraryV2` lit — le même chemin que la colonne Album des tableaux de
   * pistes), pas dans un calque du Tableau de bord : un bloc est par
   * construction autonome, il ne reçoit que `donnees`, et un second afficheur
   * de fiche divergerait du premier (leçon écrite de #1016 et #1108). Un album
   * de SERVICE n'a pas de fiche ici : sa ligne joue.
   */
  import type { Element } from '../../../lib/accueilWidgets';
  import { t } from '../../../lib/i18n';
  import { currentZone } from '../../../lib/stores/zones';
  import { get } from 'svelte/store';
  import { ouvrirArtisteDepuis } from '../../../lib/ouvrirArtisteDepuis';
  import { ouvrirAlbumLocal } from '../../../lib/lienEntite';
  import { activeView } from '../../../lib/stores/navigation';
  import { signalerEchecLecture } from '../../../lib/echecLecture';
  import AlbumArt from '../../partages/AlbumArt.svelte';

  let { donnees }: { donnees: Element[] | null } = $props();

  /**
   * #1232 — la PAGE COMMUNE, comme le widget « Vos tops » de l'accueil
   * (`PageWidgets.ouvrirElement`) : même chemin, même rapprochement par le nom,
   * et le service d'écoute quand le classement le porte (#1696). Le clic
   * passait par `libraryNavigation.ouvrirArtisteParNom`, la navigation de
   * l'ancienne fiche de bibliothèque, retirée.
   */
  function ouvrirArtiste(el: Element) {
    if (!el.sous) return;
    const nom = el.artiste ?? el.sous;
    void ouvrirArtisteDepuis(
      el.artisteService ? { name: nom, service_ecoute: el.artisteService } : { name: nom },
      get(activeView),
    );
  }

  const elements = $derived(donnees ?? []);

  /** L'album de la bibliothèque que la ligne ouvre, ou `null`. */
  function albumAOuvrir(el: Element): number | null {
    const id = el.ouvrir === 'album' ? el.fiche?.id : null;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  }

  function activer(el: Element) {
    const id = albumAOuvrir(el);
    if (id != null) ouvrirAlbumLocal(id);
    else void jouer(el);
  }

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
  <!-- #1781 — « aucun historique » était faux : ce bloc ne lit que les SEPT
       derniers jours (`PERIODE` de `tableauDeBordWidgets`). Une semaine
       vide ne dit rien de l'historique plus ancien. -->
  <p class="rien">{$t('dashboard.emptyLast7Days' as any)}</p>
{:else}
  <ol class="liste">
    {#each elements as el, rang (el.id)}
      {@const ouvre = albumAOuvrir(el) != null}
      <li>
        <span class="rang">{rang + 1}</span>
        <button
          type="button"
          class="corps"
          disabled={!ouvre && !el.jouer}
          onclick={() => activer(el)}
          aria-label={`${$t(ouvre ? 'common.open' as any : 'common.play' as any)} — ${el.titre}`}
          title={ouvre ? $t('common.open' as any) : el.jouer ? $t('common.play' as any) : undefined}
        >
          <span class="vign"><AlbumArt coverPath={el.cover ?? null} size={36} alt="" /></span>
          <span class="txt"><span class="t">{el.titre}</span></span>
        </button>
        {#if ouvre && el.jouer}
          <button type="button" class="lire" onclick={() => jouer(el)}
            title={$t('common.play' as any)} aria-label={`${$t('common.play' as any)} — ${el.titre}`}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        {/if}
        {#if el.sous}
          <button
            type="button"
            class="art"
            onclick={() => ouvrirArtiste(el)}
            title={`${el.sous} — ${$t('dashboard.viewArtist' as any)}`}
          >{el.sous}</button>
        {/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); }

  .liste { list-style: none; margin: 0; padding: 0 30px; display: flex; flex-direction: column; gap: 3px; }
  .liste li { display: flex; align-items: center; gap: 8px; min-width: 0; border-radius: 10px; }
  .liste li:hover { background: var(--v2-hover); }
  .rang {
    flex: 0 0 22px; text-align: right; font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    color: var(--v2-txt3); font-variant-numeric: tabular-nums;
  }
  .corps {
    flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 11px;
    padding: 5px 4px; border: 0; border-radius: 10px; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .corps:disabled { cursor: default; }
  .corps:focus-visible, .art:focus-visible, .lire:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: -2px; }
  .vign { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 6px; overflow: hidden; }
  .txt { min-width: 0; display: flex; flex-direction: column; }
  .t {
    font: 500 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* web#2770 — le ▶ d'une ligne qui OUVRE : la lecture ne se perd pas. */
  .lire {
    flex: 0 0 28px; width: 28px; height: 28px; display: grid; place-items: center;
    border: 0; border-radius: 50%; background: none; color: var(--v2-txt2); cursor: pointer;
  }
  .lire svg { width: 16px; height: 16px; }
  .lire:hover { color: var(--v2-acc1); background: var(--v2-surface2); }
  .art {
    flex: 0 0 auto; max-width: 38%; padding: 0 8px 0 0; border: 0; background: none;
    font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); cursor: pointer;
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
