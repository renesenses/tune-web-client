<script lang="ts">
  /**
   * Nomme le périphérique que la zone a RÉELLEMENT ouvert (#2207).
   *
   * Une zone réglée sur un DAC peut jouer sur les haut-parleurs : le backend
   * WASAPI appelle `GetDefaultAudioEndpoint` dès que la résolution par nom
   * échoue, et le chemin partagé retombe sur le périphérique système. Le
   * serveur le savait — deux accesseurs et une ligne de journal — mais aucun
   * écran ne le disait. Il fallait poster une capture de ses logs sur le forum
   * pour que quelqu'un puisse répondre.
   *
   * Ce panneau ne CORRIGE pas la résolution du périphérique : il la rend
   * visible. C'est ce qui permettra de constater le défaut sans lire un
   * journal.
   *
   * Modèle : `ZoneOutputBanner` — pas de champ, pas d'affichage.
   */
  import { t } from '../lib/i18n';
  import { lecturePeripheriqueSortie } from '../lib/peripheriqueSortieZone';
  import type { Zone } from '../lib/types';

  let { zone }: { zone: Zone | null | undefined } = $props();

  let lecture = $derived(lecturePeripheriqueSortie(zone));
</script>

{#if lecture}
  <div class="zod" class:zod-ecart={lecture.ecart} role="status">
    <div class="zod-row">
      <span class="zod-label">{$t('signal.outputDevice')}</span>
      <span class="zod-value" title={lecture.ouvert}>{lecture.ouvert}</span>
    </div>
    {#if lecture.ecart}
      <div class="zod-row zod-row-requested">
        <span class="zod-label">{$t('signal.outputDeviceRequested')}</span>
        <span class="zod-value zod-value-requested" title={lecture.demande}>{lecture.demande}</span>
      </div>
      <p class="zod-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{$t('signal.outputDeviceMismatch')}</span>
      </p>
    {/if}
  </div>
{/if}

<style>
  .zod {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.55rem 0.75rem;
    margin: 0 0 0.75rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.82rem;
    line-height: 1.35;
  }
  .zod-ecart {
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.4);
  }
  .zod-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }
  .zod-label {
    flex: 0 0 auto;
    opacity: 0.65;
  }
  .zod-value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .zod-value-requested {
    font-weight: 400;
    opacity: 0.8;
    text-decoration: line-through;
  }
  .zod-warn {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0.15rem 0 0;
    color: #f59e0b;
  }
  .zod-warn svg {
    flex: 0 0 auto;
    margin-top: 0.15rem;
  }
</style>
