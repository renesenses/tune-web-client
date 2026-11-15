<script lang="ts">
  /**
   * « Retour automatique par mozaiklabs.fr (expérimental) » —
   * renesenses/tune-server-rust#8198, volet 3 (contrat, section C).
   *
   * Interrupteur DÉSACTIVÉ par défaut : il ne bouge que sous le doigt de
   * l'utilisateur. Serveur sans relais (404) : rien ne s'affiche.
   */
  import { t } from '../../../lib/i18n';
  import { copyText } from '../../../lib/utils';
  import { chargerRelais, ecrireRelais, relaisSpotify } from '../../../lib/relaisSpotify';

  let occupe = $state(false);
  let erreur = $state(false);
  let copie = $state<'ok' | 'ko' | null>(null);

  $effect(() => {
    chargerRelais().catch(() => {});
  });

  async function basculer(actif: boolean) {
    occupe = true;
    erreur = false;
    try {
      await ecrireRelais(actif);
    } catch {
      erreur = true;
    } finally {
      occupe = false;
    }
  }

  async function copier(texte: string) {
    copie = (await copyText(texte)) ? 'ok' : 'ko';
  }
</script>

{#if $relaisSpotify.disponible}
  <div class="relais" data-relais-spotify={$relaisSpotify.actif ? 'actif' : 'inactif'}>
    <label class="bascule">
      <input type="checkbox" checked={$relaisSpotify.actif} disabled={occupe}
        data-relais-interrupteur
        onchange={(e) => basculer((e.currentTarget as HTMLInputElement).checked)} />
      <span>{$t('v2.spotify.relais.titre' as any)}</span>
    </label>
    <p class="aide">{$t('v2.spotify.relais.texte' as any)}</p>
    {#if $relaisSpotify.actif && $relaisSpotify.redirect_uri}
      <div class="adresse">
        <span>{$t('v2.spotify.relais.adresse' as any)}</span>
        <code data-relais-adresse>{$relaisSpotify.redirect_uri}</code>
        <button class="lnk" type="button" onclick={() => copier($relaisSpotify.redirect_uri!)}>
          {copie === 'ok' ? $t('v2.spotify.asst.copie' as any) : $t('v2.spotify.asst.copier' as any)}
        </button>
        {#if copie === 'ko'}<span class="ko">{$t('v2.spotify.asst.copieEchec' as any)}</span>{/if}
      </div>
    {/if}
    {#if erreur}<p class="ko">{$t('v2.spotify.relais.erreur' as any)}</p>{/if}
  </div>
{/if}

<style>
  .relais{flex-basis:100%; display:flex; flex-direction:column; gap:6px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .bascule{display:flex; gap:8px; align-items:center; font-weight:600; color:var(--v2-txt2); cursor:pointer}
  .aide{margin:0}
  .adresse{display:flex; gap:8px; align-items:center; flex-wrap:wrap}
  code{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc-tint); user-select:all; word-break:break-all}
  .ko{margin:0; color:var(--v2-danger)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
</style>
