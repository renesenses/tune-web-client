<script lang="ts">
  /**
   * « Mes fichiers locaux » (Nocturne, itération 9) : une page en segments —
   * Entretien (sources de musique, nouvelle analyse, gestion des sources),
   * Albums et Doublons (l'écran Albums de Nocturne, filtré au besoin).
   * Toutes les données et tous les gestes sont ceux de Tune : dossiers lus par
   * `getMusicDirectoryOrder`, analyse par `triggerScan`, gestion des sources
   * dans Réglages › Bibliothèque.
   */
  import Folder from '@lucide/svelte/icons/folder';
  import FolderPlus from '@lucide/svelte/icons/folder-plus';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import AlbumsNocturne from './AlbumsNocturne.svelte';
  import { ouvrirTune } from './navigationNocturne';
  import { LIBELLE_COLLECTION } from './triNocturne';
  import { ONGLETS_FICHIERS, type OngletFichiers } from './fichiersNocturne';

  interface Props { onglet?: OngletFichiers }
  let { onglet = 'entretien' }: Props = $props();
  let courant = $state<OngletFichiers>('entretien');
  $effect.pre(() => { courant = onglet; });

  let dossiers = $state<string[] | null>(null);
  let analyse = $state<'repos' | 'envoi' | 'lancee' | 'echec'>('repos');
  $effect(() => {
    api.getMusicDirectoryOrder().then((r) => { dossiers = r?.music_dirs ?? []; }).catch(() => { dossiers = []; });
  });

  async function analyser() {
    analyse = 'envoi';
    try { await api.triggerScan(); analyse = 'lancee'; } catch { analyse = 'echec'; }
  }
  function gererSources() {
    v2SettingsTarget.set({ tab: 'library' });
    ouvrirTune('settings');
  }
  const LIBELLE: Record<OngletFichiers, string> = {
    entretien: 'nocturne.fichiers.entretien', albums: 'common.albums', doublons: LIBELLE_COLLECTION.doublons,
  };
</script>

<div class="noc-fichiers" data-fichiers-locaux>
  <header class="noc-fichiers-entete">
    <h1>{$t('nocturne.tiroir.locaux')}</h1>
    <p>{$t('nocturne.fichiers.aide' as any)}</p>
    <div class="noc-segment" role="tablist" aria-label={$t('nocturne.tiroir.locaux')}>
      {#each ONGLETS_FICHIERS as o (o)}
        <button type="button" role="tab" aria-selected={courant === o} data-onglet-fichiers={o} onclick={() => (courant = o)}>{$t(LIBELLE[o] as any)}</button>
      {/each}
    </div>
  </header>

  {#if courant === 'entretien'}
    <section class="noc-fichiers-carte">
      <div class="noc-fichiers-carte-tete">
        <h2>{$t('nocturne.fichiers.sources' as any)}</h2>
        <div class="noc-fichiers-actions">
          <button type="button" class="noc-bouton" onclick={gererSources}><FolderPlus size={15} /> {$t('nocturne.fichiers.gererSources' as any)}</button>
          <button type="button" class="noc-bouton noc-bouton-plein" onclick={analyser} disabled={analyse === 'envoi'} data-rescanner>
            <RefreshCw size={15} /> {$t('nocturne.fichiers.rescanner' as any)}
          </button>
        </div>
      </div>
      {#if analyse === 'lancee'}<p class="noc-fichiers-etat" role="status">{$t('nocturne.fichiers.scanLance' as any)}</p>{/if}
      {#if analyse === 'echec'}<p class="noc-fichiers-etat erreur" role="status">{$t('common.error')}</p>{/if}
      {#if dossiers === null}
        <p class="noc-fichiers-etat">{$t('common.loading')}</p>
      {:else if !dossiers.length}
        <div class="noc-fichiers-vide">
          <Folder size={34} />
          <p class="noc-fichiers-vide-titre">{$t('nocturne.fichiers.aucuneSource' as any)}</p>
          <p>{$t('nocturne.fichiers.aucuneSourceAide' as any)}</p>
          <button type="button" class="noc-bouton noc-bouton-plein" onclick={gererSources}><FolderPlus size={15} /> {$t('nocturne.fichiers.ajouterDossier' as any)}</button>
        </div>
      {:else}
        <ul class="noc-fichiers-liste">
          {#each dossiers as d (d)}
            <li><Folder size={16} /> <span class="noc-fichiers-chemin" title={d}>{d}</span></li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else if courant === 'albums'}
    <AlbumsNocturne />
  {:else}
    <AlbumsNocturne cle="doublons" titre={$t(LIBELLE_COLLECTION.doublons as any)} />
  {/if}
</div>

<style>
  .noc-fichiers { padding: 34px 0 40px; }
  .noc-fichiers-entete h1 {
    margin: 0 0 4px;
    font-size: var(--noc-taille-titre-page);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-fichiers-entete p { margin: 0; color: var(--noc-texte-2); font-size: var(--noc-taille-sous-titre); }
  .noc-segment {
    display: inline-flex;
    gap: 2px;
    margin: 20px 0 4px;
    padding: 3px;
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-surface);
    border: 1px solid var(--noc-ligne);
  }
  .noc-segment button {
    min-height: 34px;
    padding: 0 18px;
    border: 0;
    border-radius: var(--noc-rayon-pilule);
    background: transparent;
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-segment button[aria-selected='true'] { background: var(--noc-ambre); color: var(--noc-sur-ambre); }
  .noc-fichiers-carte {
    margin-top: 22px;
    padding: 18px 20px;
    border: 1px solid var(--noc-ligne);
    border-radius: var(--noc-rayon-grand);
    background: var(--noc-surface);
  }
  .noc-fichiers-carte-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .noc-fichiers-carte-tete h2 {
    margin: 0;
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    color: var(--noc-texte-3);
  }
  .noc-fichiers-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .noc-bouton {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: var(--noc-hauteur-bouton);
    padding: 0 16px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-bouton:hover { background: var(--noc-surface-3); }
  .noc-bouton-plein { background: var(--noc-ambre); border-color: transparent; color: var(--noc-sur-ambre); }
  .noc-bouton-plein:hover { background: var(--noc-ambre-vif); }
  .noc-bouton:disabled { opacity: 0.6; cursor: default; }
  .noc-fichiers-etat { margin: 12px 0 0; color: var(--noc-texte-2); font-size: var(--noc-taille-petit); }
  .noc-fichiers-etat.erreur { color: var(--noc-danger); }
  .noc-fichiers-liste { list-style: none; margin: 14px 0 0; padding: 0; }
  .noc-fichiers-liste li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--noc-ligne);
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
  }
  .noc-fichiers-liste li :global(svg) { flex: none; color: var(--noc-ambre); }
  .noc-fichiers-chemin { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .noc-fichiers-vide { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 12px 10px; text-align: center; color: var(--noc-texte-3); }
  .noc-fichiers-vide p { margin: 0; font-size: var(--noc-taille-petit); }
  .noc-fichiers-vide-titre { color: var(--noc-texte); font-weight: var(--noc-graisse-forte); font-size: var(--noc-taille-texte); }
</style>
