<script lang="ts">
  /**
   * Onglet « Manquants » de Métadonnées — voir `lib/manquantsMetadonnees`.
   * Trois compteurs (pochettes, genres, années, sur le total d'albums) et deux
   * traitements, suivis jusqu'à leur fin ; les compteurs sont relus ensuite.
   */
  import { onDestroy, onMount } from 'svelte';
  import * as api from '../../lib/api';
  import type { CompletenessStats } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { avancementMusicBrainz, avancementPochettes, type Avancement } from '../../lib/manquantsMetadonnees';

  let stats = $state<CompletenessStats | null>(null);
  let erreur = $state<string | null>(null);
  let pochettes = $state<Avancement | null>(null);
  let mb = $state<Avancement | null>(null);
  let lancement = $state<'pochettes' | 'mb' | null>(null);
  let minuterie: ReturnType<typeof setInterval> | null = null;

  async function relireStats() {
    try { stats = await api.getCompletenessStats(); } catch (e: any) { erreur = e?.message ?? String(e); }
  }

  async function relireAvancement() {
    const [p, m] = await Promise.allSettled([api.getAlbumArtworkEnrichStatus(), api.getBatchEnrichStatus()]);
    const avantEnCours = !!(pochettes?.enCours || mb?.enCours);
    if (p.status === 'fulfilled') pochettes = avancementPochettes(p.value);
    if (m.status === 'fulfilled') mb = avancementMusicBrainz(m.value);
    const enCours = !!(pochettes?.enCours || mb?.enCours);
    if (avantEnCours && !enCours) void relireStats();
    if (enCours && !minuterie) minuterie = setInterval(() => void relireAvancement(), 2000);
    if (!enCours && minuterie) { clearInterval(minuterie); minuterie = null; }
  }

  async function lancer(quoi: 'pochettes' | 'mb') {
    if (lancement) return;
    lancement = quoi;
    erreur = null;
    try {
      if (quoi === 'pochettes') await api.startAlbumArtworkEnrich();
      else await api.startBatchEnrich();
    } catch (e: any) {
      // Le serveur garde ces passes (quota de l'offre gratuite) : son motif est
      // rendu tel quel, il dit quoi faire.
      erreur = e?.message ?? String(e);
    }
    lancement = null;
    await relireAvancement();
  }

  const libelle = (cle: string, vars: Record<string, number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, $formatNombre(v)), $t(cle as any));

  onMount(() => { void relireStats(); void relireAvancement(); });
  onDestroy(() => { if (minuterie) clearInterval(minuterie); });
</script>

<div class="manquants">
  <p class="intro">{$t('v2.miss.intro' as any)}</p>
  {#if erreur}<div class="err">{erreur}</div>{/if}

  {#if stats}
    <div class="compteurs">
      {#each [['v2.miss.covers', stats.albums_without_cover], ['v2.miss.genres', stats.albums_without_genre], ['v2.miss.years', stats.albums_without_year]] as [cle, n] (cle)}
        <div class="compteur">
          <span class="nom">{$t(cle as any)}</span>
          <span class="n">{$formatNombre(Number(n))}</span>
          <span class="sur">{$t('v2.miss.missing' as any)} · {libelle('v2.miss.of', { total: stats.total_albums })}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="actions">
    <div class="action">
      <button class="v2-btn primaire" disabled={!!lancement || !!pochettes?.enCours || (stats != null && stats.albums_without_cover === 0)}
        onclick={() => lancer('pochettes')}>{$t('v2.miss.findCovers' as any)}</button>
      <p class="source">{$t('v2.miss.sourceCovers' as any)}</p>
      {#if stats && stats.albums_without_cover === 0}
        <p class="etat">{$t('v2.miss.nothing' as any)}</p>
      {:else if pochettes?.enCours}
        <p class="etat">{libelle('v2.miss.running', { done: pochettes.recherches ?? pochettes.trouves, total: pochettes.total })}</p>
      {:else if pochettes}
        <p class="etat">{libelle('v2.miss.doneCovers', { found: pochettes.trouves, total: pochettes.recherches ?? pochettes.total })}</p>
      {/if}
    </div>
    <div class="action">
      <button class="v2-btn primaire" disabled={!!lancement || !!mb?.enCours}
        onclick={() => lancer('mb')}>{$t('v2.miss.findGenresYears' as any)}</button>
      <p class="source">{$t('v2.miss.sourceMb' as any)}</p>
      {#if mb?.enCours}
        <p class="etat">{libelle('v2.miss.running', { done: mb.trouves, total: mb.total })}</p>
      {:else if mb}
        <p class="etat">{libelle('v2.miss.doneMb', { found: mb.trouves, total: mb.total })}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .manquants { padding: 6px 0 30px; max-width: 900px; }
  .intro { margin: 0 0 16px; color: var(--v2-txt2); font-size: 14px; }
  .err { margin: 0 0 14px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--v2-danger-bd); color: var(--v2-danger); font-size: 13px; }
  .compteurs { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 0 0 22px; }
  .compteur { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: var(--v2-r-card); background: var(--v2-surface2); border: 1px solid var(--v2-line2); }
  .nom { font: 600 12px var(--v2-sans); color: var(--v2-txt2); text-transform: uppercase; letter-spacing: .05em; }
  .n { font: 700 28px var(--v2-sans); color: var(--v2-txt); }
  .sur { font: 11px var(--v2-mono); color: var(--v2-txt3); }
  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
  .action { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .source { margin: 0; font-size: 12.5px; color: var(--v2-txt3); }
  .etat { margin: 0; font: 12px var(--v2-mono); color: var(--v2-txt2); }
</style>
