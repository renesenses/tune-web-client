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
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
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
    onOuvrirAlbum?: ((piste: Track, index: number) => void) | null;
  }
  let {
    pistes, onLire, numerotation = 'rang',
    avecAlbum = true, pochette = true, onOuvrirAlbum = null,
  }: Props = $props();

  const mode = $derived($preferences.settingsLevel);
  const enTableau = $derived(mode === 'beginner');

  // Le MODE est passé : une colonne réservée à Expert ne doit pas apparaître
  // si un réglage plus ancien la coche pour un mode inférieur.
  const colonnes = $derived(colonnesRetenues($preferences.v2Colonnes?.[mode] ?? [], mode));
  const gabarit = $derived(`${gabaritGrille(colonnes)} auto`); // + la colonne d'actions

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
  <!-- Modes Avancé et Expert : inchangés, à la virgule près. -->
  {#each pistes as p, i (p.id ?? i)}
    <LignePisteV2
      piste={p}
      numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
      onLire={() => onLire(p, i)}
      {avecAlbum}
      {pochette}
      onOuvrirAlbum={onOuvrirAlbum ? () => onOuvrirAlbum(p, i) : null}
    />
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
    </div>

    {#each pistes as p, i (p.id ?? i)}
      <div class="trow" class:np={p.id != null && p.id === $currentTrackId} role="row">
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
              {cellule(p, i, c.cle) ?? ''}
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

  .titre{padding:0; border:0; background:transparent; cursor:pointer; text-align:left;
    font:600 13.5px var(--v2-sans); color:var(--v2-txt); min-width:0;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .trow.np .titre{color:var(--v2-acc1)}
  .titre:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px; border-radius:4px}

  .act{overflow:visible}

  /* Sous 720 px les colonnes ne tiennent plus : l'en-tête se retire et les
     lignes redeviennent lisibles en pile plutôt que d'être rognées. */
  @media (max-width: 720px){
    .thead{display:none}
    .trow{grid-template-columns:minmax(0,1fr) auto}
    .trow .td:not(.act):not(.titre){display:none}
  }
</style>
