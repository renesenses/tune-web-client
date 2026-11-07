<script lang="ts">
  /**
   * tune-server-rust#7922 — la fiche Tune tested d'une zone : proposer son
   * appareil après une heure d'écoute sans erreur.
   *
   * Trois temps : le bouton (grisé tant que le seuil n'est pas atteint, avec
   * le temps restant), l'aperçu EXACT de ce qui part — les lignes lisibles
   * et le corps brut, tels que le serveur les rend —, puis la confirmation.
   * Rien ne part sans ce dernier geste.
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import * as api from '../../lib/api';
  import {
    duree,
    etatDuBouton,
    lignesApercu,
    messageDeRefus,
    avecParametres,
    type EtatTuneTested,
  } from '../../lib/tuneTestedProposition';

  interface Props {
    zoneId: number;
    nom: string;
    onClose: () => void;
  }
  let { zoneId, nom, onClose }: Props = $props();

  type Phase = 'chargement' | 'bouton' | 'apercu' | 'envoi' | 'envoye';
  let phase = $state<Phase>('chargement');
  let etat = $state<EtatTuneTested | null>(null);
  let erreur = $state('');
  // #2698 — le bouton est toujours accessible : si la lecture de l'état échoue,
  // la fenêtre le dit (et non « envoi échoué »), elle n'échoue jamais en silence.
  let lectureEchouee = $state(false);

  const tr = $derived(avecParametres((cle: string) => $t(cle as any)));
  const bouton = $derived(etatDuBouton(etat, tr));

  async function charger() {
    try {
      etat = await api.getTuneTestedProposition(zoneId);
      phase = 'bouton';
    } catch (e: any) {
      lectureEchouee = true;
      erreur = $t('v2.tuneTestedPropose.err.loadFailed' as any);
      phase = 'bouton';
    }
  }
  void charger();

  async function confirmer() {
    if (!etat?.preview) return;
    phase = 'envoi';
    erreur = '';
    try {
      await api.proposerTuneTested(zoneId, etat.preview);
      phase = 'envoye';
    } catch (e: any) {
      const code = e?.code ?? e?.corps?.error;
      // Une piste s'est terminée depuis l'aperçu : le serveur n'a rien
      // envoyé et rend le nouveau, à vérifier puis confirmer de nouveau.
      if (code === 'tune_tested_preview_changed' && e?.corps?.preview && etat) {
        etat = { ...etat, preview: e.corps.preview };
      }
      erreur = messageDeRefus(code, tr, e?.corps?.status);
      phase = 'apercu';
    }
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div
    class="panneau"
    role="dialog"
    aria-modal="true"
    aria-label={$t('v2.tuneTestedPropose.title' as any)}
    onclick={(e) => e.stopPropagation()}
  >
    <h2>{$t('v2.tuneTestedPropose.title' as any)}</h2>
    <p class="zone">{nom}</p>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    {#if phase === 'chargement'}
      <p class="aide">{$t('v2.tuneTestedPropose.loading' as any)}</p>
    {:else if phase === 'envoye'}
      <p class="succes" data-testid="tt-envoye">{$t('v2.tuneTestedPropose.sent' as any)}</p>
      <div class="pied">
        <button type="button" class="pri" onclick={onClose}>{$t('common.close' as any)}</button>
      </div>
    {:else if phase === 'bouton'}
      <p class="aide">{$t('v2.tuneTestedPropose.intro' as any)}</p>
      {#if etat}
        <p class="aide">{tr('v2.tuneTestedPropose.played', { time: duree(etat.seconds_without_error, tr) })}</p>
      {/if}
      {#if etat?.already_proposed}
        <p class="aide">{$t('v2.tuneTestedPropose.already' as any)}</p>
      {/if}
      <button
        type="button"
        class="pri large"
        data-testid="tt-proposer"
        disabled={!bouton.actif}
        onclick={() => (phase = 'apercu')}
      >{$t('v2.tuneTestedPropose.button' as any)}</button>
      {#if bouton.raison}<p class="raison" data-testid="tt-raison">{bouton.raison}</p>{/if}
      {#if etat && !bouton.actif && !lectureEchouee}
        <p class="aide auto" data-testid="tt-auto">{$t('v2.tuneTestedPropose.auto' as any)}</p>
      {/if}
      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
    {:else if etat?.preview}
      <h3>{$t('v2.tuneTestedPropose.previewTitle' as any)}</h3>
      <dl class="apercu" data-testid="tt-apercu">
        {#each lignesApercu(etat.preview, tr) as l (l.cle)}
          <dt>{$t(l.cle as any)}</dt><dd>{l.valeur}</dd>
        {/each}
      </dl>
      <details>
        <summary>{$t('v2.tuneTestedPropose.raw' as any)}</summary>
        <pre data-testid="tt-brut">{JSON.stringify(etat.preview, null, 2)}</pre>
      </details>
      <p class="aide">{$t('v2.tuneTestedPropose.previewNote' as any)}</p>
      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
      <div class="pied">
        <button type="button" class="sec" onclick={() => (phase = 'bouton')}>{$t('v2.tuneTestedPropose.cancel' as any)}</button>
        <button type="button" class="pri" data-testid="tt-confirmer" disabled={phase === 'envoi'} onclick={() => void confirmer()}>
          {phase === 'envoi' ? $t('v2.tuneTestedPropose.sending' as any) : $t('v2.tuneTestedPropose.confirm' as any)}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .fond {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    padding: 20px;
  }
  .panneau {
    position: relative;
    width: min(520px, 100%);
    max-height: calc(100vh - 40px);
    overflow: auto;
    background: var(--v2-surface);
    color: var(--v2-txt);
    border: 1px solid var(--v2-line2);
    border-radius: var(--v2-r-card);
    padding: 20px 22px 22px;
    font-family: var(--v2-sans);
  }
  h2 { font-size: 17px; font-weight: 700; margin-bottom: 4px; padding-right: 32px; }
  h3 { font-size: 14px; font-weight: 700; margin: 6px 0 10px; }
  .zone { font-size: 12.5px; color: var(--v2-txt3); margin-bottom: 14px; }
  .fermer {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3);
    font-size: 20px; line-height: 1; cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  .aide { font-size: 13px; line-height: 1.55; color: var(--v2-txt2); margin-bottom: 10px; }
  .raison { font-size: 12.5px; color: var(--v2-txt3); margin-top: 8px; }
  .erreur { font-size: 12.5px; color: var(--v2-danger); margin-top: 10px; }
  .succes { font-size: 13.5px; line-height: 1.55; margin-bottom: 8px; }
  .apercu {
    display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px;
    font-size: 13px; margin-bottom: 12px;
  }
  .apercu dt { color: var(--v2-txt3); }
  .apercu dd { margin: 0; overflow-wrap: anywhere; }
  details { margin-bottom: 12px; font-size: 12.5px; color: var(--v2-txt2); }
  summary { cursor: pointer; }
  pre {
    margin-top: 8px; padding: 10px; border-radius: 8px; overflow: auto;
    background: var(--v2-bg); border: 1px solid var(--v2-line2);
    font: 11.5px/1.5 var(--v2-mono);
  }
  .pied { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  button.pri, button.sec {
    border-radius: 8px; font: 600 13px var(--v2-sans); padding: 8px 14px; cursor: pointer;
  }
  .sec { border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2); }
  .sec:hover { color: var(--v2-txt); }
  .pri { border: 0; background: var(--v2-acc1); color: var(--v2-on-acc); }
  .pri:disabled { opacity: .5; cursor: default; }
  .large { width: 100%; margin-top: 4px; }
</style>
