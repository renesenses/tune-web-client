<script lang="ts">
  import { t } from '../../lib/i18n';
  /**
   * Extensions → Pont Roon (Premium) — renesenses/tune-server-rust#4349.
   *
   * Sandro, 17/09/2026 : l'extension était installable en v0.9.152, mais aucun
   * écran ne permettait de lui donner l'archive du moissonneur. Le seul chemin
   * était `curl --data-binary`, qui n'est pas un mode d'emploi.
   *
   * Le geste est en DEUX temps, et le second est verrouillé par le premier :
   *
   *  1. choisir le fichier → APERÇU (`apercu=true`) : le serveur compte, n'écrit
   *     rien ;
   *  2. « Importer » ne s'allume qu'après un aperçu RÉUSSI du fichier choisi →
   *     `apercu=false`, le rapport final.
   *
   * Changer de fichier éteint le bouton : un aperçu ne vaut que pour les octets
   * qu'il a lus.
   *
   * Sans Premium, l'écran le dit et ne montre rien d'autre — pas de sélecteur
   * qui échouerait au clic.
   */
  import * as api from '../../lib/api';
  import type { ApiError, EtatPontRoon, RapportPontRoon } from '../../lib/api';
  import '../../styles/tune-v2.css';

  const URL_DOC = 'https://github.com/renesenses/tune-server-rust/blob/main/docs/pont-roon.md';

  let etat = $state<EtatPontRoon | null>(null);
  let chargement = $state(true);
  let erreurEtat = $state<string | null>(null);

  let fichier = $state<File | null>(null);
  let apercu = $state<RapportPontRoon | null>(null);
  let rapportFinal = $state<RapportPontRoon | null>(null);
  let occupe = $state<'apercu' | 'import' | null>(null);
  let erreur = $state<string | null>(null);
  let refusPremium = $state(false);

  async function charger() {
    try {
      etat = await api.getEtatPontRoon();
      erreurEtat = null;
    } catch (e) {
      erreurEtat = (e as Error)?.message ?? '';
    }
    chargement = false;
  }
  $effect(() => { charger(); });

  const peutImporter = $derived(!!fichier && !!apercu && !occupe);

  /** Le motif du serveur, tel quel ; un 402 devient la phrase Premium. */
  function motif(e: unknown): string {
    const err = e as ApiError;
    if (err?.status === 402) {
      refusPremium = true;
      return $t('v2.pontRoon.premiumRequired' as any);
    }
    return err?.message || String(e);
  }

  async function choisir(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    fichier = f;
    apercu = null;
    rapportFinal = null;
    erreur = null;
    if (!f) return;
    occupe = 'apercu';
    try {
      const r = await api.importerPontRoon(f, true);
      // Un autre fichier choisi pendant l'aperçu : ce résultat ne le concerne plus.
      if (fichier === f) apercu = r;
    } catch (e) {
      if (fichier === f) erreur = motif(e);
    }
    occupe = null;
  }

  async function importer() {
    if (!peutImporter || !fichier) return;
    const f = fichier;
    occupe = 'import';
    erreur = null;
    try {
      rapportFinal = await api.importerPontRoon(f, false);
      // L'import est fait : le rejouer exigerait un nouvel aperçu.
      apercu = null;
      if (etat) etat = { ...etat, dernier_rapport: rapportFinal };
    } catch (e) {
      erreur = motif(e);
    }
    occupe = null;
  }

  /** Les lignes d'un rapport. L'aperçu dit ce qui SERAIT écrit, le rapport
   *  final ce qui l'a été. */
  function lignes(r: RapportPontRoon): { cle: string; valeur: string }[] {
    const l = [
      { cle: 'v2.pontRoon.artists', valeur: `${r.artistes_apparies} / ${r.artistes_total}` },
      { cle: 'v2.pontRoon.albums', valeur: `${r.albums_apparies} / ${r.albums_total}` },
      { cle: 'v2.pontRoon.tracks', valeur: `${r.pistes_appariees} / ${r.pistes_total}` },
    ];
    if (r.preview) {
      l.push(
        { cle: 'v2.pontRoon.creditsToWrite', valeur: String(r.credits_a_ecrire) },
        { cle: 'v2.pontRoon.artistImagesToSet', valeur: String(r.images_artistes_a_poser) },
        { cle: 'v2.pontRoon.albumCoversToSet', valeur: String(r.images_albums_a_poser) },
      );
    } else {
      l.push(
        { cle: 'v2.pontRoon.creditsWritten', valeur: String(r.credits_ecrits) },
        { cle: 'v2.pontRoon.artistImagesSet', valeur: String(r.images_artistes_posees) },
        { cle: 'v2.pontRoon.albumCoversSet', valeur: String(r.images_albums_posees) },
      );
    }
    l.push(
      { cle: 'v2.pontRoon.creditsKept', valeur: String(r.credits_deja_presents) },
      { cle: 'v2.pontRoon.imagesCarried', valeur: `${r.images_portees} / ${r.images_nommees}` },
      { cle: 'v2.pontRoon.unknownArtists', valeur: String(r.artistes_inconnus?.length ?? 0) },
      { cle: 'v2.pontRoon.unknownAlbums', valeur: String(r.albums_inconnus?.length ?? 0) },
    );
    return l;
  }
