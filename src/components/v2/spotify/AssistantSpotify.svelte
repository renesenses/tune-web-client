<script lang="ts">
  /**
   * Assistant pas à pas de la carte Spotify — renesenses/tune-server-rust#8198,
   * volet 3. Voir `lib/assistantSpotify` pour les quatre écrans.
   *
   * L'étape 4 renvoie aux champs déjà présents sous l'assistant (Client ID,
   * « Se connecter ») : un seul endroit pour les saisir.
   */
  import { t } from '../../../lib/i18n';
  import { copyText } from '../../../lib/utils';
  import { adresseADeclarer, relaisSpotify } from '../../../lib/relaisSpotify';
  import {
    DESCRIPTION_APPLICATION,
    GUIDE_SPOTIFY,
    NB_ETAPES,
    NOM_APPLICATION,
    TABLEAU_DE_BORD_SPOTIFY,
    ecrireSaut,
    etapePrecedente,
    etapeSuivante,
    lireSaut,
    ouvertAuDepart,
    type Etape,
  } from '../../../lib/assistantSpotify';

  let { uriServeur = null, clientIdManque = false }: { uriServeur?: string | null; clientIdManque?: boolean } = $props();

  // `clientIdManque` arrive après coup (`GET /system/env`) : l'ouverture se
  // DÉRIVE, et le geste de l'utilisateur l'emporte.
  let saute = $state(lireSaut());
  let force = $state(false);
  const ouvert = $derived(force || ouvertAuDepart(clientIdManque, saute));
  let etape = $state<Etape>(1);
  let copie = $state<string | null>(null);
  let copieKo = $state(false);

  const adresse = $derived(adresseADeclarer(uriServeur, $relaisSpotify));
  const viaRelais = $derived($relaisSpotify.disponible && $relaisSpotify.actif && !!$relaisSpotify.redirect_uri);

  async function copier(id: string, texte: string) {
    const ok = await copyText(texte);
    copie = ok ? id : null;
    copieKo = !ok;
  }

  function sauter() {
    ecrireSaut(true);
    saute = true;
    force = false;
  }

  function ouvrir() {
    ecrireSaut(false);
    saute = false;
    etape = 1;
    force = true;
  }
</script>

{#if !ouvert}
  <div class="replie">
    <button class="lnk" type="button" data-assistant-ouvrir onclick={ouvrir}>{$t('v2.spotify.asst.afficher' as any)}</button>
  </div>
{:else}
  <section class="assistant" data-assistant-spotify data-etape={etape} aria-live="polite">
    <header>
      <strong>{$t('v2.spotify.asst.titre' as any)}</strong>
      <span class="compteur">{$t('v2.spotify.asst.etape' as any).replace('{n}', String(etape)).replace('{total}', String(NB_ETAPES))}</span>
    </header>

    {#if etape === 1}
      <h4>{$t('v2.spotify.asst.e1Titre' as any)}</h4>
      <p>{$t('v2.spotify.asst.e1Texte' as any)}</p>
      <a class="lnk" href={TABLEAU_DE_BORD_SPOTIFY} target="_blank" rel="noopener" data-assistant-dashboard>{$t('v2.spotify.asst.e1Ouvrir' as any)}</a>
      <dl class="valeurs">
        <dt>{$t('v2.spotify.asst.nom' as any)}</dt>
        <dd><code>{NOM_APPLICATION}</code>
          <button class="lnk" type="button" onclick={() => copier('nom', NOM_APPLICATION)}>{copie === 'nom' ? $t('v2.spotify.asst.copie' as any) : $t('v2.spotify.asst.copier' as any)}</button></dd>
        <dt>{$t('v2.spotify.asst.description' as any)}</dt>
        <dd><code>{DESCRIPTION_APPLICATION}</code>
          <button class="lnk" type="button" onclick={() => copier('desc', DESCRIPTION_APPLICATION)}>{copie === 'desc' ? $t('v2.spotify.asst.copie' as any) : $t('v2.spotify.asst.copier' as any)}</button></dd>
      </dl>
    {:else if etape === 2}
      <h4>{$t('v2.spotify.asst.e2Titre' as any)}</h4>
      <p>{$t('v2.spotify.asst.e2Texte' as any)}</p>
      {#if adresse}
        <div class="adresse">
          <code data-assistant-adresse>{adresse}</code>
          <button class="lnk" type="button" data-assistant-copier-adresse onclick={() => copier('adresse', adresse!)}>{copie === 'adresse' ? $t('v2.spotify.asst.copie' as any) : $t('v2.spotify.asst.copier' as any)}</button>
        </div>
        {#if viaRelais}<p class="note">{$t('v2.spotify.asst.e2Relais' as any)}</p>{/if}
      {:else}
        <p class="ko">{$t('v2.spotify.asst.e2SansAdresse' as any)}</p>
      {/if}
    {:else if etape === 3}
      <h4>{$t('v2.spotify.asst.e3Titre' as any)}</h4>
      <p>{$t('v2.spotify.asst.e3Texte' as any)}</p>
      <p class="note" data-assistant-premium>{$t('v2.spotify.asst.e3Premium' as any)}</p>
    {:else}
      <h4>{$t('v2.spotify.asst.e4Titre' as any)}</h4>
      <p>{$t('v2.spotify.asst.e4Texte' as any)}</p>
    {/if}

    {#if copieKo}<p class="ko">{$t('v2.spotify.asst.copieEchec' as any)}</p>{/if}

    <footer>
      {#if etape > 1}
        <button class="lnk" type="button" data-assistant-precedent onclick={() => { etape = etapePrecedente(etape); copie = null; }}>{$t('v2.spotify.asst.precedent' as any)}</button>
      {/if}
      {#if etape < NB_ETAPES}
        <button class="lnk" type="button" data-assistant-suivant onclick={() => { etape = etapeSuivante(etape); copie = null; }}>{$t('v2.spotify.asst.suivant' as any)}</button>
      {/if}
      <button class="lnk discret" type="button" data-assistant-sauter onclick={sauter}>{$t('v2.spotify.asst.dejaClientId' as any)}</button>
      <a class="guide" href={GUIDE_SPOTIFY} target="_blank" rel="noopener" data-assistant-guide>{$t('v2.spotify.asst.guideComplet' as any)}</a>
    </footer>
  </section>
{/if}

<style>
  .replie{flex-basis:100%}
  .assistant{flex-basis:100%; display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:10px;
    border:1px solid var(--v2-line2); font-size:12px; color:var(--v2-txt2)}
  header{display:flex; justify-content:space-between; gap:10px; align-items:baseline; flex-wrap:wrap}
  .compteur{font:10px var(--v2-mono); color:var(--v2-txt3)}
  h4{margin:0; font-size:13px}
  p{margin:0}
  .note{color:var(--v2-txt3)}
  .ko{color:var(--v2-danger)}
  .valeurs{display:grid; grid-template-columns:auto 1fr; gap:6px 12px; margin:0; align-items:center}
  dd{margin:0; display:flex; gap:8px; align-items:center; flex-wrap:wrap}
  .adresse{display:flex; gap:8px; align-items:center; flex-wrap:wrap}
  code{font:11px var(--v2-mono); color:var(--v2-acc-tint); user-select:all; word-break:break-all}
  footer{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px}
  .guide{margin-left:auto; color:var(--v2-acc-tint); font-size:11.5px}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans); text-decoration:none}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.discret{border-color:transparent}
</style>
