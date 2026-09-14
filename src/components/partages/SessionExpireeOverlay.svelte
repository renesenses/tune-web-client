<script lang="ts">
  /**
   * Le calque « session expirée » — renesenses/tune-web-client#1021.
   *
   * PAR-DESSUS, ET NON À LA PLACE. C'est la question 1 de l'issue, tranchée :
   * remplacer l'interface est plus simple, mais jette le contexte — la file
   * d'attente en cours, la recherche tapée, l'album ouvert. Le calque est un
   * `position:fixed; inset:0` : ce qu'il y avait dessous est intact quand il
   * se retire.
   *
   * Il vit dans `src/components/` et non dans `components/v2/` : les DEUX
   * coquilles le montent. Un composant par coquille aurait divergé au premier
   * correctif.
   *
   * Il ne connaît ni `activeView` ni le hash : il n'observe qu'un booléen. Le
   * 401 est loin d'ici (`api.ts` → `clearToken()` → `signalerSessionExpiree()`)
   * et n'a rien à savoir de l'écran.
   */
  import { sessionExpiree } from '../../lib/stores/sessionExpiree';
  import { t } from '../../lib/i18n';
  import LoginView from './LoginView.svelte';
</script>

{#if $sessionExpiree}
  <div class="se-calque" role="dialog" aria-modal="true" aria-label={$t('session.expiredTitle')}>
    <!--
      Le bandeau dit POURQUOI l'écran est là. Sans lui, un formulaire de
      connexion surgissant au milieu d'une écoute ressemble à un bug de plus :
      c'est le silence de l'application que l'issue reproche, pas seulement
      l'absence de formulaire.
    -->
    <div class="se-motif">
      <strong>{$t('session.expiredTitle')}</strong>
      <span>{$t('session.expiredBody')}</span>
    </div>
    <div class="se-corps">
      <LoginView surCouche />
    </div>
  </div>
{/if}

<style>
  /* Au-dessus de TOUT. Les points hauts connus des deux coquilles : 122 pour
     « Lecture en cours » en v2, 121 pour la grappe avatar, et les modales du
     client actuel autour de 1000. On se pose franchement au-dessus plutôt que
     de courir après le prochain. */
  .se-calque {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    /* Opaque, et non un simple voile : le contenu dessous n'est plus à jour —
       ses appels retournent 401 — et le laisser lisible inviterait à cliquer
       dans une interface qui ne répond plus. Il est PRÉSERVÉ, pas montré. */
    background: var(--tune-bg, #0d0e12);
    color: var(--tune-text, #e8e8ea);
  }
  .se-motif {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 20px;
    text-align: center;
    border-bottom: 1px solid var(--tune-border, rgba(255, 255, 255, 0.1));
  }
  .se-motif strong {
    font-size: 15px;
    font-weight: 600;
  }
  .se-motif span {
    font-size: 13px;
    opacity: 0.75;
  }
  /* `min-height: 0` : `.login-view` se dimensionne en `height: 100%` et défile
     lui-même. Sans cela, un petit écran en mode paysage rendrait le bouton
     « Se connecter » inatteignable — l'écran resterait aussi muet qu'avant. */
  .se-corps {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
