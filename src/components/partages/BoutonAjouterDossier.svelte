<script lang="ts">
  /**
   * « Ajouter un dossier… » — le geste complet, en un bouton (fil forum 2171).
   *
   * Sélecteur du SERVEUR (lecteurs Windows compris) → comptage des fichiers
   * audio → confirmation chiffrée → ajout, qui lance l'analyse.
   *
   * ## Pourquoi un composant, et pas un lien de plus dans les Réglages
   *
   * En rc3, le sélecteur existait mais se cachait : un lien « Parcourir… »
   * collé à un champ texte, qui ne faisait que REMPLIR ce champ — il fallait
   * encore cliquer « Ajouter ». Et une bibliothèque vide n'offrait aucun
   * chemin vers lui dès qu'un dossier était déclaré, ce qui est le cas de
   * toute installation neuve (le serveur déclare `~/Music` d'office). Le même
   * geste doit vivre aux trois endroits où on le cherche : les Réglages,
   * l'accueil d'une bibliothèque vide, et la Bibliothèque vide. Écrit trois
   * fois, il divergerait trois fois.
   */
  import { get } from 'svelte/store';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { dialogs } from '../../lib/stores/dialogs';
  import * as api from '../../lib/api';
  import { ajouterUnDossier } from '../../lib/ajoutDossier';
  import FolderBrowser from './FolderBrowser.svelte';

  let { onAjoute, disabled = false }: {
    /** Appelé avec la liste des dossiers que rend le serveur après l'ajout. */
    onAjoute?: (musicDirs: string[]) => void;
    disabled?: boolean;
  } = $props();

  let ouvert = $state(false);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  async function choisi(chemin: string) {
    ouvert = false;
    if (!chemin || occupe) return;
    occupe = true;
    erreur = null;
    try {
      const r = await ajouterUnDossier(chemin, {
        estimer: api.estimateMusicDir,
        ajouter: api.addMusicDir,
        confirmer: (m) => dialogs.confirm(m),
        tr: (k) => get(t)(k as any),
        nombre: (n) => get(formatNombre)(n),
      });
      if (r) onAjoute?.(r.music_dirs ?? []);
    } catch (e: any) {
      erreur = e?.message ?? get(t)('settings.errFolderRejected' as any);
    }
    occupe = false;
  }
</script>

<button class="v2-btn primaire ajouter-dossier" type="button" disabled={disabled || occupe}
  onclick={() => { erreur = null; ouvert = true; }}>
  {$t('settings.addFolderButton' as any)}
</button>
{#if erreur}<div class="errline" role="alert">{erreur}</div>{/if}

{#if ouvert}
  <FolderBrowser onSelect={choisi} onClose={() => (ouvert = false)} />
{/if}
