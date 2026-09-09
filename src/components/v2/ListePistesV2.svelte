<script lang="ts">
  /**
   * Une liste de pistes — en TABLEAU au mode Essentiel, en lignes ailleurs.
   *
   * Chantier ouvert par Bertrand le 07/09/2026 sur la maquette de Levente.
   *
   * ## Pourquoi un conteneur, et pas une ligne enrichie
   *
   * Un tableau a un EN-TÊTE et des colonnes alignées. L'en-tête et les lignes
   * doivent partager le même `grid-template-columns`, sinon ils divergent — la
   * leçon de la vue Liste de la Bibliothèque, où un gabarit par ligne faisait
   * que les colonnes ne s'alignaient d'aucune ligne à l'autre (Bertrand,
   * 05/09/2026). Un seul gabarit, calculé ici, passé en variable CSS.
   *
   * ## Les deux autres modes ne bougent pas
   *
   * « Pour le moment les deux autres modes restent inchangés » (Bertrand). Au
   * dessus d'Essentiel, ce composant rend exactement ce qu'il rendait avant :
   * des `LignePisteV2`, mêmes props, même apparence. Le tableau n'est pas un
   * remplacement, c'est une seconde forme.
   *
   * ## Les actions restent celles de la v1
   *
   * « 3 actions est limitatif, on garde les actions de la v1 » (Bertrand). La
   * maquette en montre trois ; `PisteActions` en porte six — lire, lire
   * ensuite, file, playlist, étiquettes, favori — avec ses propres règles
   * (certaines réservées aux pistes locales). On le pose tel quel plutôt que
   * de réécrire une barre d'actions qui divergerait de l'autre.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { currentTrack, currentTrackId, playbackState, etatDeLaLigne }
    from '../../lib/stores/nowPlaying';
  import IndicateurLecture from './IndicateurLecture.svelte';
  import {
    colonnesRetenues, gabaritGrille, valeurColonne, type CleColonne,
  } from '../../lib/colonnesPistes';
  import type { Track } from '../../lib/types';
  import LignePisteV2 from './LignePisteV2.svelte';
  import PisteActions from './PisteActions.svelte';
  import QualityBadge from '../QualityBadge.svelte';

  interface Props {
    pistes: Track[];
    /** Ce que fait un clic sur la ligne. Reçoit le rang, comme les boucles
     *  qu'il remplace : plusieurs écrans lisent « à partir d'ici ». */
    onLire: (piste: Track, index: number) => void;
    /**
     * D'où vient le numéro affiché.
     *  - `piste` : `track_number` de l'album, replié sur le rang s'il manque ;
     *  - `rang`  : la position dans la liste ;
     *  - `aucune`: pas de numéro, même si la colonne est cochée.
     */
    numerotation?: 'piste' | 'rang' | 'aucune';
    /** Transmis tel quel au rendu en LIGNES (modes Avancé et Expert). */
    avecAlbum?: boolean;
    pochette?: boolean;
    /**
     * 🔴 Une FABRIQUE, pas un gestionnaire.
     *
     * Seul l'appelant sait si l'album de CETTE piste est chargé : la
     * Bibliothèque n'ouvre la fiche que pour un album présent dans son
     * magasin. Un gestionnaire unique montrerait la loupe sur toutes les
     * lignes, y compris celles qu'elle ne peut pas ouvrir — un bouton qui ne
     * fait rien est pire qu'un bouton absent.
     *
     * Rendre `null` pour une piste, c'est dire « pas de loupe ici ».
     * Sans objet au mode tableau, qui n'a pas de pochette.
     */
    ouvertureAlbum?: ((piste: Track, index: number) => (() => void) | null) | null;
    /**
     * Contenu propre à un écran, rendu APRÈS chaque ligne.
     *
     * La playlist y met son bouton « retirer », l'historique l'instant et le
     * cœur d'un titre radio. Il devient une COLONNE de la grille, pas une
     * enveloppe : enveloppé, la ligne serait plus étroite que l'en-tête et
     * les colonnes ne tomberaient plus en face.
     *
     * Le fragment est compilé chez l'appelant : ses styles le suivent.
     */
    apres?: Snippet<[Track, number]>;
    /**
     * 🔴 La clé de liste, quand `id` ne suffit pas.
     *
     * L'Historique peut afficher DEUX FOIS la même piste — écoutée deux fois.
     * Deux clés identiques et Svelte s'arrête sur `each_key_duplicate` : la
     * liste entière disparaît. C'est le piège déjà documenté dans les Favoris,
     * où toute piste de service porte `id: null`.
     *
     * Par défaut `id`, replié sur le rang. Un écran qui sait mieux le dit.
     */
    clef?: (piste: Track, index: number) => string | number;
    /**
     * Largeur de la colonne du suffixe. Une longueur CSS, jamais `auto`.
     *
     * Voir le commentaire du gabarit : une colonne dimensionnée par son
     * contenu se résout dans CHAQUE grille séparément, donc différemment dans
     * l'en-tête (vide) et dans les lignes.
     */
    largeurApres?: string;
  }
  let {
    pistes, onLire, numerotation = 'rang',
    avecAlbum = true, pochette = true, ouvertureAlbum = null, apres,
    clef = (p, i) => p.id ?? i, largeurApres = '96px',
  }: Props = $props();

  const mode = $derived($preferences.settingsLevel);
  const enTableau = $derived(mode === 'beginner');

  // Le MODE est passé : une colonne réservée à Expert ne doit pas apparaître
  // si un réglage plus ancien la coche pour un mode inférieur.
  const colonnes = $derived(colonnesRetenues($preferences.v2Colonnes?.[mode] ?? [], mode));
  /**
   * 🔴 AUCUN `auto` dans ce gabarit. C'est la règle, et elle a une raison.
   *
   * L'en-tête et les lignes sont des grilles SÉPARÉES qui partagent le même
   * `grid-template-columns`. Une colonne dimensionnée par son contenu — `auto`,
   * `max-content` — se résout donc dans chacune indépendamment : à zéro dans
   * l'en-tête, où la cellule d'actions est vide, et à ~178 px dans les lignes.
   * Les colonnes en `fr` absorbent l'écart, et TOUS les en-têtes dérivent vers
   * la droite. Signalé par Bertrand le 07/09/2026, capture à l'appui : « TIME »
   * deux cents pixels à droite de « 5:24 ».
   *
   * Pire : les actions sont CONDITIONNELLES — playlist et étiquettes ne sont
   * offertes que sur une piste locale. En `auto`, deux lignes voisines
   * n'auraient donc pas la même largeur d'actions, et se désaligneraient entre
   * elles.
   *
   * C'est la leçon de la vue Liste de la Bibliothèque, écrite le 05/09 et que
   * j'ai réintroduite ici. Une garde la tient désormais.
   *
   * 178 px = six boutons de 28 px + cinq gouttières de 2 px, la barre pleine.
   */
  const LARGEUR_ACTIONS = '178px';
  const gabarit = $derived(
    `${gabaritGrille(colonnes)} ${LARGEUR_ACTIONS}${apres ? ` ${largeurApres}` : ''}`,
  );

  /**
   * L'état de lecture d'une ligne, en mode TABLEAU (#1845).
   *
   * Le mode lignes délègue à `LignePisteV2`, qui le calcule chez lui ; le
   * tableau rend ses cellules lui-même et doit donc le faire ici. Les trois
   * magasins sont lus UNE fois, dans des `$derived` : lus dans la fonction,
   * ils seraient réabonnés à chaque ligne de chaque rendu.
   */
  const npId = $derived($currentTrackId);
  const npPiste = $derived($currentTrack);
  const npEtat = $derived($playbackState);
  const etatDe = (p: Track) => etatDeLaLigne(p, npId, npPiste, npEtat);

  function numero(p: Track, i: number): string | null {
    if (numerotation === 'aucune') return null;
    if (numerotation === 'rang') return String(i + 1);
    return String(p.track_number || i + 1);
  }

  /** La valeur d'une cellule. Le numéro est le seul cas que le modèle ne peut
   *  pas trancher seul : il dépend de l'écran, pas de la piste. */
  function cellule(p: Track, i: number, cle: CleColonne): string | null {
    return cle === 'num' ? numero(p, i) : valeurColonne(p, cle);
  }
