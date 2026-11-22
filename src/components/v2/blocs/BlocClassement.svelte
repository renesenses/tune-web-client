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
   *
   * web#3117 — TROISIÈME bloc : « Top artistes ». Un élément d'ARTISTE
   * (`ouvrir: 'artiste'`, `elementsArtistesTop`) a un portrait ROND, sa ligne
   * ouvre la page artiste, et son sous-titre est le nombre de lectures — du
   * texte, pas un lien.
   */
  import type { Element } from '../../../lib/accueilWidgets';
  import { t } from '../../../lib/i18n';
  import VideBloc from './VideBloc.svelte';
  import { cleVide, ICONES } from '../../../lib/tableauDeBordPeriode';
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

  /**
   * Design v3 (§9.5) — huit rangs d'abord ; les autres restent à portée par
   * « Tout afficher » / « Afficher moins », sur place (le défilement reste
   * celui de la page, jamais un ascenseur dans la carte). Le bouton n'existe
   * que s'il y a davantage.
   */
  const RANGS_INITIAUX = 8;
  let tout = $state(false);
  const visibles = $derived(tout ? elements : elements.slice(0, RANGS_INITIAUX));
  /** La colonne « Lectures » n'existe que si le serveur donne le compte. */
  const avecCompte = $derived(elements.some((el) => typeof el.compte === 'number'));

  /** L'album de la bibliothèque que la ligne ouvre, ou `null`. */
  function albumAOuvrir(el: Element): number | null {
    const id = el.ouvrir === 'album' ? el.fiche?.id : null;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  }

  /** web#3117 — une ligne d'ARTISTE : elle ouvre sa page. */
  function estArtiste(el: Element): boolean {
    return el.ouvrir === 'artiste' && !!el.artiste;
  }

  function activer(el: Element) {
    if (estArtiste(el)) {
      void ouvrirArtisteDepuis(
        el.artisteService ? { name: el.artiste, service_ecoute: el.artisteService } : { name: el.artiste },
        get(activeView),
      );
      return;
    }
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
  <VideBloc message={$t(cleVide() as any)} icone={ICONES.titres} />
{:else}
  {#if avecCompte}
    <div class="colonnes" aria-hidden="true"><span>{$t('dashboard.totals.plays' as any)}</span></div>
  {/if}
  <ol class="liste">
    {#each visibles as el, rang (el.id)}
      {@const artiste = estArtiste(el)}
      {@const ouvre = artiste || albumAOuvrir(el) != null}
      {@const libelle = artiste ? $t('dashboard.viewArtist' as any) : $t(ouvre ? 'common.open' as any : 'common.play' as any)}
      <li class:avec-sous={!!el.sous}>
        <span class="rang">{rang + 1}</span>
        <span class="vign" class:rond={artiste} aria-hidden="true"><AlbumArt coverPath={el.cover ?? null} size={30} alt="" round={artiste} fallbackInitials={artiste ? el.titre?.slice(0, 1) : null} /></span>
        <!-- La ligne entière est la cible du geste principal (le bouton
             s'étend sous la rangée) ; l'artiste et ▶ restent des contrôles
             FRÈRES, posés au-dessus. -->
        <button
          type="button"
          class="corps"
          disabled={!ouvre && !el.jouer}
          onclick={() => activer(el)}
          aria-label={`${libelle} — ${el.titre}`}
          title={ouvre || el.jouer ? libelle : undefined}
        ><span class="t">{el.titre}</span></button>
        {#if el.sous && artiste}
          <!-- web#3117 — le nombre de lectures : du texte, pas un lien. -->
          <span class="art compte" title={el.sous}>{el.sous}</span>
        {:else if el.sous}
          <button
            type="button"
            class="art"
            onclick={() => ouvrirArtiste(el)}
            title={`${el.sous} — ${$t('dashboard.viewArtist' as any)}`}
          >{el.sous}</button>
        {/if}
        {#if ouvre && el.jouer}
          <button type="button" class="lire" onclick={() => jouer(el)}
            title={$t('common.play' as any)} aria-label={`${$t('common.play' as any)} — ${el.titre}`}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        {/if}
        {#if avecCompte}
          <span class="nb">{typeof el.compte === 'number' ? el.compte : ''}</span>
        {/if}
      </li>
    {/each}
  </ol>
  {#if elements.length > RANGS_INITIAUX}
    <button type="button" class="plus" aria-expanded={tout} onclick={() => (tout = !tout)}>
      {tout ? $t('dashboard.showLess' as any) : $t('dashboard.showAll' as any)}
    </button>
  {/if}
{/if}

<style>
  /* Design v3 (§9.5) — rang, pochette de 30 px, deux lignes (titre, puis
     artiste en second), compte à droite ; une rangée de 36 à 40 px. La grille
     garde le titre et l'artiste dans la même colonne, l'un sous l'autre. */
  .colonnes { display: flex; justify-content: flex-end; padding: 0 var(--bloc-marge, 30px) 4px;
    font: 500 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3); }
  .liste { list-style: none; margin: 0; padding: 0 var(--bloc-marge, 30px); display: flex; flex-direction: column; gap: 2px; }
  .liste li {
    position: relative; display: grid; align-items: center; column-gap: 10px; min-width: 0; min-height: 40px;
    grid-template-columns: 18px 30px minmax(0, 1fr) auto auto;
    grid-template-areas: "rang vign titre lire nb" "rang vign art lire nb";
    border-radius: 6px; padding: 2px 4px 2px 0;
  }
  .liste li:not(.avec-sous) { grid-template-areas: "rang vign titre lire nb" "rang vign titre lire nb"; }
  .liste li:hover { background: var(--v2-hover); }
  .rang {
    grid-area: rang; text-align: right; font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    color: var(--v2-txt3); font-variant-numeric: tabular-nums;
  }
  .vign { grid-area: vign; width: 30px; height: 30px; border-radius: 4px; overflow: hidden; }
  /* web#3117 — le portrait d'un artiste est ROND, comme partout ailleurs. */
  .vign.rond { border-radius: 50%; }
  .corps {
    grid-area: titre; align-self: end; min-width: 0; padding: 0; border: 0; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .liste li:not(.avec-sous) .corps { align-self: center; }
  /* La cible s'étend à toute la rangée ; les contrôles frères passent dessus. */
  .corps::after { content: ''; position: absolute; inset: 0; border-radius: 6px; }
  .corps:disabled { cursor: default; }
  .corps:focus-visible { outline: none; }
  .corps:focus-visible::after { outline: 2px solid var(--v2-acc1); outline-offset: -2px; }
  .art:focus-visible, .lire:focus-visible, .plus:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 1px; }
  .t {
    display: block; font: 500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .art {
    grid-area: art; align-self: start; justify-self: start; position: relative; z-index: 1; max-width: 100%;
    padding: 0; border: 0; background: none; text-align: left;
    font: 400 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2); cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .art:hover { color: var(--v2-acc1); }
  .art.compte { cursor: default; font-variant-numeric: tabular-nums; }
  .art.compte:hover { color: var(--v2-txt2); }
  /* web#2770 — le ▶ d'une ligne qui OUVRE : la lecture ne se perd pas. */
  .lire {
    grid-area: lire; position: relative; z-index: 1; width: 28px; height: 28px; display: grid; place-items: center;
    border: 0; border-radius: 50%; background: none; color: var(--v2-txt2); cursor: pointer;
  }
  .lire svg { width: 14px; height: 14px; }
  .lire:hover { color: var(--v2-acc1); background: var(--v2-surface2); }
  .nb {
    grid-area: nb; min-width: 2ch; text-align: right; font: 600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    color: var(--v2-txt); font-variant-numeric: tabular-nums;
  }
  .plus {
    align-self: flex-start; margin: 8px var(--bloc-marge, 30px) 0; padding: 4px 12px; min-height: 28px; border-radius: var(--v2-r-pill, 20px);
    border: 1px solid var(--v2-line2); background: none; color: var(--v2-txt2);
    font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor: pointer;
  }
  .plus:hover { border-color: var(--v2-acc2); color: var(--v2-txt); }

  /* Au doigt : 44 px de cible effective. */
  @media (hover: none) and (pointer: coarse) {
    .liste li { min-height: 44px; }
    .lire { width: 44px; height: 44px; }
    .plus { min-height: 44px; }
  }
  @media (max-width: 1024px) { .liste, .colonnes { padding-left: var(--bloc-marge, 22px); padding-right: var(--bloc-marge, 22px); } }
  @media (max-width: 640px) { .liste, .colonnes { padding-left: var(--bloc-marge, 16px); padding-right: var(--bloc-marge, 16px); } }
</style>
