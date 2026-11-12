<script lang="ts">
  /**
   * « Vous voulez seulement écouter Spotify sur vos enceintes ? » —
   * renesenses/tune-server-rust#8198, volet 4. Voir `lib/spotifyConnectInvite`.
   *
   * Le bouton active Spotify Connect sur la zone qu'on peut deviner (celle du
   * serveur, la zone courante, ou la seule) ; s'il faut choisir, il mène à la
   * carte « Spotify Connect » de cet onglet, qui demande zone et nom.
   * `onActive` rend le nouveau statut à l'écran parent, pour que cette carte-là
   * ne garde pas un état périmé.
   */
  import { get } from 'svelte/store';
  import { t } from '../../../lib/i18n';
  import * as api from '../../../lib/api';
  import { zones, currentZoneId } from '../../../lib/stores/zones';
  import { v2SettingsTarget } from '../../../lib/stores/v2SettingsNav';
  import { etatInvite, zoneAExposer } from '../../../lib/spotifyConnectInvite';

  let { onActive }: { onActive?: (st: api.SpotifyConnectStatus) => void } = $props();

  let statut = $state<api.SpotifyConnectStatus | null>(null);
  let occupe = $state(false);
  let erreur = $state(false);
  let choisir = $state(false);
  let replie = $state(false);

  const etat = $derived(etatInvite(statut));

  $effect(() => {
    api.getSpotifyConnectStatus()
      .then((st) => { statut = st ?? null; })
      // 404 (serveur sans récepteur) ou panne : on ne propose rien.
      .catch(() => { statut = null; });
  });

  async function activer() {
    erreur = false;
    choisir = false;
    const zone = zoneAExposer(statut, get(currentZoneId), get(zones));
    if (zone == null) {
      // Plusieurs zones et aucune évidente : la carte Spotify Connect demande.
      choisir = true;
      v2SettingsTarget.set({ tab: 'access', section: 'spotify' });
      return;
    }
    occupe = true;
    try {
      await api.enableSpotifyConnect(zone, statut?.device_name ?? null);
      const st = await api.getSpotifyConnectStatus();
      statut = st;
      onActive?.(st);
    } catch {
      erreur = true;
    } finally {
      occupe = false;
    }
  }
</script>

{#if etat !== 'masque' && !replie}
  <aside class="invite" data-spotify-connect-invite={etat}>
    <p class="titre">{$t('v2.spotify.connect.titre' as any)}</p>
    {#if etat === 'actif'}
      <p data-spotify-connect-actif>{$t('v2.spotify.connect.actif' as any)}</p>
    {:else}
      <p>{$t('v2.spotify.connect.texte' as any)}</p>
      <button class="lnk principal" type="button" data-activer-spotify-connect disabled={occupe} onclick={activer}>
        {occupe ? '…' : $t('v2.spotify.connect.activer' as any)}
      </button>
      {#if choisir}<p class="note" data-spotify-connect-choisir>{$t('v2.spotify.connect.choisirZone' as any)}</p>{/if}
      {#if erreur}<p class="ko">{$t('v2.spotify.connect.erreur' as any)}</p>{/if}
    {/if}
    <div class="compte">
      <p>{$t('v2.spotify.connect.compte' as any)}</p>
      <button class="lnk" type="button" data-spotify-vers-compte onclick={() => (replie = true)}>{$t('v2.spotify.connect.compteBouton' as any)}</button>
    </div>
  </aside>
{/if}

<style>
  .invite{flex-basis:100%; display:flex; flex-direction:column; gap:8px; align-items:flex-start; padding:12px;
    border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); font-size:12px; color:var(--v2-txt2)}
  p{margin:0}
  .titre{font-weight:600; font-size:13px}
  .note{color:var(--v2-txt3)}
  .ko{color:var(--v2-danger)}
  .compte{display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--v2-line2); width:100%}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.principal{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
</style>
