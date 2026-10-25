<script lang="ts">
  /**
   * Page `/oauth/retour` du relais : fin de la connexion au compte mozaiklabs.
   * L'adresse de retour du client `tune-web-pont` est FIXE (site-mozaiklabs#322) ;
   * le serveur à rejoindre voyage dans `state`, et on y retourne aussitôt.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { traiterRetourOAuth } from '../../lib/laissezPasser/accesParCompte';
  import { remplir } from '../../lib/laissezPasser/messages';

  let erreur = $state<string | null>(null);

  onMount(() => {
    void traiterRetourOAuth().then((e) => (erreur = e));
  });
</script>

<div class="ro">
  {#if erreur}
    <p>{remplir($t('accesCompte.retourErreur'), { code: erreur })}</p>
  {:else}
    <p>{$t('accesCompte.retourEnCours')}</p>
  {/if}
</div>

<style>
  .ro {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 16px;
    background: var(--v2-bg);
    color: var(--v2-txt);
    font-family: var(--v2-sans);
  }
</style>
