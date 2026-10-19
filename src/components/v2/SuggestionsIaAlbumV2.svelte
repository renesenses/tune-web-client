<script lang="ts">
  /**
   * « Suggestions IA » sur la fiche d'un album (Assistant IA, étape 1).
   *
   * Un écart avant/après par champ, avec la confiance du modèle ; chaque ligne
   * s'accepte ou se refuse, ou tout en bloc. Ce que les garde-fous du serveur
   * ont écarté (donnée MusicBrainz, champ modifié à la main) est montré à
   * part, avec sa raison, et ne peut pas être appliqué. Une application se
   * défait par « Annuler la dernière application ».
   *
   * Étape 2 : un genre accepté vaut aussi pour les pistes (le serveur le
   * recopie, comme l'édition manuelle) ; « Suggestions sur les pistes »
   * propose l'œuvre et le mouvement de chaque piste — l'assistant n'y remplit
   * que des vides.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import {
    suggestionsAlbumIa, appliquerSuggestionsIa, annulerSuggestionsIa,
    suggestionsPistesIa, appliquerPistesIa,
    estEchec, cleDEchec, cleDeRaison, cleDeChamp, cocheesParDefaut, pourcent, messageDeRapport,
    type SuggestionIa, type EcarteeIa, type RapportIa, type SuggestionPisteIa, type EcarteePisteIa,
  } from '../../lib/assistantIa';
  import type { EtatPlafondIa } from '../../lib/assistantIa';
  import AlertePlafondIaV2 from './AlertePlafondIaV2.svelte';

  interface Props {
    albumId: number;
    onClose: () => void;
    /** Une écriture a eu lieu (application ou annulation) : relire la fiche. */
    onChange: () => void;
  }
  let { albumId, onClose, onChange }: Props = $props();

  let chargement = $state(true);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);
  let suggestions = $state<SuggestionIa[]>([]);
  let ecartees = $state<EcarteeIa[]>([]);
  let cochees = $state<Set<string>>(new Set());
  let depuisCache = $state(false);
  let cout = $state(0);
  let plafond = $state<EtatPlafondIa | null>(null);
  let rapport = $state<RapportIa | null>(null);
  let annulable = $state(false);
  let message = $state<string | null>(null);
  // Étape 2 : les pistes.
  let pistesDemandees = $state(false);
  let pistes = $state<SuggestionPisteIa[]>([]);
  let pistesEcartees = $state<EcarteePisteIa[]>([]);
  let cocheesPistes = $state<Set<string>>(new Set());
  const clePiste = (s: { piste_id: number; champ: string }) => `${s.piste_id}:${s.champ}`;

  /** Le message d'un rapport, avec ce que le serveur a fait des pistes. */
  function dire(cle: string, r: RapportIa, n: number): string {
    return messageDeRapport(
      $t(cle as any).replace('{n}', String(n)),
      r,
      (k) => $t(k as any),
    );
  }

  onMount(async () => {
    try {
      const r = await suggestionsAlbumIa(albumId);
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      suggestions = r.suggestions;
      ecartees = r.ecartees;
      cochees = cocheesParDefaut(r.suggestions);
      depuisCache = r.depuis_cache;
      cout = r.cout_eur;
      plafond = r.plafond ?? null;
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { chargement = false; }
  });

  function basculer(champ: string) {
    const n = new Set(cochees);
    if (n.has(champ)) n.delete(champ); else n.add(champ);
    cochees = n;
  }

  async function appliquer(lesquelles: SuggestionIa[]) {
    if (!lesquelles.length) return;
    occupe = true; erreur = null; message = null;
    try {
      const r = await appliquerSuggestionsIa(albumId, lesquelles.map((s) => ({ champ: s.champ, valeur: s.apres })));
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      rapport = r.rapport;
      annulable = r.rapport.appliquees.length > 0;
      const faits = new Set(r.rapport.appliquees.map((l) => l.champ));
      suggestions = suggestions.filter((s) => !faits.has(s.champ));
      cochees = new Set([...cochees].filter((c) => !faits.has(c)));
      message = dire('assistantIa.album.applied', r.rapport, faits.size);
      if (faits.size) onChange();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function annuler() {
    occupe = true; erreur = null; message = null;
    try {
      const r = await annulerSuggestionsIa(albumId, rapport?.operation_id ?? null);
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      annulable = false;
      rapport = r.rapport;
      message = dire('assistantIa.album.undone', r.rapport, r.rapport.appliquees.length);
      onChange();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function demanderPistes() {
    occupe = true; erreur = null; message = null; pistesDemandees = true;
    try {
      const r = await suggestionsPistesIa(albumId);
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      pistes = r.suggestions;
      pistesEcartees = r.ecartees;
      cocheesPistes = new Set(r.suggestions.filter((x) => x.confiance >= 0.7).map(clePiste));
      depuisCache = r.depuis_cache;
      cout = r.cout_eur;
      plafond = r.plafond ?? null;
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  function basculerPiste(k: string) {
    const n = new Set(cocheesPistes);
    if (n.has(k)) n.delete(k); else n.add(k);
    cocheesPistes = n;
  }

  async function appliquerPistes() {
    const lesquelles = pistes.filter((x) => cocheesPistes.has(clePiste(x)));
    if (!lesquelles.length) return;
    occupe = true; erreur = null; message = null;
    try {
      const r = await appliquerPistesIa(albumId, lesquelles.map((x) => ({ piste_id: x.piste_id, champ: x.champ, valeur: x.apres })));
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      rapport = r.rapport;
      annulable = r.rapport.appliquees.length > 0;
      const faits = new Set(r.rapport.appliquees.map((l) => `${l.piste_id}:${l.champ}`));
      pistes = pistes.filter((x) => !faits.has(clePiste(x)));
      cocheesPistes = new Set([...cocheesPistes].filter((c) => !faits.has(c)));
      message = dire('assistantIa.album.applied', r.rapport, faits.size);
      if (faits.size) onChange();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  function toutRefuser() {
    suggestions = [];
    cochees = new Set();
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.album.title' as any)}
    onclick={(e) => e.stopPropagation()} data-suggestions-ia>
    <h2>{$t('assistantIa.album.title' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>

    {#if chargement}
      <p class="note">{$t('assistantIa.playlist.thinking' as any)}</p>
    {:else}
      {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}

      {#if suggestions.length}
        <table class="ecart" data-ia-ecart>
          <thead>
            <tr>
              <th></th>
              <th>{$t('assistantIa.album.field' as any)}</th>
              <th>{$t('assistantIa.album.before' as any)}</th>
              <th>{$t('assistantIa.album.after' as any)}</th>
              <th>{$t('assistantIa.album.confidence' as any)}</th>
            </tr>
          </thead>
          <tbody>
            {#each suggestions as s (s.champ)}
              <tr>
                <td><input type="checkbox" checked={cochees.has(s.champ)} onchange={() => basculer(s.champ)}
                  aria-label={$t(cleDeChamp(s.champ) as any)} /></td>
                <td>{$t(cleDeChamp(s.champ) as any)}</td>
                <td class="avant">{s.avant ?? $t('assistantIa.album.empty' as any)}</td>
                <td class="apres" title={s.raison ?? ''}>{s.apres}</td>
                <td class="conf">{pourcent(s.confiance)} %</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="pied">
          <button class="sec" disabled={occupe} onclick={toutRefuser}>{$t('assistantIa.album.refuseAll' as any)}</button>
          <button class="sec" disabled={occupe} onclick={() => appliquer(suggestions)} data-ia-tout>{$t('assistantIa.album.applyAll' as any)}</button>
          <button class="pri" disabled={occupe || !cochees.size}
            onclick={() => appliquer(suggestions.filter((s) => cochees.has(s.champ)))} data-ia-selection>
            {$t('assistantIa.album.applySelected' as any)}
          </button>
        </div>
      {:else if !erreur && !rapport}
        <p class="note">{$t('assistantIa.album.none' as any)}</p>
      {/if}

      {#if message}<p class="note" role="status">{message}</p>{/if}
      {#if rapport?.refusees.length}
        <h3>{$t('assistantIa.album.notApplied' as any)}</h3>
        <ul class="liste">
          {#each rapport.refusees as r, i (i)}
            <li>{$t(cleDeChamp(r.champ) as any)} — {$t(cleDeRaison(r.raison) as any)}</li>
          {/each}
        </ul>
      {/if}
      {#if annulable}
        <div class="pied">
          <button class="sec" disabled={occupe} onclick={annuler} data-ia-annuler>{$t('assistantIa.album.undo' as any)}</button>
        </div>
      {/if}

      <h3>{$t('assistantIa.tracks.title' as any)}</h3>
      {#if !pistesDemandees}
        <div class="pied gauche">
          <button class="sec" disabled={occupe} onclick={demanderPistes} data-ia-pistes>{$t('assistantIa.tracks.ask' as any)}</button>
        </div>
        <p class="note">{$t('assistantIa.tracks.hint' as any)}</p>
      {:else if pistes.length}
        <table class="ecart" data-ia-pistes-ecart>
          <thead>
            <tr>
              <th></th>
              <th>{$t('assistantIa.tracks.track' as any)}</th>
              <th>{$t('assistantIa.album.field' as any)}</th>
              <th>{$t('assistantIa.album.before' as any)}</th>
              <th>{$t('assistantIa.album.after' as any)}</th>
              <th>{$t('assistantIa.album.confidence' as any)}</th>
            </tr>
          </thead>
          <tbody>
            {#each pistes as s (clePiste(s))}
              <tr>
                <td><input type="checkbox" checked={cocheesPistes.has(clePiste(s))} onchange={() => basculerPiste(clePiste(s))}
                  aria-label={`${s.titre} — ${$t(cleDeChamp(s.champ) as any)}`} /></td>
                <td>{s.titre}</td>
                <td>{$t(cleDeChamp(s.champ) as any)}</td>
                <td class="avant">{s.avant ?? $t('assistantIa.album.empty' as any)}</td>
                <td class="apres" title={s.raison ?? ''}>{s.apres}</td>
                <td class="conf">{pourcent(s.confiance)} %</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="pied">
          <button class="pri" disabled={occupe || !cocheesPistes.size} onclick={appliquerPistes} data-ia-pistes-appliquer>
            {$t('assistantIa.album.applySelected' as any)}
          </button>
        </div>
      {:else if !occupe}
        <p class="note">{$t('assistantIa.tracks.none' as any)}</p>
      {/if}
      {#if pistesEcartees.length}
        <ul class="liste" data-ia-pistes-ecartees>
          {#each pistesEcartees as e, i (i)}
            <li>{$t(cleDeChamp(e.champ) as any)}{e.valeur ? ` (${e.valeur})` : ''} — {$t(cleDeRaison(e.raison) as any)}</li>
          {/each}
        </ul>
      {/if}

      {#if ecartees.length}
        <h3>{$t('assistantIa.album.excluded' as any)}</h3>
        <ul class="liste" data-ia-ecartees>
          {#each ecartees as e, i (i)}
            <li>{$t(cleDeChamp(e.champ) as any)}{e.valeur ? ` (${e.valeur})` : ''} — {$t(cleDeRaison(e.raison) as any)}</li>
          {/each}
        </ul>
      {/if}

      <p class="note">
        {depuisCache ? $t('assistantIa.fromCache' as any) : $t('assistantIa.cost' as any).replace('{cout}', cout.toFixed(4))}
      </p>
      <AlertePlafondIaV2 {plafond} />
      <p class="note">{$t('assistantIa.album.dbOnly' as any)}</p>
    {/if}
  </div>
</div>

<style>
  .fond {
    position: fixed; inset: 0; z-index: 900; display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.55); padding: 20px;
  }
  .panneau {
    position: relative; width: min(760px, 100%); max-height: 90vh; overflow: auto;
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
  .ecart { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ecart th { text-align: left; font-weight: 600; color: var(--v2-txt3); padding: 4px 6px; border-bottom: 1px solid var(--v2-line); }
  .ecart td { padding: 6px; border-bottom: 1px solid var(--v2-line); vertical-align: top; }
  .avant { color: var(--v2-txt3); text-decoration: line-through; }
  .apres { color: var(--v2-txt); font-weight: 600; }
  .conf { font-family: var(--v2-mono); color: var(--v2-txt2); white-space: nowrap; }
  .pied { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .pied.gauche { justify-content: flex-start; }
  .pri, .sec {
    border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt);
  }
  .pri { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .pri:disabled, .sec:disabled { opacity: 0.45; cursor: default; }
  .liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--v2-txt2); }
  .note { margin: 8px 0 0; font-size: 12.5px; color: var(--v2-txt3); }
  .err { margin: 10px 0 0; font-size: 12.5px; color: var(--v2-danger); }
</style>
