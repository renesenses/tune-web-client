<script lang="ts">
  /**
   * « Suggestions IA » sur un LOT d'albums (Assistant IA, étape 2) — depuis
   * la Bibliothèque, sur les albums affichés (50 au plus).
   *
   * Un aperçu d'abord : le serveur traite les albums un par un, avec les
   * garde-fous de l'album seul (MusicBrainz, édition manuelle), et s'arrête
   * NET au plafond mensuel ou au budget du lot — les albums restants sont
   * dits, jamais soumis. Rien n'est écrit avant « Appliquer la sélection » ;
   * une application se défait par « Annuler ce lot ».
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import {
    lotSuggestionsIa, lotAppliquerIa, lotAnnulerIa, lignesDuLot, cleDeLigneDuLot,
    estEchec, cleDEchec, cleDeRaison, cleDeChamp, pourcent,
    type ResultatLotIa,
  } from '../../lib/assistantIa';
  import type { EtatPlafondIa } from '../../lib/assistantIa';
  import AlertePlafondIaV2 from './AlertePlafondIaV2.svelte';

  interface Props {
    albumIds: number[];
    onClose: () => void;
    onChange: () => void;
  }
  let { albumIds, onClose, onChange }: Props = $props();

  let budget = $state('');
  let occupe = $state(false);
  let erreur = $state<string | null>(null);
  let resultats = $state<ResultatLotIa[] | null>(null);
  let arret = $state<{ error: string; message: string } | null>(null);
  let nonTraites = $state<number[]>([]);
  let cout = $state(0);
  let plafond = $state<EtatPlafondIa | null>(null);
  let cochees = $state<Set<string>>(new Set());
  let operations = $state<{ album_id: number; operation_id: string | null }[]>([]);
  let message = $state<string | null>(null);

  async function lancer() {
    occupe = true; erreur = null; message = null; operations = [];
    try {
      const r = await lotSuggestionsIa(albumIds, budget);
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      resultats = r.resultats;
      arret = r.arret;
      nonTraites = r.non_traites;
      cout = r.cout_eur;
      plafond = r.plafond ?? null;
      const n = new Set<string>();
      for (const x of r.resultats) {
        if (x.ok) for (const s of x.suggestions) if (s.confiance >= 0.7) n.add(cleDeLigneDuLot(x.album_id, s.champ));
      }
      cochees = n;
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  function basculer(k: string) {
    const n = new Set(cochees);
    if (n.has(k)) n.delete(k); else n.add(k);
    cochees = n;
  }

  async function appliquer() {
    if (!resultats) return;
    const albums = lignesDuLot(resultats, cochees);
    if (!albums.length) return;
    occupe = true; erreur = null; message = null;
    try {
      const r = await lotAppliquerIa(albums);
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      let n = 0;
      const ops: { album_id: number; operation_id: string | null }[] = [];
      for (const x of r.rapports) {
        if (x.ok && x.rapport.appliquees.length) {
          n += x.rapport.appliquees.length;
          ops.push({ album_id: x.album_id, operation_id: x.rapport.operation_id });
        }
      }
      operations = ops;
      cochees = new Set();
      message = $t('assistantIa.lot.applied' as any).replace('{n}', String(n)).replace('{albums}', String(ops.length));
      if (n) onChange();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function annuler() {
    if (!operations.length) return;
    occupe = true; erreur = null; message = null;
    try {
      const r = await lotAnnulerIa(operations);
      if (estEchec(r)) { erreur = $t(cleDEchec(r.error) as any); return; }
      operations = [];
      message = $t('assistantIa.lot.undone' as any);
      onChange();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.lot.title' as any)}
    onclick={(e) => e.stopPropagation()} data-suggestions-ia-lot>
    <h2>{$t('assistantIa.lot.title' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>

    {#if resultats == null}
      <p class="note">{$t('assistantIa.lot.intro' as any).replace('{n}', String(albumIds.length))}</p>
      <label class="champ">
        <span>{$t('assistantIa.lot.budget' as any)}</span>
        <input type="text" inputmode="decimal" bind:value={budget} placeholder="0,50" data-ia-lot-budget />
      </label>
      <div class="pied">
        <button class="pri" disabled={occupe || !albumIds.length} onclick={lancer} data-ia-lot-lancer>
          {occupe ? $t('assistantIa.playlist.thinking' as any) : $t('assistantIa.lot.run' as any)}
        </button>
      </div>
    {:else}
      {#if arret}
        <p class="err" role="alert" data-ia-lot-arret>
          {$t(cleDEchec(arret.error) as any)} {$t('assistantIa.lot.notSubmitted' as any).replace('{n}', String(nonTraites.length))}
        </p>
      {/if}
      {#each resultats as x (x.album_id)}
        <section class="album">
          {#if x.ok}
            <h3>{x.titre ?? `#${x.album_id}`}</h3>
            {#if x.suggestions.length}
              <table class="ecart">
                <tbody>
                  {#each x.suggestions as s (s.champ)}
                    {@const k = cleDeLigneDuLot(x.album_id, s.champ)}
                    <tr>
                      <td><input type="checkbox" checked={cochees.has(k)} onchange={() => basculer(k)}
                        aria-label={`${x.titre ?? x.album_id} — ${$t(cleDeChamp(s.champ) as any)}`} /></td>
                      <td>{$t(cleDeChamp(s.champ) as any)}</td>
                      <td class="avant">{s.avant ?? $t('assistantIa.album.empty' as any)}</td>
                      <td class="apres" title={s.raison ?? ''}>{s.apres}</td>
                      <td class="conf">{pourcent(s.confiance)} %</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="note">{$t('assistantIa.album.none' as any)}</p>
            {/if}
            {#if x.ecartees.length}
              <p class="note">{x.ecartees.map((e) => `${$t(cleDeChamp(e.champ) as any)} — ${$t(cleDeRaison(e.raison) as any)}`).join(' · ')}</p>
            {/if}
          {:else}
            <h3>#{x.album_id}</h3>
            <p class="err">{$t(cleDEchec(x.error) as any)}</p>
          {/if}
        </section>
      {/each}
      <div class="pied">
        {#if operations.length}
          <button class="sec" disabled={occupe} onclick={annuler} data-ia-lot-annuler>{$t('assistantIa.lot.undo' as any)}</button>
        {/if}
        <button class="pri" disabled={occupe || !cochees.size} onclick={appliquer} data-ia-lot-appliquer>
          {$t('assistantIa.album.applySelected' as any)}
        </button>
      </div>
      {#if message}<p class="note" role="status">{message}</p>{/if}
      <p class="note">{$t('assistantIa.cost' as any).replace('{cout}', cout.toFixed(4))}</p>
      <AlertePlafondIaV2 {plafond} />
      <p class="note">{$t('assistantIa.album.dbOnly' as any)}</p>
    {/if}
    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
  </div>
</div>

<style>
  .fond {
    position: fixed; inset: 0; z-index: 900; display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.55); padding: 20px;
  }
  .panneau {
    position: relative; width: min(820px, 100%); max-height: 90vh; overflow: auto;
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
  .champ { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--v2-txt2); margin-top: 10px; }
  input[type='text'] {
    max-width: 160px; padding: 6px 8px; border-radius: 6px;
    border: 1px solid var(--v2-line); background: transparent; color: var(--v2-txt);
  }
  .ecart { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ecart td { padding: 5px 6px; border-bottom: 1px solid var(--v2-line); vertical-align: top; }
  .avant { color: var(--v2-txt3); text-decoration: line-through; }
  .apres { color: var(--v2-txt); font-weight: 600; }
  .conf { font-family: var(--v2-mono); color: var(--v2-txt2); white-space: nowrap; }
  .pied { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .pri, .sec {
    border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt);
  }
  .pri { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .pri:disabled, .sec:disabled { opacity: 0.45; cursor: default; }
  .note { margin: 8px 0 0; font-size: 12.5px; color: var(--v2-txt3); }
  .err { margin: 10px 0 0; font-size: 12.5px; color: var(--v2-danger); }
</style>
