<script lang="ts">
  /**
   * Le menu « … » d'une ligne de piste, côté client ACTUEL.
   *
   * 🔴 `renesenses/tune-server-rust#1848` — 07/09/2026. Ce composant portait sa
   * liste EN DUR : sept entrées, dans son propre ordre, avec ses propres
   * tracés. Le nouveau client en porte une autre depuis le 07/09 (#765), et
   * elles avaient déjà divergé — « Lire ensuite » et « Étiquettes » n'existaient
   * que dans le nouveau. C'est mot pour mot ce que Dominique Comet signale :
   * deux chemins d'accès à la même chose n'offrent pas les mêmes gestes.
   *
   * Le CONTENU est désormais décidé par `lib/menuPiste`, le même module que
   * `PisteActions`. Ce fichier ne décide plus que de l'apparence.
   *
   * ## Les props ne changent pas de forme
   *
   * Chaque geste reste un `on…` facultatif, et une entrée n'apparaît que si son
   * geste est fourni : l'onglet « Titres » n'a pas la ligne dépliante des
   * autres versions, il ne passe donc pas `onOtherVersions` et l'entrée
   * disparaît — au lieu d'ouvrir sur rien (garde #2574).
   *
   * ## `capacites` : ce que la PISTE permet
   *
   * Par défaut, toutes les capacités tiennent et c'est la présence du geste qui
   * décide — c'est le contrat qu'avaient déjà les appelants de la Bibliothèque,
   * où toute piste porte un identifiant. Une surface qui montre des pistes de
   * SERVICE passe ses vraies capacités (`MenuPisteV1`), et les entrées qui
   * prennent un `i64` côté serveur s'effacent d'elles-mêmes.
   */
  import { t as tr } from '../lib/i18n';
  import { entreesMenuPiste, type CapacitesPiste } from '../lib/menuPiste';
  import { portail } from '../lib/portail';
  import { styleMenuAncre, type AncreMenu } from '../lib/ancrageMenu';
  interface Props {
    /**
     * Boîte ÉCRAN du bouton qui a ouvert le menu — `getBoundingClientRect()`.
     *
     * Obligatoire : porté à la racine du document, le panneau n'a plus aucun
     * moyen de retrouver son bouton. Un appelant qui l'oublie doit être ROUGE
     * à la compilation, pas silencieusement mal placé.
     */
    ancre: AncreMenu;
    /** Dismiss the menu (also invoked before every action). */
    onClose: () => void;
    onPlay: () => void;
    onAddToQueue: () => void;
    /**
     * Omit to hide "play next" — insère au rang SUIVANT celui qui joue.
     *
     * Ajouté par #1848 : le nouveau client le porte depuis le 05/09, celui-ci
     * ne l'avait que sous forme de bouton d'icône, et seulement sur certains
     * écrans.
     */
    onPlayNext?: () => void;
    /** Omit to hide the "more like this" (acoustic radio) item. */
    onPlaySimilar?: () => void;
    /**
     * Omit to hide the "other versions" item (#2372).
     *
     * Le rapprochement existait deja cote serveur, mais la seule porte etait
     * la section d'accueil, bornee aux dernieres ecoutes. C'est l'entree qui
     * manquait : « Il serait interessant de consulter les versions d'un titre
     * comme une nouvelle option » (FabienM, fil 1538, 24/08).
     */
    onOtherVersions?: () => void;
    /** Omit to hide the "add to playlist" item. */
    onAddToPlaylist?: () => void;
    /** Omit to hide the "go to artist" item. Caller resolves the artist. */
    onGoToArtist?: () => void;
    /** Omit to hide the "go to album" item. */
    onGoToAlbum?: () => void;
    /** Omit to hide the "tags" item — les étiquettes de l'utilisateur. */
    onTag?: () => void;
    /** Ce que la PISTE permet. Par défaut : tout, le geste seul décide. */
    capacites?: CapacitesPiste;
  }
  let {
    ancre,
    onClose,
    onPlay,
    onAddToQueue,
    onPlayNext,
    onPlaySimilar,
    onOtherVersions,
    onAddToPlaylist,
    onGoToArtist,
    onGoToAlbum,
    onTag,
    capacites = { jouable: true, idBibliotheque: 1, artistId: 1, albumId: 1 },
  }: Props = $props();
  const entrees = $derived(
    entreesMenuPiste(capacites, {
      lire: onPlay,
      ensuite: onPlayNext,
      aLaFile: onAddToQueue,
      plusCommeCa: onPlaySimilar,
      autresVersions: onOtherVersions,
      ajouterAPlaylist: onAddToPlaylist,
      allerArtiste: onGoToArtist,
      allerAlbum: onGoToAlbum,
      etiqueter: onTag,
    }),
  );
  /**
   * Le panneau est en `position: fixed` aux coordonnées du bouton : il se
   * referme donc dès que la page bouge sous lui, sinon il resterait figé loin
   * de sa ligne. Même règle que `MenuPisteV2`.
   */
  const style = $derived(styleMenuAncre(ancre, entrees.length, window));
  // Every item stops propagation, closes the menu, then runs its action.
  function run(fn: () => void, e: MouseEvent) {
    e.stopPropagation();
    onClose();
    fn();
  }
  // Le fond est rendu dans la ligne de piste, dont le clic lance la lecture.
  // Fermer le menu doit donc consommer l'événement exactement comme ses items.
  function dismiss(e: MouseEvent) {
    e.stopPropagation();
    onClose();
  }
</script>
<svelte:window onresize={onClose} />
<!-- Le fond ET le panneau sont portés à la racine : un ancêtre qui contient sa
     peinture rognerait aussi bien l'un que l'autre (#872). -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="track-menu-backdrop" onclick={dismiss} onwheel={dismiss} use:portail>
  <div class="track-menu" role="menu" style={style}>
    {#each entrees as entree (entree.cle)}
      <button class="track-menu-item" role="menuitem" onclick={(e) => run(entree.faire, e)}>
        <svg viewBox="0 0 24 24" width="14" height="14"
          fill={entree.plein ? 'currentColor' : 'none'}
          stroke={entree.plein ? 'none' : 'currentColor'}
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={entree.icone}/></svg>
        {$tr(entree.cle as any)}
      </button>
    {/each}
  </div>
</div>
<style>
  .track-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }
  .track-menu {
    /* #872 — `fixed`, et non `absolute` : porté à la racine du document, le
       panneau n'a plus d'ancêtre positionné à qui se référer. Ses coordonnées
       viennent de `styleMenuAncre`, en ligne. */
    position: fixed;
    width: 208px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    z-index: 100;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.4));
    white-space: nowrap;
  }
  .track-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 7px 12px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    text-align: left;
    width: 100%;
  }
  .track-menu-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }
</style>
