<script lang="ts">
  /**
   * LA CARTE JOUR × HEURE, et son CRÉNEAU cliquable.
   *
   * Sept lignes de vingt-quatre cases, même principe que l'histogramme
   * horaire : une seule teinte, l'opacité porte la valeur. Rendu repris de
   * l'ancien Tableau de bord (`.wh-wrap` / `.wh-cell`).
   *
   * 🔴 LE « CRÉNEAU » N'EST PAS UNE SECTION À PART — rectificatif au brief.
   *
   * La carte du chantier le comptait comme une quatorzième section. Ce n'en
   * est pas une : dans `DashboardView`, `slot` n'a aucun balisage propre, c'est
   * le calque qu'OUVRE un clic sur une case de cette grille-ci (`openSlot`,
   * appelée depuis `.wh-cell` et de nulle part ailleurs). Un « bloc créneau »
   * autonome n'aurait rien eu à afficher. Il vit donc ici, avec la grille qui
   * le déclenche, exactement comme avant.
   */
  import * as api from '../../../lib/api';
  import type { DashboardPeriod, SlotTrack } from '../../../lib/api';
  import { t } from '../../../lib/i18n';
  import { currentZone } from '../../../lib/stores/zones';

  export interface MatiereSemaineHeures {
    /** Sept lignes (lundi=0 … dimanche=6) de vingt-quatre valeurs. */
    grille: number[][];
    /** La période interrogée — le calque du créneau la rejoue telle quelle. */
    periode: DashboardPeriod;
  }

  let { donnees }: { donnees: MatiereSemaineHeures | null } = $props();

  const grille = $derived(donnees?.grille ?? []);
  const max = $derived(grille.length ? Math.max(0, ...grille.flat()) : 0);

  const JOURS = $derived([
    $t('alarms.dayMon'), $t('alarms.dayTue'), $t('alarms.dayWed'),
    $t('alarms.dayThu'), $t('alarms.dayFri'), $t('alarms.daySat'), $t('alarms.daySun'),
  ]);

  let calque = $state(false);
  let enCours = $state(false);
  let ligne = $state(0);
  let heure = $state(0);
  let pistes = $state<SlotTrack[]>([]);

  async function ouvrirCreneau(l: number, h: number) {
    ligne = l; heure = h; calque = true; enCours = true; pistes = [];
    try {
      // `l + 1` : le serveur compte les jours en ISO, lundi = 1.
      const r = await api.getHistoryAtSlot(donnees?.periode ?? '7d', l + 1, h, 100);
      pistes = r.tracks ?? [];
    } catch {
      // Le calque reste ouvert et DIT qu'il n'a rien : une fermeture muette se
      // lirait comme un clic sans effet.
      pistes = [];
    }
    enCours = false;
  }

  /**
   * Jouer une piste du créneau — repris de `playTopTrack` de l'ancien écran.
   * Un identifiant local d'abord, sinon la paire service + identifiant.
   */
  async function jouer(tk: SlotTrack) {
    const zone = $currentZone?.id;
    if (!zone) return;
    try {
      if (tk.track_id) await api.play(zone, { track_id: tk.track_id });
      else if (tk.source && tk.source !== 'local' && tk.source_id)
        await api.play(zone, { source: tk.source as any, source_id: tk.source_id });
    } catch {
      // Silencieux ici : le calque du créneau n'est pas un lecteur, et
      // `PageWidgets` tient déjà le signalement d'échec des vignettes.
    }
  }
</script>

