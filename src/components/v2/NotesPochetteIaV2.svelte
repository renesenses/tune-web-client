<script lang="ts">
  /**
   * Notes de pochette écrites par l'assistant (tune-server-rust, décision de
   * Bertrand du 23/10/2026) — à la demande, à partir des SEULES métadonnées
   * déjà en base (crédits, MusicBrainz, biographie Wikipédia), marquées IA,
   * rangées par le serveur et effaçables. L'aperçu montre ce qui partirait et
   * son coût estimé ; rien n'est écrit dans la fiche de l'album.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { estEchec, messageDEchec } from '../../lib/assistantIa';
  import {
    lireNotesIa, ecrireNotesIa, effacerNotesIa, attributionsACiter, coutLisible,
    type NotesIa, type ApercuIa,
  } from '../../lib/assistantIaRc8';

  interface Props { albumId: number; onClose: () => void }
  let { albumId, onClose }: Props = $props();

  let notes = $state<NotesIa | null>(null);
  let apercu = $state<ApercuIa | null>(null);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  const estNotes = (v: unknown): v is NotesIa => !!v && typeof v === 'object' && (v as NotesIa).marque === 'ia';
  const estApercu = (v: unknown): v is ApercuIa => !!v && typeof v === 'object' && (v as ApercuIa).apercu === true;

  onMount(async () => {
    try {
      const v = await lireNotesIa(albumId);
      if (estNotes(v)) notes = v;
    } catch { /* aucune note rangée : rien à montrer */ }
  });

  async function demander(o: { apercu?: boolean; second_avis?: boolean; regenerer?: boolean }) {
    occupe = true; erreur = null;
    try {
      const v = await ecrireNotesIa(albumId, { langue: $locale, ...o });
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else if (estApercu(v)) apercu = v;
      else if (estNotes(v)) { notes = v; apercu = null; }
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function effacer() {
    occupe = true;
    try { await effacerNotesIa(albumId); notes = null; } finally { occupe = false; }
  }

  const citations = $derived(attributionsACiter(notes));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.notes.title' as any)}
    onclick={(e) => e.stopPropagation()} data-notes-pochette-ia>
    <h2>{$t('assistantIa.notes.title' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>
    <p class="note">{$t('assistantIa.notes.intro' as any)}</p>

    {#if notes}
      <section class="res" data-notes-ia>
        <p class="bandeau">{$t('assistantIa.notes.banner' as any)}</p>
        {#if notes.notes.oeuvre}
          <h3>{notes.notes.oeuvre.titre}</h3>
          {#if notes.notes.oeuvre.mouvements.length}
            <ol class="mvts">{#each notes.notes.oeuvre.mouvements as m, i (i)}<li>{m}</li>{/each}</ol>
          {/if}
        {/if}
        {#each notes.notes.paragraphes as p, i (i)}<p class="para">{p.texte}</p>{/each}
        {#if citations.length}
          <p class="note">{$t('assistantIa.notes.sources' as any)} {citations.join(' · ')}</p>
        {/if}
        <p class="note">{notes.modele} · {new Date(notes.cree_le).toLocaleDateString($locale)}</p>
      </section>
    {/if}

    {#if apercu}
      <details class="res" data-notes-apercu>
        <summary>{$t('assistantIa.preview.what' as any)} — {coutLisible(apercu.cout_estime_eur, $locale)}</summary>
        <pre>{apercu.envoye.message}</pre>
      </details>
    {/if}

    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}

    <div class="pied">
      {#if notes}<button class="sec" disabled={occupe} onclick={effacer}>{$t('assistantIa.notes.erase' as any)}</button>{/if}
      <button class="sec" disabled={occupe} onclick={() => demander({ apercu: true })}>{$t('assistantIa.preview.button' as any)}</button>
      <button class="sec" disabled={occupe} onclick={() => demander({ second_avis: true, regenerer: true })}
        title={$t('assistantIa.secondOpinion.tip' as any)}>{$t('assistantIa.secondOpinion' as any)}</button>
      <button class="pri" disabled={occupe} onclick={() => demander({ regenerer: !!notes })} data-notes-ecrire>
        {occupe ? $t('assistantIa.playlist.thinking' as any) : $t('assistantIa.notes.write' as any)}
      </button>
    </div>
  </div>
</div>

<style>
  .fond { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; background: rgba(0, 0, 0, 0.55); padding: 20px; }
  .panneau { position: relative; width: min(620px, 100%); max-height: 90vh; overflow: auto; background: var(--v2-surface); color: var(--v2-txt); border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card); padding: 20px 22px 22px; font-family: var(--v2-sans); }
  h2 { font-size: 17px; font-weight: 700; margin: 0 0 10px; }
  h3 { font-size: 14px; font-weight: 700; margin: 12px 0 6px; }
  .fermer { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3); font-size: 20px; line-height: 1; cursor: pointer; }
  .bandeau { font-size: 12px; color: var(--v2-acc1); margin: 10px 0 4px; }
  .para { font-size: 13.5px; line-height: 1.55; margin: 8px 0; }
  .mvts { font-size: 13px; margin: 0 0 6px; padding-left: 20px; }
  .res { border-top: 1px solid var(--v2-line); margin-top: 12px; padding-top: 4px; }
  pre { white-space: pre-wrap; font-size: 11.5px; max-height: 260px; overflow: auto; background: var(--v2-bg); padding: 8px; border-radius: 6px; }
  .pied { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .pri, .sec { border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt); }
  .pri { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .pri:disabled, .sec:disabled { opacity: 0.45; cursor: default; }
  .note { margin: 6px 0 0; font-size: 12.5px; color: var(--v2-txt3); }
  .err { margin: 10px 0 0; font-size: 12.5px; color: var(--v2-danger); }
</style>
