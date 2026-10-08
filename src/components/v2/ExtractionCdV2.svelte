<script lang="ts">
  /**
   * Lecture CD → « Extraire vers la bibliothèque » — tune-server-rust#2466.
   *
   * Contrat : `lib/extractionCd.ts` (serveur : tune-server-rust#5938).
   *
   * - L'action n'existe que si `GET /extraction/reglages` répond avec ses
   *   emplacements : un serveur antérieur (404), un compte non administrateur
   *   (401/403) ou un greffon sans le module ne la montrent pas.
   * - La feuille : format, destination (mémorisée par `PUT /extraction/reglages`
   *   quand elle change), pistes, artiste, album et titres pré-remplis depuis
   *   `/disque` (MusicBrainz), vérification.
   * - Le suivi vit des évènements `cd.extraction.*` (l'état complet à chaque
   *   fois). Si le flux se tait (repli en relecture HTTP), la route est relue.
   * - L'état final propose d'ouvrir l'album une fois le scan passé
   *   (`library.scan.completed`).
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { tuneWS } from '../../lib/websocket';
  import { dialogs } from '../../lib/stores/dialogs';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { searchLibrary, getAlbum } from '../../lib/api';
  import type { Album } from '../../lib/types';
  import { detailOuvert, ouvrirDetail, fermerDetailEnReculant } from '../../lib/historiqueCoquille';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import { titrePisteCd, type DisqueCd } from '../../lib/lectureCd';
  import {
    getReglagesExtraction, putReglagesExtraction, lancerExtraction, getExtractions, getExtraction,
    annulerExtraction, extractionDisponible, motifRefus, cleRefus, corpsLancement,
    appliquerEvenement, secteursIllisibles, albumIdDepuisRecherche, scanAttendu,
    type ReglagesExtraction, type EtatExtraction, type FormatExtraction, type VerificationExtraction,
  } from '../../lib/extractionCd';

  let { disque }: { disque: DisqueCd } = $props();

  /** Relecture de secours quand aucun évènement n'est venu depuis ce délai. */
  const SILENCE_MS = 5000;
  const RELECTURE_MS = 3000;
  /** Au-delà, on n'attend plus la fin du scan pour proposer l'album. */
  const ATTENTE_SCAN_MAX_MS = 60000;

  let reglages = $state<ReglagesExtraction | null>(null);
  let suivi = $state<EtatExtraction | null>(null);
  let feuille = $state(false);
  let travail = $state(false);
  let erreurFeuille = $state<string | null>(null);
  let erreurSuivi = $state<string | null>(null);
  let annulationDemandee = $state(false);
  let scanPasse = $state(false);
  let albumOuvert = $state<Album | null>(null);
  let albumIntrouvable = $state(false);

  // Saisie de la feuille.
  let format = $state<FormatExtraction>('flac');
  let destination = $state('');
  let verification = $state<VerificationExtraction>('doute');
  let choisies = $state<number[]>([]);
  let artiste = $state('');
  let album = $state('');
  let titres = $state<Record<number, string>>({});
  let ecraser = $state(false);

  let fini = false;
  let dernierEvenement = 0;
  let relecture: ReturnType<typeof setInterval> | null = null;
  let attenteScan: ReturnType<typeof setTimeout> | null = null;

  const expert = $derived(atLeast($preferences.settingsLevel, 'expert'));
  const pisteN = $derived($t('v2.cd.trackN' as any));
  const phrase = (code: string | null) => $t(cleRefus(code) as any);

  // ─── Disponibilité, et reprise d'une extraction déjà lancée ──────────────
  async function demarrer() {
    try {
      const r = await getReglagesExtraction();
      if (fini || !extractionDisponible(r)) return;
      reglages = r;
    } catch {
      return; // 404 (serveur antérieur), 401/403 : pas d'action.
    }
    try {
      const enCours = (await getExtractions()).find((e) => e.statut === 'en_cours');
      if (!fini && enCours && !suivi) suivre(enCours);
    } catch { /* l'action reste offerte ; le refus dira s'il y a un conflit */ }
  }
  $effect(() => { void demarrer(); });

  // ─── Évènements ───────────────────────────────────────────────────────────
  $effect(() => tuneWS.onEvent((ev) => {
    if (ev?.type === 'library.scan.completed') {
      if (suivi && suivi.statut !== 'en_cours') scanPasse = true;
      return;
    }
    const nouveau = appliquerEvenement(suivi, ev);
    if (!nouveau) return;
    dernierEvenement = Date.now();
    suivre(nouveau);
  }));

  function suivre(e: EtatExtraction) {
    if (suivi?.id !== e.id) {
      scanPasse = false; albumIntrouvable = false; annulationDemandee = false;
      if (attenteScan) clearTimeout(attenteScan);
      attenteScan = null;
    }
    suivi = e;
    if (e.statut === 'en_cours') { armerRelecture(); return; }
    arreterRelecture();
    annulationDemandee = false;
    // Sans scan lancé, rien à attendre ; sinon `library.scan.completed`, ou
    // au plus ATTENTE_SCAN_MAX_MS (un scan peut finir sans que l'on l'entende).
    if (!scanAttendu(e)) scanPasse = true;
    else if (!scanPasse && !attenteScan && !fini) {
      attenteScan = setTimeout(() => { scanPasse = true; }, ATTENTE_SCAN_MAX_MS);
    }
  }

  function armerRelecture() {
    if (relecture || fini) return;
    relecture = setInterval(async () => {
      if (!suivi || suivi.statut !== 'en_cours') { arreterRelecture(); return; }
      if (Date.now() - dernierEvenement < SILENCE_MS) return;
      try {
        const e = await getExtraction(suivi.id);
        if (!fini && suivi && e.id === suivi.id) suivre(e);
      } catch (err) {
        if (motifRefus(err) === 'extraction_inconnue') { arreterRelecture(); erreurSuivi = phrase('extraction_inconnue'); }
      }
    }, RELECTURE_MS);
  }

  function arreterRelecture() {
    if (relecture) clearInterval(relecture);
    relecture = null;
  }

  onDestroy(() => {
    fini = true;
    arreterRelecture();
    if (attenteScan) clearTimeout(attenteScan);
  });

  // ─── Feuille de lancement ────────────────────────────────────────────────
  function ouvrirFeuille() {
    if (!reglages) return;
    format = reglages.formats.includes(reglages.format) ? reglages.format : 'flac';
    destination = reglages.destination ?? reglages.emplacements[0] ?? '';
    verification = 'doute';
    choisies = disque.pistes.map((p) => p.numero);
    artiste = disque.artiste ?? '';
    album = disque.titre ?? '';
    titres = Object.fromEntries(disque.pistes.map((p) => [p.numero, titrePisteCd(p, disque, pisteN)]));
    ecraser = false;
    erreurFeuille = null;
    feuille = true;
  }

  function basculer(n: number) {
    choisies = choisies.includes(n) ? choisies.filter((x) => x !== n) : [...choisies, n];
  }

  async function lancer(ev?: Event) {
    ev?.preventDefault();
    if (travail || !reglages) return;
    if (!choisies.length) { erreurFeuille = phrase('pistes_vides'); return; }
    travail = true;
    erreurFeuille = null;
    try {
      // Le choix devient le défaut : mémorisé côté serveur, pour tous les clients.
      if (format !== reglages.format || (destination && destination !== reglages.destination)) {
        reglages = await putReglagesExtraction({ format, destination });
      }
      const e = await lancerExtraction(corpsLancement(
        { format, destination, verification, pistes: choisies, artiste, album, titres, ecraser },
        disque,
      ));
      feuille = false;
      erreurSuivi = null;
      dernierEvenement = Date.now();
      suivre(e);
    } catch (err) {
      erreurFeuille = phrase(motifRefus(err));
    } finally {
      travail = false;
    }
  }

  // ─── Suivi ────────────────────────────────────────────────────────────────
  async function annuler() {
    if (!suivi || suivi.statut !== 'en_cours' || annulationDemandee) return;
    if (!(await dialogs.confirm($t('v2.cd.rip.cancelConfirm' as any), { danger: true }))) return;
    const id = suivi.id;
    annulationDemandee = true;
    erreurSuivi = null;
    try {
      const e = await annulerExtraction(id);
      // 202 : encore `en_cours`, l'arrêt vient au bloc suivant.
      if (suivi?.id === id && e.statut !== 'en_cours') suivre(e);
    } catch (err) {
      annulationDemandee = false;
      const code = motifRefus(err);
      if (code === 'extraction_terminee') {
        try { suivre(await getExtraction(id)); } catch { /* l'évènement final suivra */ }
      } else {
        erreurSuivi = phrase(code);
      }
    }
  }

  async function ouvrirAlbum() {
    if (!suivi || travail) return;
    travail = true;
    albumIntrouvable = false;
    try {
      const r = await searchLibrary(suivi.album, 50);
      const id = albumIdDepuisRecherche(r, suivi);
      if (id == null) { albumIntrouvable = true; return; }
      const a = await getAlbum(id);
      const cle = cleDetailAlbum(a);
      if (cle) ouvrirDetail(cle);
      albumOuvert = a;
    } catch {
      albumIntrouvable = true;
    } finally {
      travail = false;
    }
  }

  function fermerAlbum() {
    fermerDetailEnReculant(() => { albumOuvert = null; });
  }
  $effect(() => {
    if ($detailOuvert == null && albumOuvert) albumOuvert = null;
  });

  function fermerSuivi() {
    suivi = null;
    erreurSuivi = null;
    if (attenteScan) clearTimeout(attenteScan);
    attenteScan = null;
  }

  const pct = (x: number) => `${Math.max(0, Math.min(100, Math.round(x || 0)))} %`;
  const illisibles = $derived(suivi ? secteursIllisibles(suivi) : 0);

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape' && feuille && !travail) feuille = false;
  }
