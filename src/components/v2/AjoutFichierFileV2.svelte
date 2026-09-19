<script lang="ts">
  /**
   * « Ajouter un fichier » à la file — voir `lib/ajoutFichiersAudio`.
   *
   * Un bouton plutôt que le seul glisser-déposer de l'ancienne file : sur une
   * tablette ou un téléphone, rien ne se glisse. Le dépôt sur la file reste
   * possible (`QueueV2`), et passe par la même fonction.
   */
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { ACCEPT_AUDIO, ajouterFichiersALaFile } from '../../lib/ajoutFichiersAudio';

  let { zoneId, onAjoute }: { zoneId: number | null; onAjoute?: () => void } = $props();

  let envoi = $state(false);
  let champ: HTMLInputElement | undefined = $state();

  export async function envoyer(fichiers: File[]) {
    if (zoneId == null || !fichiers.length) return;
    envoi = true;
    const r = await ajouterFichiersALaFile(zoneId, fichiers);
    envoi = false;
    for (const titre of r.ajoutes) notifications.success(titre);
    for (const e of r.echecs) notifications.error(`${e.fichier}: ${e.message ?? $t('queue.uploadError' as any)}`);
    if (r.ajoutes.length) onAjoute?.();
  }

  async function choisis(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const fichiers = Array.from(input.files ?? []);
    // Remis à zéro : sans cela, rechoisir le MÊME fichier ne déclenche rien.
    input.value = '';
    await envoyer(fichiers);
  }
</script>

<input bind:this={champ} class="cache" type="file" multiple accept={ACCEPT_AUDIO} onchange={choisis} tabindex="-1" aria-hidden="true" />
<button class="v2-btn ajout-fichier" onclick={() => champ?.click()} disabled={envoi || zoneId == null}
        title={$t('v2.queue.addFileTip' as any)}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
  {envoi ? $t('queue.uploading' as any) : $t('v2.queue.addFile' as any)}
</button>

<style>
  .cache{display:none}
</style>
