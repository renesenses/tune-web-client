<script lang="ts">
  /**
   * tune-server-rust#7128 — « Tout sélectionner (N) » puis « Appliquer un
   * tag… » sur le résultat filtré d'Oxygen, au-delà de la fenêtre chargée.
   *
   * Le geste ne porte AUCUNE liste d'identifiants : le serveur désigne
   * l'ensemble à partir des filtres (`lib/etiquetageParFiltre`). L'écran
   * demande d'abord l'aperçu (« 1 234 morceaux seront tagués »), puis la
   * confirmation, puis annonce le résultat par un toast.
   *
   * Absent quand : le serveur ne connaît pas la route (404), aucun filtre
   * n'est posé (le serveur refuserait de tout taguer), ou le résultat est vide.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { getTags, createTag, type FacetParam } from '../../lib/api';
  import type { UserTag } from '../../lib/types';
  import { notifications } from '../../lib/stores/notifications';
  import {
    apercuEtiquetage, etiqueterParFiltre, etiquetageParFiltreDisponible, filtreActif,
    type ApercuEtiquetage, type CibleEtiquetage,
  } from '../../lib/etiquetageParFiltre';

  interface Props {
    /** Les paramètres serveur de la vue : facettes, `all_of`, texte libre. */
    filtres: Record<string, FacetParam>;
    /** `album` dans la vue cartes, `track` ailleurs. */
    cibleParDefaut: CibleEtiquetage;
    /** Le total serveur du résultat dans cette cible. */
    nombre: number;
  }
  let { filtres, cibleParDefaut, nombre }: Props = $props();

  let disponible = $state(false);
  let selectionne = $state(false);
  let ouvert = $state(false);
  let retirer = $state(false);
  let cible = $state<CibleEtiquetage>('track');
  let etiquettes = $state<UserTag[]>([]);
  let choix = $state<string>('');
  let nouveauNom = $state('');
  let apercu = $state<ApercuEtiquetage | null>(null);
  let apercuEnCours = $state(false);
  let envoiEnCours = $state(false);

  const nf = (n: number) => n.toLocaleString();
  const cleDuFiltre = $derived(JSON.stringify(filtres));
  const actif = $derived(filtreActif(filtres));
  const visible = $derived(disponible && actif && nombre > 0);

  onMount(() => {
    sonderLeServeur();
  });
  async function sonderLeServeur() {
    disponible = await etiquetageParFiltreDisponible();
  }

  // Changer de filtre défait la sélection : elle désignait l'ANCIEN résultat.
  let derniereCle = '';
  $effect(() => {
    if (cleDuFiltre !== derniereCle) {
      derniereCle = cleDuFiltre;
      selectionne = false;
      ouvert = false;
    }
  });

  async function ouvrir(enRetrait: boolean) {
    retirer = enRetrait;
    cible = cibleParDefaut;
    choix = '';
    nouveauNom = '';
    apercu = null;
    ouvert = true;
    try { etiquettes = (await getTags()) ?? []; } catch { etiquettes = []; }
    await rafraichirApercu();
  }

  async function rafraichirApercu() {
    apercuEnCours = true;
    try { apercu = await apercuEtiquetage(cible, filtres); }
    catch { apercu = null; }
    finally { apercuEnCours = false; }
  }

  function choisirCible(c: CibleEtiquetage) {
    if (c === cible) return;
    cible = c;
    void rafraichirApercu();
  }

  const nomChoisi = $derived(
    choix === '__nouveau__' ? nouveauNom.trim() : (etiquettes.find(e => String(e.id) === choix)?.name ?? ''),
  );
  const peutConfirmer = $derived(
    !!apercu && !apercu.over_limit && apercu.count > 0 && nomChoisi !== '' && !envoiEnCours
    && !(retirer && choix === '__nouveau__'),
  );

  function phraseApercu(a: ApercuEtiquetage): string {
    if (a.over_limit) {
      return $t('oxygen.tagSel.overLimit').replace('{count}', nf(a.count)).replace('{limit}', nf(a.limit));
    }
    const cle = retirer
      ? (cible === 'album' ? 'oxygen.tagSel.previewRemoveAlbums' : 'oxygen.tagSel.previewRemoveTracks')
      : (cible === 'album' ? 'oxygen.tagSel.previewAlbums' : 'oxygen.tagSel.previewTracks');
    return $t(cle).replace('{count}', nf(a.count));
  }

  async function confirmer() {
    if (!peutConfirmer) return;
    envoiEnCours = true;
    try {
      let tagId: number;
      if (choix === '__nouveau__') {
        tagId = (await createTag(nouveauNom.trim())).id;
      } else {
        tagId = Number(choix);
      }
      const bilan = await etiqueterParFiltre(tagId, cible, filtres, retirer);
      const cle = retirer ? 'oxygen.tagSel.doneRemove' : 'oxygen.tagSel.doneApply';
      notifications.success(
        $t(cle).replace('{tag}', nomChoisi).replace('{changed}', nf(bilan.changed)).replace('{matched}', nf(bilan.matched)),
        6000,
      );
      ouvert = false;
      selectionne = false;
    } catch {
      notifications.error($t(retirer ? 'oxygen.tagSel.failedRemove' : 'oxygen.tagSel.failed'));
    } finally {
      envoiEnCours = false;
    }
  }
</script>