{#if !grille.length || max === 0}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="carte">
    <div class="entete">
      <div class="jour"></div>
      {#each Array(24) as _, h (h)}
        <div class="lh">{h % 3 === 0 ? h : ''}</div>
      {/each}
    </div>
    {#each JOURS as nom, l (nom)}
      <div class="ligne">
        <div class="jour">{nom}</div>
        {#each grille[l] ?? [] as plays, h (h)}
          <button
            type="button"
            class="case"
            class:vide={plays === 0}
            disabled={plays === 0}
            style:opacity={plays === 0 ? 0.06 : 0.18 + (plays / max) * 0.82}
            title={$t('dashboard.slot.tip' as any).replace('{day}', nom).replace('{hour}', String(h)).replace('{plays}', String(plays))}
            aria-label={$t('dashboard.slot.tip' as any).replace('{day}', nom).replace('{hour}', String(h)).replace('{plays}', String(plays))}
            onclick={() => ouvrirCreneau(l, h)}
          ></button>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<svelte:window onkeydown={(e) => { if (calque && e.key === 'Escape') calque = false; }} />

{#if calque}
  <!-- Le voile ferme au clic — mais SEULEMENT quand le clic l'atteint
       lui-même (`target === currentTarget`). Un `stopPropagation` posé sur la
       modale aurait fait la même chose au prix d'un gestionnaire de clic sur
       un élément non interactif, que l'analyse d'accessibilité refuse à juste
       titre. Échap ferme aussi, ce que l'ancien calque ne faisait pas. -->
  <div class="voile" role="presentation"
       onclick={(e) => { if (e.target === e.currentTarget) calque = false; }}>
    <div class="modale" role="dialog" aria-modal="true" tabindex="-1">
      <div class="mtete">
        <h3>{JOURS[ligne]} · {heure}h–{heure + 1}h</h3>
        <button class="fermer" onclick={() => (calque = false)} aria-label={$t('common.close' as any)}>×</button>
      </div>
      {#if enCours}
        <p class="mvide">{$t('common.loading' as any)}</p>
      {:else if !pistes.length}
        <p class="mvide">{$t('dashboard.slot.empty' as any)}</p>
      {:else}
        <div class="mliste">
          {#each pistes as tk, i (`${i}-${tk.track_id ?? tk.source_id ?? ''}`)}
            <button type="button" class="mpiste" onclick={() => jouer(tk)} title={$t('dashboard.slot.play' as any)}>
              <span class="mt">{tk.title ?? '—'}</span>
              <span class="ms">{tk.artist_name ?? ''}{tk.album_title ? ` · ${tk.album_title}` : ''}</span>
              {#if tk.plays > 1}<span class="mn">×{tk.plays}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .carte { display: flex; flex-direction: column; gap: 3px; padding: 0 30px; }
  /* 30 px pour l'étiquette du jour, puis vingt-quatre colonnes ÉGALES. La
     grille se comprime, elle ne déborde jamais. */
  .entete, .ligne { display: grid; grid-template-columns: 34px repeat(24, 1fr); gap: 3px; align-items: center; }
  .jour { font: 500 11px var(--v2-sans); color: var(--v2-txt3); text-align: right; padding-right: 5px; }
  .lh { font: 400 9px var(--v2-sans); color: var(--v2-txt3); text-align: center; }
  .case {
    aspect-ratio: 1; border: 0; padding: 0; border-radius: 3px;
    background: var(--v2-acc1); cursor: pointer; transition: transform 0.1s;
  }
  .case.vide { background: var(--v2-line); cursor: default; }
  .case:not(.vide):hover { transform: scale(1.45); }
  .case:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 2px; }

  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 200; padding: 16px; }
  .modale {
    width: 100%; max-width: 460px; max-height: 70vh; display: flex; flex-direction: column;
    overflow: hidden; border-radius: 14px; background: var(--v2-surface);
    border: 1px solid var(--v2-line2); box-shadow: 0 14px 44px rgba(0, 0, 0, 0.42);
  }
  .mtete { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 13px 17px; border-bottom: 1px solid var(--v2-line); }
  .mtete h3 { margin: 0; font: 600 15px var(--v2-sans); color: var(--v2-txt); }
  .fermer { border: 0; background: none; color: var(--v2-txt2); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .mvide { margin: 0; padding: 26px; text-align: center; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }
  .mliste { overflow-y: auto; padding: 6px; }
  .mpiste {
    position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    width: 100%; text-align: left; border: 0; background: none; color: inherit;
    padding: 8px 12px; border-radius: 9px; cursor: pointer;
  }
  .mpiste:hover { background: var(--v2-hover); }
  .mt { font: 600 14px var(--v2-sans); color: var(--v2-txt); }
  .ms { font: 400 12px var(--v2-sans); color: var(--v2-txt2); }
  .mn { position: absolute; right: 12px; top: 10px; font: 400 12px var(--v2-sans); color: var(--v2-txt3); }

  @media (max-width: 1024px) { .carte { padding-left: 22px; padding-right: 22px; } }
  @media (max-width: 640px) {
    .carte { padding-left: 16px; padding-right: 16px; gap: 2px; }
    .entete, .ligne { grid-template-columns: 26px repeat(24, 1fr); gap: 2px; }
    .jour { font-size: 9px; padding-right: 3px; }
    /* Une graduation sur trois reste lisible ; sur téléphone elle ne l'est
       plus, et une rangée de chiffres écrasés vaut moins que rien. */
    .lh { display: none; }
  }
</style>
