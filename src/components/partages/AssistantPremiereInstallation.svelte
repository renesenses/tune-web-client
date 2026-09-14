<script lang="ts">
  /**
   * L'assistant de première installation, pour les DEUX coquilles.
   *
   * ## Pourquoi une enveloppe, et pas un appel dans chaque coquille
   *
   * La règle « faut-il proposer l'assistant » a quatre niveaux de repli et un
   * piège (voir `lib/onboardingRequis.ts`). Écrite deux fois, elle divergera
   * deux fois. Écrite ici, les deux coquilles n'ont qu'une ligne à poser :
   *
   *     <AssistantPremiereInstallation />
   *
   * C'est le même parti que `SessionExpireeOverlay` pour la reconnexion : un
   * seul mécanisme, monté des deux côtés.
   *
   * ## Pourquoi la future v1 en avait besoin
   *
   * L'assistant n'était monté que par `App.svelte`. Tant que l'interface
   * actuelle était le défaut, cela suffisait. En basculant le défaut sur la
   * future v1 (phase 4), une installation neuve serait arrivée dans une
   * interface vide, sans dossier de musique ni zone, sans rien pour la guider.
   * Pas une page blanche — mais une première impression à réparer soi-même.
   *
   * 🔴 NE PAS rendre l'assistant conditionnel au montage de la coquille. La
   * décision est asynchrone : elle interroge le serveur. Ce composant monte
   * toujours, ne rend rien tant qu'il ne sait pas, et se pose en surcouche
   * quand la réponse arrive.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { onboardingRequis, sourcesReelles } from '../../lib/onboardingRequis';
  import OnboardingWizard from './OnboardingWizard.svelte';

  let requis = $state(false);

  onMount(async () => {
    requis = await onboardingRequis(sourcesReelles(api));
  });

  /** L'assistant a fini ou a été passé : il a déjà posé son propre drapeau. */
  function termine() {
    requis = false;
  }
</script>

{#if requis}
  <OnboardingWizard onComplete={termine} />
{/if}