{#if visible}
  {#if !selectionne}
    <button class="oxy-tagsel" data-testid="oxy-select-all" onclick={() => { selectionne = true; }}>
      {$t('oxygen.tagSel.selectAll').replace('{count}', nf(nombre))}
    </button>
  {:else}
    <span class="oxy-tagsel-barre" role="group" aria-label={$t('oxygen.tagSel.selected').replace('{count}', nf(nombre))}>
      <span class="oxy-tagsel-compte">{$t('oxygen.tagSel.selected').replace('{count}', nf(nombre))}</span>
      <button class="oxy-tagsel" data-testid="oxy-apply-tag" onclick={() => ouvrir(false)}>{$t('oxygen.tagSel.applyTag')}</button>
      <button class="oxy-tagsel" data-testid="oxy-remove-tag" onclick={() => ouvrir(true)}>{$t('oxygen.tagSel.removeTag')}</button>
      <button class="oxy-tagsel-x" onclick={() => { selectionne = false; }} title={$t('oxygen.tagSel.clear')} aria-label={$t('oxygen.tagSel.clear')}>×</button>
    </span>
  {/if}
{/if}

{#if ouvert}
  <div class="oxy-tagsel-fond" role="presentation" onclick={() => { if (!envoiEnCours) ouvert = false; }}></div>
  <div class="oxy-tagsel-dialogue" role="dialog" aria-modal="true" aria-label={$t(retirer ? 'oxygen.tagSel.titleRemove' : 'oxygen.tagSel.titleApply')}>
    <h2>{$t(retirer ? 'oxygen.tagSel.titleRemove' : 'oxygen.tagSel.titleApply')}</h2>

    <div class="oxy-tagsel-ligne" role="radiogroup" aria-label={$t('oxygen.tagSel.target')}>
      <span>{$t('oxygen.tagSel.target')}</span>
      <button class="oxy-tagsel" class:on={cible === 'track'} aria-pressed={cible === 'track'} onclick={() => choisirCible('track')}>{$t('oxygen.tagSel.targetTracks')}</button>
      <button class="oxy-tagsel" class:on={cible === 'album'} aria-pressed={cible === 'album'} onclick={() => choisirCible('album')}>{$t('oxygen.tagSel.targetAlbums')}</button>
    </div>

    <label class="oxy-tagsel-ligne">
      <span>{$t('oxygen.tagSel.tag')}</span>
      <select bind:value={choix} data-testid="oxy-tag-choice">
        <option value="">{$t('oxygen.tagSel.choose')}</option>
        {#each etiquettes as e (e.id)}
          <option value={String(e.id)}>{e.name}</option>
        {/each}
        {#if !retirer}
          <option value="__nouveau__">{$t('oxygen.tagSel.newTag')}</option>
        {/if}
      </select>
    </label>
    {#if choix === '__nouveau__'}
      <input class="oxy-tagsel-nom" data-testid="oxy-new-tag" bind:value={nouveauNom} placeholder={$t('oxygen.tagSel.newTagPlaceholder')} />
    {/if}

    <p class="oxy-tagsel-apercu" class:alerte={apercu?.over_limit} data-testid="oxy-preview" aria-live="polite">
      {#if apercuEnCours}
        {$t('oxygen.tagSel.counting')}
      {:else if apercu}
        {phraseApercu(apercu)}
      {:else}
        {$t('oxygen.tagSel.previewFailed')}
      {/if}
    </p>

    <div class="oxy-tagsel-actions">
      <button class="oxy-tagsel" onclick={() => { ouvert = false; }} disabled={envoiEnCours}>{$t('oxygen.tagSel.cancel')}</button>
      <button class="oxy-tagsel primaire" data-testid="oxy-confirm-tag" onclick={confirmer} disabled={!peutConfirmer}>{$t('oxygen.tagSel.confirm')}</button>
    </div>
  </div>
{/if}

<style>
  .oxy-tagsel { background: var(--tune-surface); border: 1px solid var(--tune-border); color: var(--tune-text-secondary); height: 34px; padding: 0 12px; border-radius: 9px; cursor: pointer; font-size: 13px; white-space: nowrap; }
  .oxy-tagsel:hover:not(:disabled) { color: var(--tune-text); border-color: var(--tune-accent); }
  .oxy-tagsel:disabled { opacity: .5; cursor: default; }
  .oxy-tagsel.on { color: var(--tune-text); border-color: var(--tune-accent); }
  .oxy-tagsel.primaire { background: var(--tune-accent); border-color: var(--tune-accent); color: var(--tune-bg); }
  .oxy-tagsel-barre { display: inline-flex; align-items: center; gap: 6px; }
  .oxy-tagsel-compte { font-size: 13px; color: var(--tune-text); white-space: nowrap; }
  .oxy-tagsel-x { background: none; border: 0; color: var(--tune-text-secondary); font-size: 18px; cursor: pointer; padding: 0 4px; }
  .oxy-tagsel-fond { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 900; }
  .oxy-tagsel-dialogue { position: fixed; z-index: 901; left: 50%; top: 20%; transform: translateX(-50%); width: min(420px, calc(100vw - 32px)); background: var(--tune-bg); color: var(--tune-text); border: 1px solid var(--tune-border); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .oxy-tagsel-dialogue h2 { font-size: 16px; margin: 0; }
  .oxy-tagsel-ligne { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
  .oxy-tagsel-ligne select, .oxy-tagsel-nom { flex: 1; min-width: 0; height: 32px; background: var(--tune-surface); color: var(--tune-text); border: 1px solid var(--tune-border); border-radius: 8px; padding: 0 8px; }
  .oxy-tagsel-apercu { margin: 0; font-size: 14px; }
  .oxy-tagsel-apercu.alerte { color: var(--tune-danger, #d33); }
  .oxy-tagsel-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