</script>

<svelte:window onkeydown={auClavier} />

{#if reglages}
  <button class="go extraire" disabled={suivi?.statut === 'en_cours'} onclick={ouvrirFeuille}>
    {$t('v2.cd.rip.action' as any)}
  </button>
{/if}

{#if suivi}
  <div class="suivi" data-statut={suivi.statut} aria-live="polite">
    <div class="tete">
      <strong class="statut">
        {#if suivi.statut === 'en_cours'}{$t((annulationDemandee ? 'v2.cd.rip.cancelling' : 'v2.cd.rip.running') as any)}
        {:else if suivi.statut === 'terminee'}{$t('v2.cd.rip.done' as any)}
        {:else if suivi.statut === 'annulee'}{$t('v2.cd.rip.cancelled' as any)}
        {:else}{$t('v2.cd.rip.failed' as any)}{/if}
      </strong>
      <span class="global">{pct(suivi.pourcentage)}</span>
      {#if suivi.statut === 'en_cours'}
        <button class="sec annuler" disabled={annulationDemandee} onclick={annuler}>{$t('v2.cd.rip.cancel' as any)}</button>
      {:else}
        <button class="lnk fermer-suivi" aria-label={$t('common.close' as any)} onclick={fermerSuivi}>×</button>
      {/if}
    </div>
    <div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(suivi.pourcentage || 0)}>
      <span style:width={pct(suivi.pourcentage).replace(' ', '')}></span>
    </div>
    {#if suivi.statut === 'echec' && suivi.erreur}
      <div class="err" role="alert">{phrase(suivi.erreur.code)}</div>
    {/if}
    {#if erreurSuivi}<div class="err" role="alert">{erreurSuivi}</div>{/if}
    {#if illisibles > 0}
      <div class="avert" role="alert">{$t('v2.cd.rip.unreadableWarn' as any)}</div>
    {/if}
    <ol class="pistes-suivi">
      {#each suivi.pistes as p (p.numero)}
        <li class="piste-suivi" data-statut={p.statut} class:courante={suivi.piste_courante === p.numero}>
          <span class="num">{p.numero}</span>
          <span class="titre">{p.titre}</span>
          <span class="etat">{$t(`v2.cd.rip.st.${p.statut}` as any)}</span>
          <span class="pc">{pct(p.pourcentage)}</span>
          {#if p.secteurs_illisibles > 0}
            <span class="illisibles">{$t('v2.cd.rip.unreadable' as any).replace('{n}', String(p.secteurs_illisibles))}</span>
          {/if}
          {#if expert && (p.accuraterip_v1 || p.accuraterip_v2)}
            <span class="crc" title={$t('v2.cd.rip.accurateRip' as any)}>{$t('v2.cd.rip.crc' as any).replace('{crc1}', p.accuraterip_v1 ?? '—').replace('{crc2}', p.accuraterip_v2 ?? '—')}</span>
          {/if}
          {#if expert && p.lectures_supplementaires > 0}
            <span class="relectures">{$t('v2.cd.rip.rereads' as any).replace('{n}', String(p.lectures_supplementaires))}</span>
          {/if}
        </li>
      {/each}
    </ol>
    {#if suivi.statut !== 'en_cours'}
      {#if expert && suivi.pistes.some((p) => p.accuraterip_v1 || p.accuraterip_v2)}
        <div class="note">{$t('v2.cd.rip.accurateRip' as any)}</div>
      {/if}
      {#if suivi.pistes.some((p) => p.statut === 'terminee')}
        <div class="fin">
          <span class="note dossier">{$t('v2.cd.rip.folder' as any).replace('{dossier}', suivi.dossier)}</span>
          {#if scanPasse}
            <button class="go ouvrir-album" disabled={travail} onclick={ouvrirAlbum}>{$t('v2.cd.rip.openAlbum' as any)}</button>
          {:else}
            <span class="note attente-scan">{$t('v2.cd.rip.scanWaiting' as any)}</span>
          {/if}
        </div>
        {#if albumIntrouvable}<div class="note introuvable">{$t('v2.cd.rip.albumNotFound' as any)}</div>{/if}
      {/if}
    {/if}
  </div>
{/if}

{#if feuille && reglages}
  <div class="fond tune-v2" role="presentation" use:portail onclick={() => { if (!travail) feuille = false; }}>
    <div class="panneau feuille-extraction" role="dialog" aria-modal="true" aria-label={$t('v2.cd.rip.sheetTitle' as any)}
      onclick={(e) => e.stopPropagation()}>
      <h2>{$t('v2.cd.rip.sheetTitle' as any)}</h2>
      <button class="fermer" aria-label={$t('common.close' as any)} disabled={travail} onclick={() => (feuille = false)}>×</button>
      <form onsubmit={lancer}>
        <fieldset class="ligne">
          <legend>{$t('v2.cd.rip.format' as any)}</legend>
          {#each reglages.formats as f (f)}
            <label class="choix"><input type="radio" name="format" value={f} bind:group={format} />
              {$t((f === 'wav' ? 'v2.cd.rip.formatWav' : 'v2.cd.rip.formatFlac') as any)}</label>
          {/each}
        </fieldset>

        <label>
          <span>{$t('v2.cd.rip.destination' as any)}</span>
          <select class="destination" bind:value={destination}>
            {#each reglages.emplacements as d (d)}<option value={d}>{d}</option>{/each}
          </select>
          <small>{$t('v2.cd.rip.destinationHint' as any)}</small>
        </label>

        <div class="duo">
          <label><span>{$t('v2.cd.rip.artist' as any)}</span>
            <input class="artiste" maxlength="200" bind:value={artiste} placeholder={$t('v2.cd.rip.unknownArtist' as any)} /></label>
          <label><span>{$t('v2.cd.rip.album' as any)}</span>
            <input class="album" maxlength="200" bind:value={album} placeholder={$t('v2.cd.unknownAlbum' as any)} /></label>
        </div>
        <small class="source">{$t((disque.metadonnees === 'musicbrainz' ? 'v2.cd.rip.fromMusicBrainz' : 'v2.cd.rip.noMetadata') as any)}</small>

        <fieldset>
          <legend>{$t('v2.cd.rip.tracks' as any)}
            <button type="button" class="lnk tout" onclick={() => (choisies = disque.pistes.map((p) => p.numero))}>{$t('v2.cd.rip.all' as any)}</button>
            <button type="button" class="lnk rien" onclick={() => (choisies = [])}>{$t('v2.cd.rip.none' as any)}</button>
          </legend>
          <ol class="choix-pistes">
            {#each disque.pistes as p (p.numero)}
              <li>
                <input type="checkbox" class="coche" aria-label={pisteN.replace('{n}', String(p.numero))}
                  checked={choisies.includes(p.numero)} onchange={() => basculer(p.numero)} />
                <span class="num">{p.numero}</span>
                <input class="titre-piste" maxlength="200" bind:value={titres[p.numero]} disabled={!choisies.includes(p.numero)} />
              </li>
            {/each}
          </ol>
        </fieldset>

        <label>
          <span>{$t('v2.cd.rip.verification' as any)}</span>
          <select class="verification" bind:value={verification}>
            <option value="doute">{$t('v2.cd.rip.verifDoute' as any)}</option>
            <option value="toujours">{$t('v2.cd.rip.verifToujours' as any)}</option>
          </select>
        </label>

        <label class="choix"><input type="checkbox" class="ecraser" bind:checked={ecraser} /> {$t('v2.cd.rip.overwrite' as any)}</label>

        {#if erreurFeuille}<div class="err" role="alert">{erreurFeuille}</div>{/if}

        <div class="pied">
          <button type="button" class="sec" disabled={travail} onclick={() => (feuille = false)}>{$t('common.cancel' as any)}</button>
          <button type="submit" class="pri lancer" disabled={travail || !choisies.length || !destination}>
            {travail ? '…' : $t('v2.cd.rip.start' as any)}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if albumOuvert}
  <AlbumDetailV2 album={albumOuvert} onClose={fermerAlbum} />
{/if}

<style>
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .extraire{background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line2)}
  .sec,.pri{height:32px; padding:0 16px; border-radius:var(--v2-r-pill); cursor:pointer; font:600 12.5px var(--v2-sans)}
  .sec{border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt)}
  .pri{border:0; color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sec:disabled,.pri:disabled{opacity:.35; cursor:not-allowed}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:12px}
  .note{font-size:11.5px; color:var(--v2-txt3)}
  .err{padding:8px 12px; border-radius:10px; font-size:12.5px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .avert{padding:8px 12px; border-radius:10px; font-size:12.5px; border:1px solid var(--v2-line2); background:var(--v2-surface2)}

  .suivi{flex-basis:100%; display:flex; flex-direction:column; gap:8px; margin-top:6px; padding:12px 14px;
    border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface2)}
  .tete{display:flex; align-items:center; gap:10px}
  .global{font:11.5px var(--v2-mono); color:var(--v2-txt2)}
  .tete .annuler,.tete .fermer-suivi{margin-left:auto}
  .barre{height:4px; border-radius:2px; background:var(--v2-line); overflow:hidden}
  .barre span{display:block; height:100%; background:var(--v2-acc1)}
  .pistes-suivi{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
  .piste-suivi{display:flex; flex-wrap:wrap; gap:4px 10px; align-items:baseline; font-size:12px; padding:3px 0}
  .piste-suivi.courante{font-weight:600}
  .piste-suivi .num{font:11px var(--v2-mono); color:var(--v2-txt3); width:20px; text-align:right}
  .piste-suivi .titre{flex:1; min-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .piste-suivi .etat,.piste-suivi .pc{color:var(--v2-txt2); font-size:11.5px}
  .piste-suivi .pc{font-family:var(--v2-mono)}
  .illisibles{color:var(--v2-danger); font-size:11.5px; flex-basis:100%; padding-left:30px}
  .crc,.relectures{font:10.5px var(--v2-mono); color:var(--v2-txt3); flex-basis:100%; padding-left:30px}
  .fin{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .dossier{overflow-wrap:anywhere}

  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center; background:rgba(0,0,0,.55); padding:16px}
  .panneau{position:relative; width:min(560px,100%); max-height:calc(100vh - 32px); overflow-y:auto; background:var(--v2-surface);
    color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); padding:20px 22px 22px; font-family:var(--v2-sans)}
  h2{font-size:17px; font-weight:700; margin-bottom:14px}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px; background:transparent;
    color:var(--v2-txt3); font-size:20px; line-height:1; cursor:pointer}
  form{display:flex; flex-direction:column; gap:12px}
  fieldset{border:0; padding:0; margin:0; display:flex; flex-direction:column; gap:6px}
  fieldset.ligne{flex-direction:row; flex-wrap:wrap; gap:6px 16px}
  legend,label > span{display:flex; gap:10px; align-items:center; margin-bottom:5px; font:600 11px var(--v2-mono);
    letter-spacing:.06em; text-transform:uppercase; color:var(--v2-txt3)}
  fieldset.ligne legend{flex-basis:100%}
  label{display:block}
  label.choix{display:flex; gap:8px; align-items:center; font-size:13px}
  small{display:block; margin-top:4px; font-size:11.5px; color:var(--v2-txt3)}
  input:not([type=radio]):not([type=checkbox]),select{width:100%; height:32px; padding:0 10px; border-radius:8px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans)}
  .duo{display:grid; grid-template-columns:1fr 1fr; gap:10px}
  @media (max-width:520px){ .duo{grid-template-columns:1fr} }
  .choix-pistes{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; max-height:240px; overflow-y:auto}
  .choix-pistes li{display:grid; grid-template-columns:20px 22px minmax(0,1fr); gap:8px; align-items:center}
  .choix-pistes .num{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .titre-piste:disabled{opacity:.45}
  .pied{display:flex; justify-content:flex-end; gap:10px; margin-top:4px}
</style>
