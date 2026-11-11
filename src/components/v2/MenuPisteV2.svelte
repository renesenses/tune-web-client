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
  import { styleMenuAncre, LARGEUR_MENU } from '../../lib/ancrageMenu';
  import { t } from '../../lib/i18n';
  import type { EntreeMenu as Entree } from '../../lib/menuPiste';

  interface Props {
    /** Position ÉCRAN du bouton qui a ouvert le menu. */
    ancre: DOMRect;
    entrees: Entree[];
    onClose: () => void;
    /**
     * web#2221 — OPT-IN : le focus entre dans le menu à l'ouverture, et ↑ / ↓
     * passent d'une entrée à l'autre. Le menu est PORTÉ à la racine du
     * document : sans ce focus, un menu ouvert au clavier se trouverait au bout
     * de l'ordre de tabulation. L'en-tête d'un disque (`ListePistesV2`) le
     * demande ; absent, rien ne change pour les menus de piste.
     */
    focusInitial?: boolean;
    /**
     * web#2736 — le bouton qui a ouvert le menu : Échap, Tab, un clic à côté
     * ou une entrée choisie lui RENDENT le focus (motif « menu button » de
     * l'ARIA APG). Sans lui, le focus tomberait au bout du document, là où le
     * menu était porté.
     */
    retourFocus?: HTMLElement | null;
    /** Largeur du panneau ; les menus d'en-tête de fiche ont des libellés longs. */
    largeur?: number;
    /** Nom accessible du menu. */
    etiquette?: string;
  }
  let { ancre, entrees, onClose, focusInitial = false, retourFocus = null, largeur = LARGEUR_MENU, etiquette }: Props = $props();
  let menu = $state<HTMLElement | null>(null);
  const items = () => Array.from(menu?.querySelectorAll<HTMLElement>('.item') ?? []);
  $effect(() => { if (focusInitial && menu) items()[0]?.focus(); });
  function parcourir(e: KeyboardEvent) {
    if (!focusInitial) return;
    const l = items();
    if (!l.length) return;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      l[e.key === 'Home' ? 0 : l.length - 1]?.focus();
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); fermer(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = l.indexOf(document.activeElement as HTMLElement);
    const pas = e.key === 'ArrowDown' ? 1 : -1;
    l[(i + pas + l.length) % l.length]?.focus();
  }
  /** Referme ET rend le focus au bouton d'origine, s'il est connu. */
  function fermer() {
    retourFocus?.focus();
    onClose();
  }

  /**
   * Les entrées par GROUPE, dans leur ordre : un intertitre à chaque changement
   * de `groupe`. Un menu de piste n'en a aucun et reste une simple liste.
   */
  const groupes = $derived.by(() => {
    const g: { titre: string | null; entrees: Entree[] }[] = [];
    for (const e of entrees) {
      const titre = e.groupe ?? null;
      const dernier = g[g.length - 1];
      if (dernier && dernier.titre === titre) dernier.entrees.push(e);
      else g.push({ titre, entrees: [e] });
    }
    return g;
  });
  const intertitres = $derived(groupes.filter((x) => x.titre).length);

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
   *
   * Les intertitres comptent pour une ligne chacun (web#2736).
   */
  const style = $derived(styleMenuAncre(ancre, entrees.length + intertitres, window, largeur) + `;width:${largeur}px`);

  function lancer(e: MouseEvent, entree: Entree) {
    e.stopPropagation();
    e.preventDefault();
    if (entree.desactive) return;
    fermer();
    entree.faire();
  }
  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
  }
  const role = (entree: Entree) =>
    entree.coche !== undefined ? 'menuitemradio' : entree.active !== undefined ? 'menuitemcheckbox' : 'menuitem';
</script>

<svelte:window onkeydown={auClavier} onresize={onClose} />

<!-- Le fond ferme au clic ET consomme l'événement : la ligne qui l'entoure
     lance la lecture au clic, refermer le menu ne doit pas la déclencher. -->
<div class="fond tune-v2" role="presentation" use:portail
  onclick={(e) => { e.stopPropagation(); e.preventDefault(); fermer(); }}
  onwheel={onClose}>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="menu" role="menu" aria-label={etiquette} style={style} bind:this={menu} onkeydown={parcourir}>
    {#each groupes as groupe, gi (gi)}
      <div class="groupe" role={groupe.titre ? 'group' : 'none'} aria-label={groupe.titre ? $t(groupe.titre as any) : undefined}>
        {#if groupe.titre}<div class="intertitre" aria-hidden="true">{$t(groupe.titre as any)}</div>{/if}
        {#each groupe.entrees as entree, i (i)}
          <button class="item" class:danger={entree.danger} role={role(entree)}
            aria-checked={entree.coche ?? entree.active}
            aria-disabled={entree.desactive ? 'true' : undefined}
            title={entree.bulle ? $t(entree.bulle as any) : undefined}
            {...entree.attrs ?? {}}
            onclick={(e) => lancer(e, entree)}>
            {#if entree.icone}
              <svg viewBox="0 0 24 24" fill={entree.plein ? 'currentColor' : 'none'}
                stroke={entree.plein ? 'none' : 'currentColor'} stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"><path d={entree.icone}/></svg>
            {:else if entree.coche !== undefined}
              <span class="coche" aria-hidden="true">{entree.coche ? '✓' : ''}</span>
            {/if}
            {$t(entree.cle as any)}{#if entree.suffixe}<span class="suffixe">{entree.suffixe}</span>{/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900}
  .menu{position:fixed; width:208px; /* = LARGEUR_MENU de lib/ancrageMenu */ padding:4px; z-index:901;
    max-width:calc(100vw - 16px); overflow-y:auto; overscroll-behavior:contain;
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
  /* web#2736 — les groupes d'un menu d'en-tête de fiche. */
  .groupe{display:flex; flex-direction:column; gap:1px}
  .groupe + .groupe{margin-top:3px; padding-top:3px; border-top:1px solid var(--v2-line, rgba(255,255,255,.08))}
  .intertitre{padding:5px 10px 2px; font:600 10.5px var(--v2-sans, inherit); letter-spacing:.05em;
    text-transform:uppercase; color:var(--v2-txt3, var(--tune-text-muted, inherit))}
  .item.danger{color:var(--v2-danger, #ef4444)}
  .item[aria-disabled="true"]{opacity:.5; cursor:default}
  .coche{width:15px; flex:0 0 auto; text-align:center}
  .suffixe{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0}
  .suffixe::before{content:' — '}
</style>
