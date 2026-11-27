<script lang="ts">
  /**
   * Le filtre par genre, en BOUTONS, sur « Mes radios » comme sur « Annuaire »
   * (rapport de Rémi, RC7, #2397 : « boutons partout »).
   *
   * Harmonisation de l'interface (rc14, maquette `radios.html`) : les genres
   * tiennent sur UNE ligne qui défile de côté. Un fondu et une flèche « › » à
   * droite disent qu'il y en a d'autres ; la flèche fait défiler d'une
   * largeur, et disparaît au bout de la ligne. Le compte de « Tous les
   * genres » s'écrit comme celui des autres puces (chiffre à part).
   */
  import { t } from '../../lib/i18n';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  interface Genre { cle: string; libelle: string; n: number }
  let { genres, choisi, total, onChoisir }: {
    genres: Genre[]; choisi: string | null; total: number | null; onChoisir: (cle: string | null) => void;
  } = $props();

  let rangee = $state<HTMLDivElement | undefined>(undefined);
  let suite = $state(false);
  function mesurer() {
    const r = rangee;
    suite = !!r && r.scrollLeft + r.clientWidth < r.scrollWidth - 1;
  }
  $effect(() => {
    void genres.length;
    const r = rangee;
    if (!r) return;
    mesurer();
    // ResizeObserver manque dans jsdom (bancs de test) : garde d'existence.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(r);
    return () => ro.disconnect();
  });
  function avancer() {
    rangee?.scrollBy({ left: Math.max(120, (rangee.clientWidth ?? 0) * 0.8), behavior: 'smooth' });
  }
</script>

<div class="genres-ligne" class:suite>
  <div class="chips" bind:this={rangee} onscroll={mesurer}>
    <button class="chip" class:active={!choisi} onclick={() => onChoisir(null)}>{$t('v2.radio.allGenres' as any)}{#if total != null} <span class="n">{total}</span>{/if}</button>
    {#each genres as g (g.cle)}
      <button class="chip" class:active={choisi === g.cle}
        onclick={() => onChoisir(choisi === g.cle ? null : g.cle)}>{g.libelle} <span class="n">{g.n}</span></button>
    {/each}
  </div>
  {#if suite}
    <button type="button" class="suivant" aria-label={$t('v2.radio.moreGenres' as any)} title={$t('v2.radio.moreGenres' as any)}
      data-testid="radio-genres-suite" onclick={avancer}><ChevronRight aria-hidden="true" /></button>
  {/if}
</div>

<style>
  .genres-ligne{position:relative; min-width:0}
  .chips{display:flex; gap:6px; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch}
  .chips::-webkit-scrollbar{display:none}
  /* Le fondu ne se pose que s'il reste des genres à droite. */
  .suite .chips{-webkit-mask-image:linear-gradient(90deg, var(--pal-noir) 88%, transparent); mask-image:linear-gradient(90deg, var(--pal-noir) 88%, transparent)}
  .chip{flex:none; display:inline-flex; align-items:center; height:32px; border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:var(--graisse-forte) var(--taille-4) var(--police-texte); padding:0 14px; border-radius:var(--rayon-plein); transition:.15s; white-space:nowrap}
  .chip .n{font-family:var(--police-chiffres); font-size:var(--taille-2); color:var(--v2-txt3); margin-left:6px}
  .chip:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .chip.active{color:var(--v2-acc1); border-color:var(--v2-acc1); background:var(--v2-active1)}
  .chip.active .n{color:var(--v2-acc1); opacity:.8}
  .suivant{position:absolute; right:0; top:50%; transform:translateY(-50%); z-index:1; width:36px; height:36px; border-radius:50%;
    display:grid; place-items:center; border:1px solid var(--v2-line2); background:var(--v2-surface); color:var(--v2-txt); cursor:pointer;
    box-shadow:var(--v2-sh-sm)}
  .suivant:hover{border-color:var(--v2-acc2)}
  .suivant:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .suivant :global(svg){width:16px; height:16px}
</style>
