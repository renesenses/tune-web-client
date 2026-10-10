<script lang="ts">
  /**
   * L'accueil d'une bibliothèque VIDE : il propose d'ajouter son premier
   * dossier (Bertrand et fil forum 2171, 10/10/2026).
   *
   * ## Pourquoi l'assistant de première installation ne suffit pas
   *
   * `AssistantPremiereInstallation` ne se montre qu'une fois par appareil, et
   * pas du tout dès que le serveur a déjà indexé UNE piste : son dossier par
   * défaut (`~/Music`) en contient souvent quelques-unes, et un lanceur qui
   * passe `TUNE_MUSIC_DIRS` en remplit d'office. Passé, fermé ou jamais vu,
   * il ne revient pas. Une bibliothèque vide doit donc, À ELLE SEULE, dire
   * quoi faire — sur l'accueil, la première page qu'on voit.
   *
   * 🔴 On ne s'affiche que sur un « zéro piste » AFFIRMÉ par le serveur : une
   * panne ou une réponse illisible ne fait rien apparaître. Devant le doute,
   * on ne met pas un écran de bienvenue sous le nez de quelqu'un qui écoute
   * sa musique depuis un an.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import BoutonAjouterDossier from './BoutonAjouterDossier.svelte';

  let vide = $state(false);
  let ajoute = $state(false);

  onMount(async () => {
    try {
      const s = await api.getLibraryStats();
      vide = typeof s?.tracks === 'number' && s.tracks === 0;
    } catch {
      vide = false;
    }
  });

  function ouvrirEmplacements() {
    v2SettingsTarget.set({ tab: 'library', section: 'musicDirs' });
    activeView.set('settings');
  }
</script>

{#if vide}
  <section class="accueil-vide" aria-labelledby="accueil-vide-titre">
    <h2 id="accueil-vide-titre">{$t('v2.accueilVide.title' as any)}</h2>
    {#if ajoute}
      <p class="ajoute" role="status">{$t('v2.accueilVide.added' as any)}</p>
    {:else}
      <p>{$t('v2.accueilVide.text' as any)}</p>
    {/if}
    <div class="gestes">
      <BoutonAjouterDossier onAjoute={() => (ajoute = true)} />
      <button class="v2-btn" type="button" onclick={ouvrirEmplacements}>{$t('v2.accueilVide.settings' as any)}</button>
    </div>
  </section>
{/if}

<style>
  .accueil-vide {
    margin: 16px 0 24px;
    padding: 20px 24px;
    border: 1px solid var(--v2-line);
    border-radius: var(--v2-r-card);
    background: var(--v2-surface);
    max-width: 720px;
  }
  h2 { margin: 0 0 8px; font-size: 1.25rem; }
  p { margin: 0 0 16px; color: var(--v2-txt2); line-height: 1.5; }
  .ajoute { color: var(--v2-txt); }
  .gestes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
</style>
