<script lang="ts">
  /**
   * Réglages › Interface — l'ordre de la barre latérale — web#1827.
   *
   * Bertrand, 30/09/2026 : glisser-déposer, monter / descendre au CLAVIER
   * (les deux boutons fléchés sont de vrais boutons, atteignables à la
   * tabulation, et annoncent la nouvelle place), une case pour masquer une
   * entrée, « Rétablir l'ordre par défaut ». Accueil ne se masque pas ;
   * Réglages est la roue de l'en-tête de la barre, hors de ces listes.
   *
   * UNE SEULE LISTE, libre (arbitrage de Bertrand du 30/09/2026) : toute
   * entrée va n'importe où. Une entrée Avancée ou Expert le reste — sa
   * pastille le dit — et n'apparaît dans la barre qu'à ce niveau, à la place
   * choisie (voir `lib/ordreBarreLaterale`). Les sous-entrées (services de Streaming, rayons de Collections) suivent
   * leur parent dans la barre : elles ne figurent pas ici.
   */
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import {
    ordonnerEntrees, estMasquee, deplacer, avecOrdre, avecVisibilite,
    ENTREES_TOUJOURS_VISIBLES,
  } from '../../lib/ordreBarreLaterale';
  import { TOUTES_ENTREES, NIVEAU_ENTREE, type Item } from './Sidebar.svelte';

  /** La pastille de niveau d'une entrée qui n'est pas visible dès l'Essentiel. */
  const PASTILLE_NIVEAU = { intermediate: 'settings.levelAdvanced', expert: 'settings.levelExpert' } as const;

  const choix = $derived($preferences.barreLaterale);
  const parDefaut = $derived(choix === null || choix === undefined);

  const liste = $derived(ordonnerEntrees(TOUTES_ENTREES, choix?.ordre));

  /** Annonce lue par les lecteurs d'écran après un déplacement. */
  let annonce = $state('');

  const libelle = (it: Item) => $t(it.labelKey as any);
  const avec = (cle: string, it: Item) => $t(cle as any).replace('{x}', libelle(it));

  function deplacerA(de: number, vers: number, focaliser = false) {
    if (vers < 0 || vers >= liste.length || de === vers) return;
    // 🔴 Lu AVANT l'enregistrement : `liste` est dérivée des préférences, et
    // se relit déjà dans le nouvel ordre juste après.
    const it = liste[de];
    const total = String(liste.length);
    const nouvel = deplacer(liste, de, vers);
    preferences.update((p) => ({ ...p, barreLaterale: avecOrdre(p.barreLaterale, nouvel.map((x) => x.view)) }));
    const place = String(vers + 1);
    annonce = avec('settings.sidebarMoved', it).replace('{p}', place).replace('{n}', total);
    if (focaliser) {
      // Le bouton pressé suit l'entrée : on peut presser plusieurs fois de suite.
      const sens = vers < de ? 'haut' : 'bas';
      // Après le rendu : la ligne a changé de place dans le DOM.
      void tick().then(() => {
        const b = document.querySelector<HTMLButtonElement>(
          `[data-ordre-barre] [data-vue="${it.view}"] [data-sens="${sens}"]`,
        );
        (b && !b.disabled ? b : document.querySelector<HTMLButtonElement>(
          `[data-ordre-barre] [data-vue="${it.view}"] [data-sens="${sens === 'haut' ? 'bas' : 'haut'}"]`,
        ))?.focus();
      });
    }
  }

  function basculer(vue: string, visible: boolean) {
    preferences.update((p) => ({ ...p, barreLaterale: avecVisibilite(p.barreLaterale, vue, visible) }));
  }

  function retablir() {
    preferences.update((p) => ({ ...p, barreLaterale: null }));
    annonce = $t('settings.sidebarResetDone' as any);
  }

  // --- Glisser-déposer (souris) — le clavier passe par les flèches. -------
  let glisse = $state<number | null>(null);
  let survol = $state<number | null>(null);

  function debutGlisse(e: DragEvent, index: number, vue: string) {
    glisse = index;
    try {
      e.dataTransfer?.setData('text/plain', vue);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    } catch { /* jsdom, vieux navigateurs */ }
  }
  function surSurvol(e: DragEvent, index: number) {
    if (glisse === null) return;
    e.preventDefault();
    survol = index;
  }
  function surDepot(e: DragEvent, index: number) {
    if (glisse === null) return;
    e.preventDefault();
    const de = glisse;
    glisse = null; survol = null;
    deplacerA(de, index);
  }
  function finGlisse() { glisse = null; survol = null; }
</script>

