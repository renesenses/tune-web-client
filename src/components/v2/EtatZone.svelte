<script lang="ts">
  /**
   * L'état de lecture d'une zone, en pastille — la FORME d'abord.
   *
   * Voir `lib/vueZones` (`etatLectureDeZone`) pour la raison : sur un thème où
   * l'accent est vert, une pastille verte de plus ne dit plus rien. Ici, trois
   * dessins distincts — barres animées, glyphe pause, tiret — doublés d'un
   * libellé traduit. La couleur ne fait que confirmer, et elle vient des
   * jetons SÉMANTIQUES, ceux que `tune-v2.css` refuse délibérément de repeindre
   * aux couleurs du thème.
   *
   * Les barres s'animent, sauf si le visiteur a demandé moins de mouvement.
   */
  import { t } from '../../lib/i18n';
  import { cleEtatLecture, type EtatLecture } from '../../lib/vueZones';

  interface Props {
    etat: EtatLecture;
    /** Pastille seule, sans libellé — pour une ligne déjà dense. */
    compact?: boolean;
  }
  let { etat, compact = false }: Props = $props();
</script>

<span class="ez {etat}" class:compact title={$t(cleEtatLecture(etat) as any)}>
  {#if etat === 'playing'}
    <span class="barres" aria-hidden="true"><i></i><i></i><i></i></span>
  {:else if etat === 'paused'}
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>
  {:else}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 8h10"/></svg>
  {/if}
  {#if !compact}<span class="lbl">{$t(cleEtatLecture(etat) as any)}</span>{/if}
</span>

<style>
  .ez{display:inline-flex; align-items:center; gap:6px; font:600 10.5px var(--v2-sans);
    letter-spacing:.03em; color:var(--v2-txt3); flex:0 0 auto}
  .ez svg{width:10px; height:10px; flex:0 0 auto}
  .ez .lbl{white-space:nowrap}
  .ez.compact{gap:0}

  /* La couleur vient des jetons SÉMANTIQUES, pas de l'accent du thème. */
  .ez.playing{color:var(--tune-success)}
  .ez.paused{color:var(--tune-warning)}

  .barres{display:inline-flex; align-items:flex-end; gap:2px; height:10px}
  .barres i{width:2px; border-radius:1px; background:currentColor; transform-origin:bottom;
    animation:ez-barres .9s ease-in-out infinite}
  .barres i:nth-child(1){height:6px; animation-delay:-.2s}
  .barres i:nth-child(2){height:10px; animation-delay:-.55s}
  .barres i:nth-child(3){height:8px}
  @keyframes ez-barres{0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)}}

  /* Moins de mouvement : les barres se figent à des hauteurs DIFFÉRENTES, donc
     la forme dit encore « ça joue » sans bouger. */
  @media (prefers-reduced-motion: reduce){
    .barres i{animation:none}
  }
</style>
