<script lang="ts">
  /**
   * « Ajouter à une playlist » d'un ALBUM entier — web#2096.
   *
   * Lit les pistes de la demande (`lib/demandeAjoutPlaylist`), puis ouvre la
   * fenêtre partagée avec toutes : un album local part en `track_ids`, un
   * album de service en `streaming_tracks` (playlist Tune) ou en une seule
   * requête chez son service.
   */
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import AddToPlaylistModal from '../partages/AddToPlaylistModal.svelte';
  import type { DemandeAjoutPlaylist } from '../../lib/demandeAjoutPlaylist';
  import type { Track } from '../../lib/types';

  interface Props {
    demande: DemandeAjoutPlaylist;
    onClose: () => void;
  }
  let { demande, onClose }: Props = $props();

  let pistes = $state<Track[] | null>(null);

  $effect(() => {
    const d = demande;
    // Résolue AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const vide = $t('collections.noTracks' as any);
    let vivant = true;
    d.pistes()
      .then((l) => {
        if (!vivant) return;
        if (!l?.length) { notifications.error(vide); onClose(); return; }
        pistes = l;
      })
      .catch(() => { if (vivant) { notifications.error(vide); onClose(); } });
    return () => { vivant = false; };
  });
</script>

{#if pistes?.length}
  <AddToPlaylistModal track={pistes[0]} tracks={pistes} {onClose} />
{/if}
