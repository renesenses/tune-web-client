<script lang="ts">
  /**
   * La roue crantée d'UNE zone : le bouton, et le panneau qu'il ouvre.
   *
   * Il ne DÉCIDE de rien — les entrées viennent de `lib/menuZone`, l'écran les
   * lui passe déjà liées à sa zone. Le composant ne sait que les dessiner, les
   * fermer au bon moment, et ne pas se faire couper.
   *
   * 🔴 LE PANNEAU EST `position:fixed`, et ce n'est pas un détail de style.
   * `.carte` porte `overflow:hidden` (ZonesV2) et `.scroll` un
   * `overflow-y:auto` : un panneau `absolute` y serait COUPÉ au bord de la
   * carte — le menu s'ouvrirait, et on n'en verrait que la première ligne.
   * La boîte du bouton est donc prise AU CLIC (`getBoundingClientRect`), comme
   * `MenuPisteV1` le fait pour la même raison.
   *
   * Corollaire : tout ce qui déplace le bouton sans le prévenir — défilement,
   * redimensionnement — FERME le menu, plutôt que de le laisser flotter à côté
   * de sa zone. Le défilement est écouté à la CAPTURE : il vient du `.scroll`
   * interne, il ne remonte pas jusqu'à la fenêtre.
   */
  import { t } from '../../lib/i18n';
  import type { EntreeMenuZone } from '../../lib/menuZone';

  interface Props {
    /** Les entrées, déjà liées à leur zone. */
    entrees: EntreeMenuZone[];
    /** Le nom de la zone — il entre dans l'étiquette du bouton. */
    nom: string;
    /** Une action de la zone est en cours : la roue attend son tour. */
    occupe?: boolean;
  }
  let { entrees, nom, occupe = false }: Props = $props();

  let ouvert = $state(false);
  let ancre = $state<{ x: number; y: number; versLeHaut: boolean } | null>(null);

  /** Hauteur estimée du panneau, pour décider s'il s'ouvre vers le haut. */
  function hauteurApprochee(): number {
    // 40 px par entrée, 9 px de filet, 12 px de cadre : large, et volontairement
    // approché — il ne s'agit que de choisir un côté.
    return entrees.length * 40 + 21;
  }

  function basculer(e: MouseEvent) {
    e.stopPropagation();
    if (ouvert) { ouvert = false; return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const place = window.innerHeight - r.bottom;
    ancre = { x: r.right, y: r.bottom, versLeHaut: place < hauteurApprochee() && r.top > place };
    ouvert = true;
  }

  function fermer() { ouvert = false; }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape' && ouvert) { ouvert = false; }
  }

  function lancer(e: MouseEvent, entree: EntreeMenuZone) {
    e.stopPropagation();
    ouvert = false;
    entree.faire();
  }

  /** Le libellé traduit, `{name}` substitué quand l'entrée en porte un. */
  function libelle(entree: EntreeMenuZone, texte: string): string {
    return entree.nom ? texte.replace('{name}', entree.nom) : texte;
  }
</script>

<svelte:window onclick={fermer} onkeydown={auClavier} onresize={fermer} onscrollcapture={fermer} />

<button
  class="mz-roue"
  class:on={ouvert}
  onclick={basculer}
  disabled={occupe}
  aria-haspopup="menu"
  aria-expanded={ouvert}
  aria-label={`${$t('v2.zone.actions' as any)} — ${nom}`}
  title={$t('v2.zone.actions' as any)}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
</button>

{#if ouvert && ancre}
  <div
    class="mz-panneau"
    class:haut={ancre.versLeHaut}
    role="menu"
    tabindex="-1"
    aria-label={`${$t('v2.zone.actions' as any)} — ${nom}`}
    style={ancre.versLeHaut
      ? `left:${ancre.x}px; bottom:${window.innerHeight - ancre.y + 30}px`
      : `left:${ancre.x}px; top:${ancre.y + 6}px`}>
    {#each entrees as entree, i (entree.cle)}
      {#if entree.danger && i > 0 && !entrees[i - 1].danger}
        <div class="mz-filet"></div>
      {/if}
      <button class="mz-item" class:danger={entree.danger} role="menuitem" onclick={(e) => lancer(e, entree)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d={entree.icone} /></svg>
        <span>{libelle(entree, $t(entree.cle as any))}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  /* La roue : même gabarit que `.creg`, qu'elle remplace sur la carte. */
  .mz-roue{flex:0 0 auto; width:32px; height:32px; display:grid; place-items:center; border-radius:8px;
    border:1px solid transparent; background:transparent; color:var(--v2-txt3); cursor:pointer; padding:0}
  .mz-roue svg{width:16px; height:16px; color:inherit}
  .mz-roue:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2); background:var(--v2-surface)}
  .mz-roue.on{color:var(--v2-txt); border-color:var(--v2-line2); background:var(--v2-surface)}
  .mz-roue:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}
  .mz-roue:disabled{opacity:.45; cursor:default}

  /* Le panneau. `fixed` : voir l'en-tête — `.carte` le couperait. */
  .mz-panneau{position:fixed; z-index:60; transform:translateX(-100%);
    min-width:232px; max-width:320px; padding:6px;
    border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    box-shadow:0 18px 40px rgba(0,0,0,.5); display:flex; flex-direction:column; gap:1px}

  .mz-item{display:flex; align-items:center; gap:11px; width:100%; min-height:40px; padding:9px 10px;
    border:0; border-radius:8px; background:transparent; color:var(--v2-txt);
    font:13px var(--v2-sans); text-align:left; cursor:pointer}
  .mz-item svg{width:16px; height:16px; flex:0 0 auto; color:var(--v2-txt3)}
  .mz-item span{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .mz-item:hover{background:var(--v2-surface2)}
  .mz-item:hover svg{color:var(--v2-txt2)}
  .mz-item:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:-2px}

  /* Le geste destructif : rouge, et SOUS un filet. Un cran de distance, pas
     un grisé — voir `lib/menuZone`. */
  .mz-item.danger{color:var(--v2-danger)}
  .mz-item.danger svg{color:var(--v2-danger)}
  .mz-item.danger:hover{background:var(--v2-danger-bd)}
  .mz-filet{height:1px; margin:5px 6px; background:var(--v2-line)}
</style>