</script>

{#if !enTableau}
  <!-- Modes Avancé et Expert : inchangés, à la virgule près. Le suffixe garde
       la même enveloppe en grille que les écrans avaient chez eux. -->
  {#each pistes as p, i (clef(p, i))}
    {@const ouvrir = ouvertureAlbum?.(p, i) ?? null}
    {#if apres}
      <div class="avecSuffixe">
        <LignePisteV2
          piste={p}
          numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
          onLire={() => onLire(p, i)}
          {avecAlbum}
          {pochette}
          onOuvrirAlbum={ouvrir}
        />
        <!--
          🔴 Le suffixe est enveloppé, et ce n'est pas cosmétique.

          `.avecSuffixe` est une grille à DEUX colonnes. Un extrait qui rend
          plusieurs éléments racine — l'Historique en rend deux, l'heure et le
          cœur radio — en posait donc TROIS dans deux colonnes : le troisième
          passait à une seconde ligne IMPLICITE, sous la piste.

          Le cœur radio est en `opacity:0` hors survol : la ligne supplémentaire
          était invisible, et coûtait pourtant 28 px de hauteur plus les 8 px de
          gouttière. Bertrand, 09/09/2026 : « Historique : diminue l'espace
          entre les pistes ». Ce n'était pas un réglage d'espacement, c'était
          une ligne de grille en trop, à chaque piste.

          Une enveloppe, et le nombre de colonnes cesse de dépendre de ce que
          l'appelant a écrit dans son extrait.
        -->
        <span class="suffixe">{@render apres(p, i)}</span>
      </div>
    {:else}
      <LignePisteV2
        piste={p}
        numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
        onLire={() => onLire(p, i)}
        {avecAlbum}
        {pochette}
        onOuvrirAlbum={ouvrir}
      />
    {/if}
  {/each}
{:else}
  <div class="tbl" style="--tcols:{gabarit}" role="table">
    <div class="thead" role="row">
      {#each colonnes as c (c.cle)}
        <span class="th" class:d={c.align === 'droite'} class:c={c.align === 'centre'}
          role="columnheader">{$t(c.cleI18n as any)}</span>
      {/each}
      <!-- La colonne d'actions n'a pas d'en-tête : son contenu se lit seul, et
           un libellé y serait répété sur chaque ligne pour rien. -->
      <span class="th" role="columnheader" aria-label={$t('v2.tcol.actions' as any)}></span>
      {#if apres}<span class="th" role="columnheader"></span>{/if}
    </div>

    {#each pistes as p, i (clef(p, i))}
      {@const etat = etatDe(p)}
      <div class="trow" class:np={etat != null} aria-current={etat ? 'true' : undefined}
        role="row">
        {#each colonnes as c (c.cle)}
          {#if c.cle === 'quality'}
            <span class="td" role="cell">
              <QualityBadge format={p.format} sampleRate={p.sample_rate}
                bitDepth={p.bit_depth} source={p.source} />
            </span>
          {:else if c.verrouillee}
            <!-- Le TITRE porte le clic de lecture : c'est la cible la plus
                 large et la plus évidente de la ligne. -->
            <button class="td titre" onclick={() => onLire(p, i)} title={p.title}>
              <!-- L'indicateur est DANS la cellule du titre : une colonne de plus
                   décalerait l'en-tête, et la règle de ce composant est qu'un
                   seul gabarit vaut pour l'en-tête et pour les lignes. -->
              <IndicateurLecture {etat} />
              <span class="ttxt">{cellule(p, i, c.cle) ?? ''}</span>
            </button>
          {:else}
            {@const v = cellule(p, i, c.cle)}
            <!-- Une cellule sans valeur reste VIDE : « — » affirmerait une
                 absence qu'on n'a pas mesurée. -->
            <span class="td" class:d={c.align === 'droite'} class:c={c.align === 'centre'}
              role="cell" title={v ?? ''}>{v ?? ''}</span>
          {/if}
        {/each}
        <span class="td act" role="cell"><PisteActions piste={p} /></span>
        {#if apres}<span class="td act" role="cell">{@render apres(p, i)}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* 🔴 UN seul gabarit, posé sur le conteneur et hérité par l'en-tête comme
     par les lignes. Deux gabarits calculés séparément divergent — c'est le
     défaut d'alignement relevé sur la vue Liste le 05/09/2026. */
  .tbl{display:flex; flex-direction:column; min-width:0}
  .thead, .trow{display:grid; grid-template-columns:var(--tcols); align-items:center;
    gap:14px; padding:0 10px}
  .thead{position:sticky; top:0; z-index:2; background:var(--v2-bg);
    border-bottom:1px solid var(--v2-line2); padding-bottom:9px; margin-bottom:4px}
  .th{font:600 11px var(--v2-sans); letter-spacing:.04em; color:var(--v2-txt3);
    text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  .trow{border-radius:9px; color:var(--v2-txt2); min-height:46px}
  .trow:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .trow.np{color:var(--v2-acc1)}

  .td{font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Les colonnes de chiffres s'alignent à droite, en chiffres tabulaires :
     sans quoi la durée saute d'un pixel d'une ligne à l'autre. */
  .th.d, .td.d{text-align:right; font-variant-numeric:tabular-nums}
  .th.c, .td.c{text-align:center}

  .titre{display:flex; align-items:center; gap:7px;
    padding:0; border:0; background:transparent; cursor:pointer; text-align:left;
    font:600 13.5px var(--v2-sans); color:var(--v2-txt); min-width:0}
  /* C'est le TEXTE qui s'élide, jamais l'indicateur : un repère tronqué ne
     repère plus rien. */
  .ttxt{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .trow.np .titre{color:var(--v2-acc1)}
  .titre:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px; border-radius:4px}

  /* Les actions sont calées à DROITE : une piste sans playlist ni étiquettes
     en montre quatre au lieu de six, et l'alignement se ferait sinon sur la
     gauche — les cœurs ne seraient plus l'un sous l'autre. */
  .act{overflow:visible; display:flex; align-items:center; justify-content:flex-end}

  /* Le suffixe en mode LIGNES : la même grille que les écrans avaient chez
     eux (`1fr auto`), pour que rien ne bouge à leurs yeux. */
  .avecSuffixe{display:grid; grid-template-columns:minmax(0,1fr) auto;
    align-items:center; gap:8px}
  /* L'enveloppe du suffixe : quel que soit le nombre d'éléments que l'extrait
     rend, ils tiennent sur UNE ligne et dans UNE colonne. */
  .suffixe{display:flex; align-items:center; gap:8px; justify-content:flex-end}

  /* Sous 720 px les colonnes ne tiennent plus : l'en-tête se retire et les
     lignes redeviennent lisibles en pile plutôt que d'être rognées. */
  @media (max-width: 720px){
    .thead{display:none}
    .trow{grid-template-columns:minmax(0,1fr) auto}
    .trow .td:not(.act):not(.titre){display:none}
  }
</style>