<div class="ordre-barre" data-reglage="ordre-barre">
  <div class="tete">
    <div class="lbl">
      <span>{$t('settings.sidebarOrder' as any)}</span>
      <span class="hint">{$t('settings.sidebarOrderHint' as any)}</span>
    </div>
    <button class="retablir" data-action="retablir-ordre-barre" disabled={parDefaut} onclick={retablir}>
      {$t('settings.sidebarReset' as any)}
    </button>
  </div>

  <ol data-ordre-barre aria-label={$t('settings.sidebarOrder' as any)}>
    {#each liste as it, i (it.view)}
      {@const fixe = ENTREES_TOUJOURS_VISIBLES.includes(it.view)}
      {@const masquee = estMasquee(it.view, choix)}
      {@const niveau = NIVEAU_ENTREE[it.view]}
      <li data-vue={it.view} class:masquee class:survol={survol === i} class:glisse={glisse === i}
        draggable="true"
        ondragstart={(e) => debutGlisse(e, i, it.view)}
        ondragover={(e) => surSurvol(e, i)}
        ondrop={(e) => surDepot(e, i)}
        ondragend={finGlisse}>
        <span class="poignee" aria-hidden="true" title={avec('settings.sidebarDrag', it)}>⋮⋮</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={it.icon} /></svg>
        <span class="nom">{libelle(it)}</span>
        {#if niveau}<span class="niveau" data-niveau={niveau}>{$t(PASTILLE_NIVEAU[niveau] as any)}</span>{/if}
        <button class="fl" data-sens="haut" disabled={i === 0}
          aria-label={avec('settings.sidebarMoveUp', it)} title={avec('settings.sidebarMoveUp', it)}
          onclick={() => deplacerA(i, i - 1, true)}>↑</button>
        <button class="fl" data-sens="bas" disabled={i === liste.length - 1}
          aria-label={avec('settings.sidebarMoveDown', it)} title={avec('settings.sidebarMoveDown', it)}
          onclick={() => deplacerA(i, i + 1, true)}>↓</button>
        <label class="sw" title={fixe ? $t('settings.sidebarAlwaysVisible' as any) : avec('settings.sidebarShow', it)}>
          <input type="checkbox" data-visible={it.view} checked={fixe || !masquee} disabled={fixe}
            aria-label={fixe ? `${libelle(it)} — ${$t('settings.sidebarAlwaysVisible' as any)}` : avec('settings.sidebarShow', it)}
            onchange={(e) => basculer(it.view, (e.currentTarget as HTMLInputElement).checked)} />
          <span class="slider"></span>
        </label>
      </li>
    {/each}
  </ol>
  <div class="annonce" role="status" aria-live="polite">{annonce}</div>
</div>

<style>
  .ordre-barre{margin-top:12px}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:20px}
  .lbl{display:flex; flex-direction:column; gap:3px; min-width:0}
  .lbl > span:first-child{font-size:13.5px; font-weight:500}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3)}
  .retablir{flex:0 0 auto; height:32px; padding:0 12px; border-radius:9px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:inherit; font-size:12.5px; cursor:pointer}
  .retablir:disabled{opacity:.45; cursor:default}
  ol{list-style:none; margin:12px 0 0; padding:0; display:flex; flex-direction:column; gap:2px}
  li{display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:8px;
    border:1px solid transparent; background:var(--v2-surface2)}
  li.masquee .nom, li.masquee svg{opacity:.45}
  li.survol{border-color:var(--v2-acc1)}
  li.glisse{opacity:.5}
  .poignee{cursor:grab; color:var(--v2-txt3); font-size:12px; letter-spacing:-2px; user-select:none}
  li svg{width:16px; height:16px; flex:0 0 auto}
  .nom{flex:1; min-width:0; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .niveau{flex:0 0 auto; font-size:10.5px; padding:1px 7px; border-radius:999px;
    border:1px solid var(--v2-line2); color:var(--v2-txt3)}
  .fl{width:28px; height:28px; border-radius:7px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt); cursor:pointer; font-size:13px; line-height:1}
  .fl:disabled{opacity:.3; cursor:default}
  .fl:focus-visible, .retablir:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:1px}
  .annonce{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  /* L'interrupteur reprend celui des Réglages (`.sw`, scopé là-bas), en 36 px. */
  .sw{position:relative; flex:0 0 auto; width:36px; height:21px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:15px; height:15px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(15px)}
  .sw input:disabled + .slider{opacity:.5; cursor:default}
  .sw input:focus-visible + .slider{box-shadow:0 0 0 3px var(--v2-focus)}
</style>
