<script lang="ts">
  /**
   * Une phrase → des RÈGLES du moteur existant (Assistant IA, étape 1).
   *
   * Rien n'est créé ici. Les règles proposées s'affichent ; « Modifier et
   * enregistrer » les remet à l'éditeur des playlists intelligentes
   * (`PlaylistSmartEditeurV2`), où l'utilisateur les retouche avant de les
   * enregistrer par la route habituelle.
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import {
    proposerPlaylistIa, estEchec, cleDEchec, cleDeRaison, valeurLisible,
    type PropositionIa,
  } from '../../lib/assistantIa';
  import type { EtatPlafondIa } from '../../lib/assistantIa';
  import AlertePlafondIaV2 from './AlertePlafondIaV2.svelte';

  interface Props {
    onClose: () => void;
    onPropose: (p: PropositionIa) => void;
  }
  let { onClose, onPropose }: Props = $props();

  let phrase = $state('');
  let occupe = $state(false);
  let erreur = $state<string | null>(null);
  /** #6731 — pourquoi aucune règle n'a été retenue. */
  let ecartees = $state<{ regle: Record<string, unknown>; raison: string }[]>([]);
  let nonTraduit = $state<string[]>([]);
  let proposition = $state<PropositionIa | null>(null);
  let depuisCache = $state(false);
  let cout = $state(0);
  let plafond = $state<EtatPlafondIa | null>(null);

  async function proposer(e?: Event) {
    e?.preventDefault();
    if (!phrase.trim() || occupe) return;
    occupe = true; erreur = null; proposition = null; ecartees = []; nonTraduit = [];
    try {
      const r = await proposerPlaylistIa(phrase.trim());
      if (estEchec(r)) {
        erreur = $t(cleDEchec(r.error) as any);
        ecartees = r.refusees ?? [];
        nonTraduit = r.untranslated ?? [];
        return;
      }
      proposition = r.proposition;
      depuisCache = r.depuis_cache;
      cout = r.cout_eur;
      plafond = r.plafond ?? null;
    } catch (err) {
      erreur = (err as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.playlist.title' as any)}
    onclick={(e) => e.stopPropagation()} data-playlist-par-phrase>
    <h2>{$t('assistantIa.playlist.title' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>

    <form onsubmit={proposer}>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea bind:value={phrase} rows="2" maxlength="500" autofocus
        placeholder={$t('assistantIa.playlist.placeholder' as any)} data-ia-phrase></textarea>
      <div class="pied">
        <button type="submit" class="pri" disabled={occupe || !phrase.trim()}>
          {occupe ? $t('assistantIa.playlist.thinking' as any) : $t('assistantIa.playlist.propose' as any)}
        </button>
      </div>
    </form>

    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    {#if erreur && (ecartees.length || nonTraduit.length)}
      <section class="res" data-ia-sans-regle>
        {#if nonTraduit.length}
          <h3>{$t('assistantIa.playlist.untranslated' as any)}</h3>
          <ul class="regles">{#each nonTraduit as u, i (i)}<li>{u}</li>{/each}</ul>
        {/if}
        {#if ecartees.length}
          <h3>{$t('assistantIa.playlist.refused' as any)}</h3>
          <ul class="regles refusees">
            {#each ecartees as r, i (i)}
              <li><code>{String(r.regle?.field ?? '')}</code> — {$t(cleDeRaison(r.raison) as any)}</li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    {#if proposition}
      <section class="res" data-ia-proposition>
        <h3>{$t('assistantIa.playlist.rules' as any)}</h3>
        <p class="note">
          {proposition.match_mode === 'any' ? $t('assistantIa.playlist.matchAny' as any) : $t('assistantIa.playlist.matchAll' as any)}
        </p>
        {#if proposition.rules.length}
          <ul class="regles">
            {#each proposition.rules as r, i (i)}
              <li><code>{r.field}</code> <span class="op">{r.op}</span> <b>{valeurLisible(r.value)}</b></li>
            {/each}
          </ul>
        {:else}
          <p class="note">{$t('assistantIa.playlist.noRules' as any)}</p>
        {/if}

        {#if proposition.untranslated.length}
          <h3>{$t('assistantIa.playlist.untranslated' as any)}</h3>
          <ul class="regles">
            {#each proposition.untranslated as u, i (i)}<li>{u}</li>{/each}
          </ul>
        {/if}

        {#if proposition.refusees.length}
          <h3>{$t('assistantIa.playlist.refused' as any)}</h3>
          <ul class="regles refusees" data-ia-refusees>
            {#each proposition.refusees as r, i (i)}
              <li><code>{String(r.regle?.field ?? '')}</code> — {$t(cleDeRaison(r.raison) as any)}</li>
            {/each}
          </ul>
        {/if}

        <p class="note">
          {depuisCache ? $t('assistantIa.fromCache' as any) : $t('assistantIa.cost' as any).replace('{cout}', cout.toFixed(4))}
        </p>
        <AlertePlafondIaV2 {plafond} />
        <p class="note">{$t('assistantIa.playlist.nothingCreated' as any)}</p>
        <div class="pied">
          <button type="button" class="sec" onclick={onClose}>{$t('assistantIa.cancel' as any)}</button>
          <button type="button" class="pri" disabled={!proposition.rules.length}
            onclick={() => proposition && onPropose(proposition)} data-ia-modifier>
            {$t('assistantIa.playlist.edit' as any)}
          </button>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .fond {
    position: fixed; inset: 0; z-index: 900; display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.55); padding: 20px;
  }
  .panneau {
    position: relative; width: min(560px, 100%); max-height: 90vh; overflow: auto;
    background: var(--v2-surface); color: var(--v2-txt);
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card);
    padding: 20px 22px 22px; font-family: var(--v2-sans);
  }
  h2 { font-size: 17px; font-weight: 700; margin: 0 0 14px; }
  h3 { font-size: 13px; font-weight: 700; margin: 14px 0 6px; }
  .fermer {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3);
    font-size: 20px; line-height: 1; cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  textarea {
    width: 100%; box-sizing: border-box; background: var(--v2-bg);
    border: 1px solid var(--v2-line2); border-radius: 8px; color: var(--v2-txt);
    padding: 8px 10px; font: inherit;
  }
  .pied { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
  .pri, .sec {
    border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt);
  }
  .pri { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .pri:disabled { opacity: 0.45; cursor: default; }
  .res { border-top: 1px solid var(--v2-line); margin-top: 14px; }
  .regles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .refusees { color: var(--v2-txt3); }
  .op { color: var(--v2-txt3); font-family: var(--v2-mono); }
  .note { margin: 6px 0 0; font-size: 12.5px; color: var(--v2-txt3); }
  .err { margin: 10px 0 0; font-size: 12.5px; color: var(--v2-danger); }
</style>
