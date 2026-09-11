<script lang="ts">
  /**
   * Le menu « … » d'une ligne de piste.
   *
   * Bertrand, 07/09/2026, capture de la fiche album du client ACTUEL à l'appui :
   * « continue sur le bouton … je veux à minima le contenu de la v0 ».
   *
   * Le client actuel a ce menu depuis longtemps (`TrackContextMenu`) et il
   * porte SEPT gestes ; la barre du nouveau client en portait six, tous en
   * icônes, et trois de ces sept manquaient purement et simplement : « Plus
   * comme ça », « Autres versions » et « Aller à l'artiste ». Ils ne sont pas
   * décoratifs — ce sont les seules portes vers la similarité acoustique et
   * vers le rapprochement de versions.
   *
   * ## Le menu REDIT ce que les icônes font déjà
   *
   * Comme dans le client actuel, et ce n'est pas un doublon inutile : les
   * icônes sont muettes, le menu les NOMME. C'est la seule surface où l'on
   * apprend ce que fait le troisième bouton en partant de la gauche.
   *
   * ## Ancré, mais PORTÉ à la racine du document
   *
   * Un menu déroulant posé dans une ligne se fait rogner par le premier
   * ancêtre qui défile — et il y en a toujours un : la liste. Pire, un ancêtre
   * portant `transform` ou `contain` capture même le `position: fixed` (c'est
   * ce qui avait rogné le panneau d'étiquettes aux trois quarts, le
   * 02/09/2026). On porte donc le nœud à la racine et on le place aux
   * coordonnées ÉCRAN du bouton.
   *
   * Il se referme dès que la page bouge sous lui : un menu ancré à des
   * coordonnées figées suivrait sinon le bouton de très loin.
   */
  import { portail } from '../../lib/portail';
  import { styleMenuAncre } from '../../lib/ancrageMenu';
  import { t } from '../../lib/i18n';
  import type { EntreeMenuPiste as Entree } from '../../lib/menuPiste';

  interface Props {
    /** Position ÉCRAN du bouton qui a ouvert le menu. */
    ancre: DOMRect;
    entrees: Entree[];
    onClose: () => void;
  }
  let { ancre, entrees, onClose }: Props = $props();

  /**
   * Le menu s'ouvre sous le bouton, aligné à DROITE sur lui — et remonte
   * au-dessus quand le bas de la fenêtre est trop proche. Sans quoi, sur la
   * dernière ligne d'une liste, il naîtrait hors de l'écran.
   *
   * Ce calcul vivait ici, en dur. `renesenses/tune-web-client#872` en a eu
   * besoin mot pour mot pour le menu du client actuel : il est parti dans
   * `lib/ancrageMenu`, que les deux menus appellent. Recopier, c'était
   * accepter qu'ils dérivent — le reproche même de
   * `renesenses/tune-server-rust#1848` sur leur contenu.
   */
  const style = $derived(styleMenuAncre(ancre, entrees.length, window));

  function lancer(e: MouseEvent, entree: Entree) {
    e.stopPropagation();
    e.preventDefault();
    onClose();
    entree.faire();
  }
  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }
</script>

<svelte:window onkeydown={auClavier} onresize={onClose} />

<!-- Le fond ferme au clic ET consomme l'événement : la ligne qui l'entoure
     lance la lecture au clic, refermer le menu ne doit pas la déclencher. -->
<div class="fond tune-v2" role="presentation" use:portail
  onclick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
  onwheel={onClose}>
  <div class="menu" role="menu" style={style}>
    {#each entrees as entree (entree.cle)}
      <button class="item" role="menuitem" onclick={(e) => lancer(e, entree)}>
        <svg viewBox="0 0 24 24" fill={entree.plein ? 'currentColor' : 'none'}
          stroke={entree.plein ? 'none' : 'currentColor'} stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"><path d={entree.icone}/></svg>
        {$t(entree.cle as any)}
      </button>
    {/each}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900}
  .menu{position:fixed; width:208px; /* = LARGEUR_MENU de lib/ancrageMenu */ padding:4px; z-index:901;
    background:var(--v2-surface, var(--tune-surface, #1b1b1f));
    border:1px solid var(--v2-line2, var(--tune-border, #333));
    border-radius:var(--v2-r-card, 10px);
    box-shadow:var(--v2-sh-pop, 0 8px 24px rgba(0,0,0,.4));
    display:flex; flex-direction:column; gap:1px}
  .item{display:flex; align-items:center; gap:9px; width:100%; text-align:left;
    padding:7px 10px; border:0; border-radius:6px; background:transparent; cursor:pointer;
    font:13px var(--v2-sans, inherit); color:var(--v2-txt2, var(--tune-text-secondary, inherit))}
  .item:hover{background:var(--v2-hover, var(--tune-surface-hover, rgba(255,255,255,.06)));
    color:var(--v2-txt, var(--tune-text, inherit))}
  .item:focus-visible{outline:2px solid var(--v2-acc1, var(--tune-accent, currentColor)); outline-offset:-2px}
  .item svg{width:15px; height:15px; flex:0 0 auto}
</style>
