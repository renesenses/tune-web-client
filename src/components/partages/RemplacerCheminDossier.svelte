<script lang="ts">
  /**
   * tune-server-rust#8676 — « Remplacer le chemin » d'un dossier de musique,
   * dans Réglages › Bibliothèque. Aperçu d'abord (rien n'est écrit), puis
   * confirmation : voir `lib/remplacerChemin.ts`.
   */
  import { get } from 'svelte/store';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import * as api from '../../lib/api';
  import {
    estApplique,
    lignesDApercu,
    messageDeFin,
    messageDeRefus,
    type ApercuDeplacement,
  } from '../../lib/remplacerChemin';
  import FolderBrowser from './FolderBrowser.svelte';

  let { dossier, disabled = false, onRemplace }: {
    /** Le dossier de musique déclaré : l'ancien chemin. */
    dossier: string;
    disabled?: boolean;
    /** Appelé avec la liste des dossiers que rend le serveur après l'opération. */
    onRemplace?: (musicDirs: string[]) => void;
  } = $props();

  let ouvert = $state(false);
  let parcourir = $state(false);
  let nouveau = $state('');
  let occupe = $state(false);
  let apercu = $state<ApercuDeplacement | null>(null);
  let erreur = $state<string | null>(null);
  let fin = $state<string | null>(null);

  const tr = (k: string) => get(t)(k as any);
  const nombre = (n: number) => get(formatNombre)(n);
  const lignes = $derived(apercu && apercu.can_apply ? lignesDApercu(apercu, tr, nombre) : null);

  function ouvrir() {
    ouvert = true;
    nouveau = dossier;
    apercu = null;
    erreur = null;
    fin = null;
  }

  function fermer() {
    ouvert = false;
    apercu = null;
    erreur = null;
  }

  async function voirLApercu() {
    if (occupe || !nouveau.trim()) return;
    occupe = true;
    erreur = null;
    apercu = null;
    try {
      const a = await api.previewMoveMusicDir(dossier, nouveau.trim());
      erreur = messageDeRefus(a, tr, nombre);
      apercu = a;
    } catch (e: any) {
      erreur = messageDeRefus({ error: e?.message ?? String(e) }, tr, nombre);
    }
    occupe = false;
  }

  async function confirmer() {
    if (occupe || !apercu?.can_apply) return;
    occupe = true;
    erreur = null;
    try {
      const b = await api.applyMoveMusicDir(dossier, apercu.new_prefix ?? nouveau.trim(), apercu.tracks ?? 0);
      if (estApplique(b)) {
        fin = messageDeFin(b, tr, nombre);
        ouvert = false;
        apercu = null;
        onRemplace?.(Array.isArray(b.dirs) ? b.dirs : []);
      } else {
        erreur = messageDeRefus(b, tr, nombre);
        apercu = null;
      }
    } catch (e: any) {
      erreur = messageDeRefus({ error: e?.message ?? String(e) }, tr, nombre);
    }
    occupe = false;
  }
</script>

<!-- `display: contents` : le bouton est une cellule de la ligne du dossier
     (grille), le panneau s'étend sur toute la ligne. -->
<div class="remplacer-chemin">
<button class="lnk remplacer-chemin" type="button" disabled={disabled || occupe}
  title={$t('settings.moveFolderHint' as any)} onclick={ouvrir}>{$t('settings.moveFolderButton' as any)}</button>

{#if fin}<p class="hint remplacer-chemin-fin" role="status">{fin}</p>{/if}

{#if ouvert}
  <div class="remplacer-chemin-panneau" data-reglage="remplacer-chemin">
    <p class="hint">{$t('settings.moveFolderHint' as any)}</p>
    <label class="remplacer-chemin-champ">
      <span>{$t('settings.moveFolderNewPath' as any)}</span>
      <input class="txt" type="text" bind:value={nouveau} disabled={occupe}
        oninput={() => { apercu = null; erreur = null; }}
        onkeydown={(e) => { if (e.key === 'Enter') voirLApercu(); }} />
    </label>
    <div class="inline">
      <button class="lnk" type="button" disabled={occupe} onclick={() => (parcourir = true)}>{$t('settings.moveFolderBrowse' as any)}</button>
      <button class="lnk" type="button" disabled={occupe || !nouveau.trim()} onclick={voirLApercu}>{$t('settings.moveFolderPreview' as any)}</button>
      <button class="lnk" type="button" disabled={occupe} onclick={fermer}>{$t('settings.moveFolderCancel' as any)}</button>
    </div>
    {#if lignes}
      <div class="remplacer-chemin-apercu" role="status">
        <p>{lignes.resume}</p>
        {#if lignes.echantillon}<p class="hint">{lignes.echantillon}</p>{/if}
        {#if lignes.manquants.length}
          <p class="hint">{$t('settings.moveFolderMissing' as any)}</p>
          <ul class="remplacer-chemin-manquants">
            {#each lignes.manquants as m (m)}<li><code>{m}</code></li>{/each}
          </ul>
        {/if}
        <button class="v2-btn primaire" type="button" disabled={occupe} onclick={confirmer}>{$t('settings.moveFolderApply' as any)}</button>
      </div>
    {/if}
    {#if erreur}<div class="errline" role="alert">{erreur}</div>{/if}
  </div>
{/if}

{#if parcourir}
  <FolderBrowser onSelect={(c) => { parcourir = false; if (c) { nouveau = c; apercu = null; } }}
    onClose={() => (parcourir = false)} />
{/if}
</div>

<style>
  .remplacer-chemin { display: contents; }
  .remplacer-chemin-fin { grid-column: 1 / -1; margin: 0; }
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.5; cursor:default}
  .txt{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:0 11px; outline:none; width:100%; max-width:480px}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .hint{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3); margin:0}
  .errline{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-danger)}
  .inline{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .remplacer-chemin-apercu{display:flex; flex-direction:column; gap:6px; align-items:flex-start}
  .remplacer-chemin-panneau {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .remplacer-chemin-champ {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .remplacer-chemin-manquants {
    margin: 0;
    padding-left: 18px;
    font-size: 0.85em;
    overflow-wrap: anywhere;
  }
</style>
