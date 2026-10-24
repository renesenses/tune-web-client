<script lang="ts">
  /**
   * La question du partage des écoutes avec le compte, au démarrage
   * (renesenses/tune-server-rust#6840).
   *
   * Même patron que `AssistantPremiereInstallation` : le composant monte
   * toujours, ne rend rien tant qu'il ne sait pas, interroge le serveur, et se
   * pose en surcouche quand la réponse le demande — ici, seulement si le
   * serveur est relié à un compte ET n'a jamais reçu de réponse
   * (`lib/consentementEcoutes.ts`).
   *
   * Consentement actif : aucune case précochée ; « Oui, partager » est mis en
   * avant, mais rien ne part avant le clic — le serveur garde la porte. Fermer
   * sans répondre (croix, Échap) est COMPTÉ par le serveur : la question
   * revient une fois au démarrage suivant, puis plus jamais.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import {
    corpsDeReponse,
    dejaPoseeCeDemarrage,
    lireConsentementEcoutes,
    marquerPoseeCeDemarrage,
    questionAPoser,
    type ReponseConsentementEcoutes,
  } from '../../lib/consentementEcoutes';
  import { URL_MES_ECOUTES } from '../../lib/ecoutesAuCompte';

  let ouverte = $state(false);
  let envoi = $state(false);
  let erreur = $state(false);

  onMount(async () => {
    if (dejaPoseeCeDemarrage()) return;
    let config: unknown;
    try {
      config = await api.getConfig();
    } catch {
      return;
    }
    if (questionAPoser(lireConsentementEcoutes(config))) {
      marquerPoseeCeDemarrage();
      ouverte = true;
    }
  });

  async function repondre(r: ReponseConsentementEcoutes) {
    if (envoi) return;
    envoi = true;
    erreur = false;
    try {
      await api.updateConfig(corpsDeReponse(r));
      ouverte = false;
    } catch {
      // Fermer reste fermer, même si le serveur n'a pas pu le compter. Une
      // RÉPONSE non enregistrée, elle, ne se tait pas : la fenêtre reste.
      if (r === 'fermee') ouverte = false;
      else erreur = true;
    } finally {
      envoi = false;
    }
  }

  function clavier(e: KeyboardEvent) {
    if (ouverte && e.key === 'Escape') repondre('fermee');
  }
</script>

<svelte:window onkeydown={clavier} />

{#if ouverte}
  <div class="ce-calque" data-consentement="ecoutes">
    <div class="ce-fenetre" role="dialog" aria-modal="true" aria-labelledby="ce-titre">
      <button
        class="ce-fermer"
        data-reponse="fermee"
        aria-label={$t('settings.cloudListensConsentClose')}
        disabled={envoi}
        onclick={() => repondre('fermee')}>×</button
      >
      <h2 id="ce-titre">{$t('settings.cloudListensConsentTitle')}</h2>
      <p class="ce-texte">{$t('settings.cloudListensConsentIntro')}</p>
      <p class="ce-texte"><strong>{$t('settings.cloudListensConsentSentLabel')}</strong> {$t('settings.cloudListensConsentSent')}</p>
      <p class="ce-texte"><strong>{$t('settings.cloudListensConsentNeverLabel')}</strong> {$t('settings.cloudListensConsentNever')}</p>
      <p class="ce-texte">
        {$t('settings.cloudListensConsentBenefit')}
        <a class="ce-lien" href={URL_MES_ECOUTES} target="_blank" rel="noopener noreferrer"
          >{$t('settings.cloudListensLink')}</a
        >
      </p>
      <p class="ce-rappel">{$t('settings.cloudListensConsentSettingsReminder')}</p>
      {#if erreur}<p class="ce-erreur" role="alert">{$t('settings.cloudListensConsentError')}</p>{/if}
      <div class="ce-boutons">
        <button class="ce-non" data-reponse="refuse" disabled={envoi} onclick={() => repondre('refuse')}
          >{$t('settings.cloudListensConsentNo')}</button
        >
        <button class="ce-oui" data-reponse="accepte" disabled={envoi} onclick={() => repondre('accepte')}
          >{$t('settings.cloudListensConsentYes')}</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  /* Sous la session expirée (9000), au-dessus des coquilles et de leurs
     modales (~1000). */
  .ce-calque {
    position: fixed;
    inset: 0;
    z-index: 8000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.55);
  }
  .ce-fenetre {
    position: relative;
    width: min(520px, 100%);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 24px 22px 20px;
    border-radius: 12px;
    border: 1px solid var(--tune-border, rgba(255, 255, 255, 0.1));
    background: var(--tune-surface, #16171c);
    color: var(--tune-text, #e8e8ea);
  }
  .ce-fenetre h2 {
    margin: 0 28px 12px 0;
    font-size: 18px;
    font-weight: 600;
  }
  .ce-texte {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.45;
  }
  .ce-lien {
    color: var(--tune-accent, #4f8cff);
  }
  .ce-rappel {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--tune-text-secondary, rgba(232, 232, 234, 0.7));
  }
  .ce-erreur {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--tune-error, #e5534b);
  }
  .ce-fermer {
    position: absolute;
    top: 10px;
    right: 12px;
    border: none;
    background: none;
    color: var(--tune-text-secondary, rgba(232, 232, 234, 0.7));
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }
  .ce-boutons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
    flex-wrap: wrap;
  }
  .ce-boutons button {
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .ce-non {
    border: 1px solid var(--tune-border, rgba(255, 255, 255, 0.15));
    background: transparent;
    color: var(--tune-text, #e8e8ea);
  }
  /* « Oui » mis en avant : couleur d'accent, en dernier (côté droit). */
  .ce-oui {
    border: 1px solid var(--tune-accent, #4f8cff);
    background: var(--tune-accent, #4f8cff);
    color: #fff;
    font-weight: 600;
  }
  .ce-oui:hover:not(:disabled) {
    background: var(--tune-accent-hover, #3d7af0);
  }
</style>
