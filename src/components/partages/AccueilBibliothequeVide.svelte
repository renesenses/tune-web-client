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
  import { get } from 'svelte/store';
  import { streamingServices } from '../../lib/stores/streaming';
  import { statutsStreaming, servicesInterrogeables } from '../../lib/albumsArtisteStreaming';
  import { nomService } from '../../lib/convertisseurPlaylists';

  let vide = $state(false);
  let ajoute = $state(false);
  /**
   * web#2142 (fil 2251) — « si la bibliothèque est vide ou bien Deezer non
   * configuré, quel sens d'afficher ? ». Un abonné qui n'écoute QUE ses
   * services n'a pas à recevoir, à chaque ouverture, le grand encart de
   * bienvenue d'une bibliothèque à remplir. Avec un service connecté,
   * l'invitation tient sur une ligne discrète, qui garde les deux gestes.
   */
  let services = $state<string[]>([]);

  onMount(async () => {
    let estVide = false;
    try {
      const s = await api.getLibraryStats();
      estVide = typeof s?.tracks === 'number' && s.tracks === 0;
    } catch {
      estVide = false;
    }
    if (!estVide) return;
    // Les services AVANT d'afficher quoi que ce soit : sinon le grand encart
    // paraîtrait, puis se replierait sous les yeux.
    const statuts = await statutsStreaming(get(streamingServices), api.getStreamingServices, (x) => streamingServices.set(x));
    services = servicesInterrogeables(statuts);
    vide = true;
  });

  function ouvrirEmplacements() {
    v2SettingsTarget.set({ tab: 'library', section: 'musicDirs' });
    activeView.set('settings');
  }
</script>

{#if vide && services.length}
  <p class="accueil-vide-discret" role="note">
    <span>{$t('v2.accueilVide.streamingOnly' as any).replace('{services}', services.map(nomService).join(', '))}</span>
    <button class="lien" type="button" onclick={ouvrirEmplacements}>{$t('v2.accueilVide.settings' as any)}</button>
  </p>
{:else if vide}
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
  .accueil-vide-discret { display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    margin: 10px 0 18px; font-size: 13px; color: var(--v2-txt3); }
  .lien { border: 0; padding: 0; background: transparent; color: var(--v2-acc1); cursor: pointer; font: inherit; }
  .lien:hover { text-decoration: underline; }
</style>
