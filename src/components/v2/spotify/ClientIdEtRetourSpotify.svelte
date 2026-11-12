<script lang="ts">
  /**
   * Sous le Client ID de la carte « Services & Jetons » —
   * renesenses/tune-server-rust#8198 (Alex, 09/11/2026, rc10).
   *
   * - Le début du Client ID enregistré (`spotify_client_id_debut`), pour le
   *   comparer à l'adresse du tableau de bord Spotify.
   * - L'adresse de retour à déclarer, avec Copier, AU MÊME ENDROIT que le
   *   Client ID : `spotify_redirect_uri` de la ligne, sinon celle de
   *   `GET /system/env` (serveur plus ancien).
   * - Le retour de chaque « Enregistrer » : « Enregistré » ou « Inchangé ».
   */
  import { t } from '../../../lib/i18n';
  import { copyText } from '../../../lib/utils';
  import { clientIdEnPlace, cleDuRetourClientId, type RetourClientId } from '../../../lib/clientIdSpotify';
  import { adresseRetourDeLaLigne, debutClientId } from '../../../lib/diagnosticSpotify';

  let {
    ligne,
    uriSecours = null,
    retour = null,
  }: { ligne: Record<string, unknown>; uriSecours?: string | null; retour?: RetourClientId | null } = $props();

  const debut = $derived(debutClientId(ligne?.spotify_client_id_debut));
  const adresse = $derived(adresseRetourDeLaLigne(ligne, uriSecours));
  let copie = $state<'ok' | 'ko' | null>(null);

  async function copier(texte: string) {
    copie = (await copyText(texte)) ? 'ok' : 'ko';
  }
</script>

<div class="cidr" data-spotify-client-id-retour>
  {#if debut}
    <p data-spotify-client-id-debut>{$t('v2.spotify.jetons.debut' as any).replace('{debut}', debut)}</p>
  {/if}
  {#if retour && clientIdEnPlace(retour.etat)}
    <p class="ok" data-spotify-save-retour={retour.etat}>{$t(cleDuRetourClientId(retour.etat) as any)}{#if retour.message} — {retour.message}{/if}</p>
  {/if}
  {#if adresse}
    <div class="adresse">
      <span>{$t('v2.spotify.jetons.redirect' as any)}</span>
      <code data-spotify-jetons-redirect>{adresse}</code>
      <button class="lnk" type="button" data-copier-redirect-jetons onclick={() => copier(adresse!)}>
        {copie === 'ok' ? $t('v2.spotify.diag.copie' as any) : $t('v2.spotify.diag.copier' as any)}
      </button>
      {#if copie === 'ko'}<span class="ko">{$t('v2.spotify.diag.copieEchec' as any)}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .cidr{display:flex; flex-direction:column; gap:6px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); margin-top:6px}
  p{margin:0}
  .ok{color:var(--v2-acc1)}
  .ko{color:var(--v2-danger)}
  .adresse{display:flex; gap:8px; align-items:center; flex-wrap:wrap}
  code{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc-tint); user-select:all; word-break:break-all}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
</style>
