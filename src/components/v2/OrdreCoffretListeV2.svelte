<script lang="ts">
  /**
   * L'ordre des albums d'un coffret — tune-server-rust#8571 (fil 2763, go
   * de Bertrand du 12/11/2026).
   *
   * Une liste ORDONNÉE : sa place est l'ordre des disques. Glisser-déposer à
   * la souris par la poignée ; au CLAVIER, deux vrais boutons Monter /
   * Descendre, atteignables à la tabulation, qui gardent le focus sur
   * l'album déplacé et annoncent sa nouvelle place (région `aria-live`).
   * Même geste que l'ordre de la barre latérale (`OrdreBarreLateraleV2`).
   *
   * Chaque ligne montre les disques que l'album occupera : ses disques
   * restent dans leur ordre, le suivant prend la suite (#8463).
   *
   * Sert deux fois : à la composition (Métadonnées › Coffrets) et sur la
   * fiche d'un coffret déjà composé. Le parent tient la liste ; ce composant
   * ne fait que demander `ondeplacer(de, vers)`.
   */
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { plagesDeDisques } from '../../lib/ordreCoffret';

  interface Element {
    /** Identité stable de l'album dans la liste. */
    cle: number;
    titre: string;
    /** Ligne secondaire facultative (artiste, pistes). */
    detail?: string;
    /** Combien de disques l'album apporte (au moins 1). */
    disques: number;
  }

  let { elements, ondeplacer, etiquette, desactive = false }: {
    elements: Element[];
    ondeplacer: (de: number, vers: number) => void;
    etiquette: string;
    desactive?: boolean;
  } = $props();

  const plages = $derived(plagesDeDisques(elements.map((e) => e.disques)));

  /** Annonce lue par les lecteurs d'écran après un déplacement. */
  let annonce = $state('');
  let racine = $state<HTMLElement | null>(null);

  const avec = (cle: string, e: Element) => $t(cle as any).replace('{x}', e.titre || '—');

  function libelleDisques(i: number): string {
    const p = plages[i];
    if (!p) return '';
    return p.b > p.a
      ? $t('v2.meta.boxDiscRange' as any).replace('{a}', String(p.a)).replace('{b}', String(p.b))
      : $t('v2.meta.boxDisc' as any).replace('{n}', String(p.a));
  }

  function deplacerA(de: number, vers: number, focaliser = false) {
    if (desactive || vers < 0 || vers >= elements.length || de === vers) return;
    const e = elements[de];
    // Les disques que l'album occupera À SA NOUVELLE PLACE.
    const nb = elements.map((x) => x.disques);
    const [k] = nb.splice(de, 1);
    nb.splice(vers, 0, k);
    const p = plagesDeDisques(nb)[vers];
    const disques = p.b > p.a
      ? $t('v2.meta.boxDiscRange' as any).replace('{a}', String(p.a)).replace('{b}', String(p.b))
      : $t('v2.meta.boxDisc' as any).replace('{n}', String(p.a));
    ondeplacer(de, vers);
    annonce = avec('v2.box.moved', e)
      .replace('{p}', String(vers + 1))
      .replace('{n}', String(elements.length))
      .replace('{d}', disques);
    if (focaliser) {
      // Le bouton pressé suit l'album : on peut presser plusieurs fois.
      const sens = vers < de ? 'haut' : 'bas';
      void tick().then(() => {
        const ligne = racine?.querySelector(`[data-cle="${e.cle}"]`);
        const b = ligne?.querySelector<HTMLButtonElement>(`[data-sens="${sens}"]`);
        const autre = ligne?.querySelector<HTMLButtonElement>(`[data-sens="${sens === 'haut' ? 'bas' : 'haut'}"]`);
        (b && !b.disabled ? b : autre)?.focus();
      });
    }
  }

  // --- Glisser-déposer (souris) — le clavier passe par les flèches. -------
  let glisse = $state<number | null>(null);
  let survol = $state<number | null>(null);

  function debutGlisse(ev: DragEvent, index: number) {
    if (desactive) { ev.preventDefault(); return; }
    glisse = index;
    try {
      ev.dataTransfer?.setData('text/plain', String(elements[index]?.cle ?? ''));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    } catch { /* jsdom, vieux navigateurs */ }
  }
  function surSurvol(ev: DragEvent, index: number) {
    if (glisse === null) return;
    ev.preventDefault();
    survol = index;
  }
  function surDepot(ev: DragEvent, index: number) {
    if (glisse === null) return;
    ev.preventDefault();
    const de = glisse;
    glisse = null; survol = null;
    deplacerA(de, index);
  }
  function finGlisse() { glisse = null; survol = null; }
</script>

<div class="cfordre" bind:this={racine}>
  <p class="cfordre-aide">{$t('v2.box.orderHint' as any)}</p>
  <ol data-ordre-coffret aria-label={etiquette}>
    {#each elements as e, i (e.cle)}
      <li data-cle={e.cle} class:survol={survol === i} class:glisse={glisse === i}
        draggable={desactive ? 'false' : 'true'}
        ondragstart={(ev) => debutGlisse(ev, i)}
        ondragover={(ev) => surSurvol(ev, i)}
        ondrop={(ev) => surDepot(ev, i)}
        ondragend={finGlisse}>
        <span class="poignee" aria-hidden="true" title={avec('v2.box.drag', e)}>⋮⋮</span>
        <span class="cfordre-nom">
          <span class="cfordre-titre">{e.titre || '—'}</span>
          {#if e.detail}<span class="cfordre-detail">{e.detail}</span>{/if}
        </span>
        <span class="cfordre-disques">{libelleDisques(i)}</span>
        <button type="button" class="fl" data-sens="haut" disabled={desactive || i === 0}
          aria-label={avec('v2.box.moveUp', e)} title={avec('v2.box.moveUp', e)}
          onclick={() => deplacerA(i, i - 1, true)}>↑</button>
        <button type="button" class="fl" data-sens="bas" disabled={desactive || i === elements.length - 1}
          aria-label={avec('v2.box.moveDown', e)} title={avec('v2.box.moveDown', e)}
          onclick={() => deplacerA(i, i + 1, true)}>↓</button>
      </li>
    {/each}
  </ol>
  <div class="annonce" role="status" aria-live="polite">{annonce}</div>
</div>

<style>
  .cfordre{margin:8px 0 12px}
  .cfordre-aide{margin:0 0 6px; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  ol{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
  li{display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:8px;
    border:1px solid transparent; background:var(--v2-surface2)}
  li.survol{border-color:var(--v2-acc1)}
  li.glisse{opacity:.5}
  .poignee{cursor:grab; color:var(--v2-txt3); font-size:calc(12px * var(--v2-txt-echelle, 1)); letter-spacing:-2px; user-select:none}
  .cfordre-nom{flex:1; min-width:0; display:flex; flex-direction:column}
  .cfordre-titre{font-size:calc(13px * var(--v2-txt-echelle, 1)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .cfordre-detail{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .cfordre-disques{flex:0 0 auto; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .fl{width:28px; height:28px; border-radius:7px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt); cursor:pointer; font-size:calc(13px * var(--v2-txt-echelle, 1)); line-height:1}
  .fl:disabled{opacity:.3; cursor:default}
  .fl:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:1px}
  .annonce{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
</style>
