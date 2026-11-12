<script lang="ts">
  /**
   * « Vérifier la configuration » de la carte Spotify —
   * renesenses/tune-server-rust#8198, volet 1 (contrat, section B).
   *
   * - À l'ouverture et à chaque connexion réussie, le diagnostic est lu en
   *   silence : si l'accès à l'API est refusé (compte absent de User
   *   Management, jeton refusé), la phrase s'affiche — un ancien jeton peut
   *   l'être aussi, pas seulement une connexion neuve.
   * - Le bouton relit le diagnostic et en montre la liste lisible.
   * - Serveur plus ancien (404) : rien ne s'affiche, bouton compris.
   */
  import { t } from '../../../lib/i18n';
  import { copyText } from '../../../lib/utils';
  import {
    alerteAccesApi,
    chargerDiagnosticSpotify,
    corrections,
    lignesDiagnostic,
    texteCorrection,
    type DiagnosticSpotify,
  } from '../../../lib/diagnosticSpotify';

  let { connecte = false }: { connecte?: boolean } = $props();

  /** `null` tant qu'on ne sait pas ; `false` : serveur sans diagnostic. */
  let disponible = $state<boolean | null>(null);
  let diag = $state<DiagnosticSpotify | null>(null);
  let ouvert = $state(false);
  let enCours = $state(false);
  let echec = $state(false);
  let copie = $state<'ok' | 'ko' | null>(null);

  const alerte = $derived(alerteAccesApi(diag));
  const lignes = $derived(diag ? lignesDiagnostic(diag) : []);
  const aFaire = $derived(diag ? corrections(diag) : []);

  async function lire(): Promise<void> {
    enCours = true;
    echec = false;
    try {
      const d = await chargerDiagnosticSpotify();
      if (d === null) {
        disponible = false;
        diag = null;
      } else {
        disponible = true;
        diag = d;
      }
    } catch {
      echec = true;
    } finally {
      enCours = false;
    }
  }

  // Lecture silencieuse à l'ouverture, puis à chaque passage à « connecté ».
  $effect(() => {
    void connecte;
    void lire();
  });

  async function verifier() {
    ouvert = true;
    copie = null;
    await lire();
  }

  async function copier(texte: string) {
    copie = (await copyText(texte)) ? 'ok' : 'ko';
  }
</script>

{#if disponible !== false}
  <div class="verif" data-verification-spotify>
    {#if alerte}
      <p class="alerte" data-spotify-acces-refuse>{$t(alerte as any)}</p>
    {/if}

    {#if disponible}
      <button class="lnk" type="button" data-verifier-spotify disabled={enCours} onclick={verifier}>
        {enCours ? '…' : $t('v2.spotify.diag.verifier' as any)}
      </button>
    {/if}

    {#if ouvert && echec}
      <p class="alerte">{$t('v2.spotify.diag.echec' as any)}</p>
    {:else if ouvert && diag}
      <ul class="lignes">
        {#each lignes as l (l.id)}
          <li data-ligne={l.id} data-etat={l.etat} class={l.etat}>
            <span class="lib">{$t(l.libelle as any)}</span>
            <span class="val">{$t(l.valeur as any)}{#if l.extra} — {l.extra}{/if}</span>
            {#if l.aCopier}
              <span class="copier">
                <code>{l.aCopier}</code>
                <button class="lnk" type="button" data-copier-redirect onclick={() => copier(l.aCopier!)}>
                  {copie === 'ok' ? $t('v2.spotify.diag.copie' as any) : $t('v2.spotify.diag.copier' as any)}
                </button>
              </span>
              {#if copie === 'ko'}<span class="ko-txt">{$t('v2.spotify.diag.copieEchec' as any)}</span>{/if}
            {/if}
          </li>
        {/each}
      </ul>
      {#if aFaire.length === 0}
        <p class="bien" data-spotify-tout-va-bien>{$t('v2.spotify.diag.toutVaBien' as any)}</p>
      {:else}
        <p class="titre">{$t('v2.spotify.diag.aCorriger' as any)}</p>
        <ol class="corrections">
          {#each aFaire as c (c.item)}
            <li data-a-corriger={c.item}>{texteCorrection($t(c.cle as any), c, diag)}
              {#if c.causes?.length}
                <ol class="causes" data-causes-refus>
                  {#each c.causes as cause (cause)}<li>{$t(cause as any)}</li>{/each}
                </ol>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .verif{flex-basis:100%; display:flex; flex-direction:column; gap:8px; align-items:flex-start;
    font-size:11.5px; color:var(--v2-txt3)}
  .alerte{margin:0; color:var(--v2-danger)}
  .bien{margin:0; color:var(--v2-acc1)}
  .titre{margin:0; font-weight:600; color:var(--v2-txt2)}
  .lignes{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; width:100%}
  .lignes li{display:flex; flex-wrap:wrap; gap:4px 10px; align-items:baseline}
  .lib{font-weight:600; color:var(--v2-txt2); min-width:12em}
  .ok .val{color:var(--v2-acc1)}
  .ko .val, .ko-txt{color:var(--v2-danger)}
  .copier{flex-basis:100%; display:flex; gap:8px; align-items:center; flex-wrap:wrap}
  code{font:11px var(--v2-mono); color:var(--v2-acc-tint); user-select:all; word-break:break-all}
  .causes{margin:4px 0 0; padding-left:18px}
  .corrections{margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px; color:var(--v2-txt2)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
</style>