</script>

{#snippet rapport(r: RapportPontRoon, titreCle: string, classe: string)}
  <div class="rap {classe}">
    <h2>{$t(titreCle as any)}</h2>
    {#if r.core || r.releve}
      <div class="src">
        {#if r.core}<span>{$t('v2.pontRoon.core' as any)} <b>{r.core}</b></span>{/if}
        {#if r.releve}<span>{$t('v2.pontRoon.releve' as any)} <b>{r.releve}</b></span>{/if}
      </div>
    {/if}
    <dl>
      {#each lignes(r) as li (li.cle)}
        <dt>{$t(li.cle as any)}</dt><dd>{li.valeur}</dd>
      {/each}
    </dl>
    {#if !r.archive}<p class="note">{$t('v2.pontRoon.jsonOnly' as any)}</p>{/if}
    {#if r.absent_de_l_api?.length}
      <p class="note">{$t('v2.pontRoon.absentFromApi' as any)} {r.absent_de_l_api.join(', ')}</p>
    {/if}
  </div>
{/snippet}

<section class="v2-pont tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.nav.plugins' as any)}</div>
      <h1>{$t('v2.pontRoon.title' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    {#if chargement}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if erreurEtat !== null}
      <div class="err">{$t('v2.pontRoon.unavailable' as any)} {erreurEtat}</div>
    {:else if !etat?.premium || refusPremium}
      <div class="premium">{$t('v2.pontRoon.premiumRequired' as any)}</div>
    {:else}
      <p class="intro">{$t('v2.pontRoon.intro' as any)}</p>
      <p class="intro">
        {$t('v2.pontRoon.prereq' as any)}
        <a href={URL_DOC} target="_blank" rel="noopener noreferrer">{$t('v2.pontRoon.docLink' as any)}</a>
      </p>

      <div class="pas">
        <label class="fic">
          <span>{$t('v2.pontRoon.chooseFile' as any)}</span>
          <input type="file" accept=".zip,.json,application/zip,application/json"
            disabled={!!occupe} onchange={choisir} />
        </label>
        <button class="go" disabled={!peutImporter} onclick={importer}>
          {occupe === 'import' ? $t('v2.pontRoon.importing' as any) : $t('v2.pontRoon.import' as any)}
        </button>
      </div>
      {#if occupe === 'apercu'}<div class="state">{$t('v2.pontRoon.previewing' as any)}</div>{/if}
      {#if !apercu && !rapportFinal && !occupe}<div class="hint">{$t('v2.pontRoon.importHint' as any)}</div>{/if}

      {#if erreur}<div class="err">{$t('v2.pontRoon.failed' as any)} {erreur}</div>{/if}

      {#if apercu}
        {@render rapport(apercu, 'v2.pontRoon.previewTitle', 'apercu')}
      {/if}
      {#if rapportFinal}
        {@render rapport(rapportFinal, 'v2.pontRoon.finalTitle', 'final')}
      {:else if etat.dernier_rapport}
        {@render rapport(etat.dernier_rapport, 'v2.pontRoon.lastTitle', 'dernier')}
      {/if}
    {/if}
  </div>
</section>

<style>
  .v2-pont{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; display:flex; flex-direction:column; gap:14px; max-width:880px}
  .state,.hint{color:var(--v2-txt3); font-size:12.5px}
  .intro{font-size:13px; line-height:1.6; color:var(--v2-txt2); max-width:74ch}
  .intro a{color:var(--v2-acc-tint)}
  .err,.premium{padding:10px 14px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .premium{border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .pas{display:flex; align-items:flex-end; gap:14px; flex-wrap:wrap}
  .fic{display:flex; flex-direction:column; gap:6px; font-size:12px; color:var(--v2-txt2)}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .rap{padding:16px 18px; border-radius:13px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .rap.final{border-color:var(--v2-acc2)}
  .rap h2{font-size:14px; font-weight:700; margin-bottom:8px}
  .src{display:flex; gap:18px; flex-wrap:wrap; font:11px var(--v2-mono); color:var(--v2-txt3); margin-bottom:10px}
  dl{display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 20px; font-size:12.5px}
  dt{color:var(--v2-txt2)}
  dd{font:12px var(--v2-mono); text-align:right}
  .note{margin-top:10px; font-size:11.5px; color:var(--v2-txt3)}
</style>
