<script lang="ts">
  import { t } from '../../lib/i18n';
  /**
   * Extensions → Lecture CD — renesenses/tune-server-rust#4863.
   *
   * Lire le CD inséré dans le lecteur de la machine qui fait tourner Tune,
   * sans l'extraire. L'écran ne fait que TROIS appels au greffon `cd`
   * (`lib/lectureCd.ts`) ; une fois la lecture lancée, tout le reste — pause,
   * suivant, file, barre de lecture — est celui de la zone, comme pour
   * n'importe quelle source.
   *
   * Il n'existe que si le greffon tourne (`cdCharge`) : sans lui, ses routes ne
   * sont pas montées et l'écran le dit au lieu d'interroger dans le vide.
   *
   * Insertion et éjection : le greffon ne publie rien sur le bus. On relit donc
   * `/etat` toutes les {@link RELECTURE_CD_MS} ms TANT QUE L'ÉCRAN EST MONTÉ,
   * jamais onglet masqué, un appel à la fois, et en ralentissant jusqu'à
   * {@link RELECTURE_CD_MAX_MS} ms si le serveur ne répond plus. Le disque
   * (`/disque`, qui peut consulter MusicBrainz) n'est relu que lorsque la
   * présence CHANGE.
   */
  import { onDestroy } from 'svelte';
  import * as api from '../../lib/api';
  import { currentZoneId, currentZone, syncZone } from '../../lib/stores/zones';
  import {
    cdCharge, cdPlugin, refreshCdPlugin, getEtatLecteurCd, getDisqueCd, jouerCd,
    dureeCd, titrePisteCd, codeRefusCd, delaiRelectureCd,
    type EtatLecteurCd, type DisqueCd,
  } from '../../lib/lectureCd';
  import '../../styles/tune-v2.css';

  let etat = $state<EtatLecteurCd | null>(null);
  let disque = $state<DisqueCd | null>(null);
  let erreur = $state<string | null>(null);
  let erreurLecture = $state<string | null>(null);
  let occupe = $state<number | 'disque' | null>(null);

  let echecs = 0;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let fini = false;
  let enCours = false;
  let presenceVue: string | null = null;

  /** Une phrase pour un refus du greffon, jamais le code brut. */
  function phrase(e: unknown): string {
    const code = codeRefusCd(e);
    if (code === 'aucun_lecteur') return $t('v2.cd.noDrive' as any);
    if (code === 'aucun_disque') return $t('v2.cd.noDisc' as any);
    if (code === 'lecture_toc') return $t('v2.cd.unreadable' as any);
    if (code === 'piste_inconnue') return $t('v2.cd.unknownTrack' as any);
    if (code === 'lecture') return $t('v2.cd.playFailed' as any);
    return $t('v2.cd.unavailable' as any);
  }

  /** `false` si le disque n'a pas pu être lu : la relecture ralentit alors. */
  async function lireDisque(): Promise<boolean> {
    try {
      disque = await getDisqueCd();
      erreur = null;
      return true;
    } catch (e) {
      disque = null;
      // Éjecté entre les deux appels : la prochaine relecture le dira.
      if (codeRefusCd(e) !== 'aucun_disque') erreur = phrase(e);
      return false;
    }
  }

  async function relire() {
    if (fini || enCours) return;
    if (typeof document !== 'undefined' && document.hidden) { planifier(); return; }
    enCours = true;
    try {
      const e = await getEtatLecteurCd();
      if (fini) return;
      etat = e;
      echecs = 0;
      // Relu quand la présence CHANGE, ou tant qu'un disque présent n'a pas pu
      // être lu (avec le même ralentissement qu'une panne).
      if (e.presence !== presenceVue || (e.presence === 'disque' && !disque)) {
        presenceVue = e.presence;
        if (e.presence === 'disque') { if (!(await lireDisque())) echecs++; }
        else { disque = null; erreur = null; }
      }
    } catch (e) {
      echecs++;
      if (!fini) erreur = phrase(e);
    } finally {
      enCours = false;
      planifier();
    }
  }

  function planifier() {
    if (fini) return;
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(relire, delaiRelectureCd(echecs));
  }

  // Le greffon d'abord : on n'interroge ses routes que s'il tourne.
  $effect(() => { void refreshCdPlugin(); });
  let demarre = false;
  $effect(() => {
    if ($cdCharge && !demarre) { demarre = true; void relire(); }
  });
  onDestroy(() => { fini = true; if (minuteur) clearTimeout(minuteur); });

  async function jouer(piste?: number) {
    const zid = $currentZoneId;
    if (zid == null || occupe !== null) return;
    occupe = piste ?? 'disque';
    erreurLecture = null;
    try {
      await jouerCd(zid, piste);
      // La barre de lecture suit la zone : on lui donne l'état tout de suite.
      try { syncZone(await api.getZone(zid)); } catch { /* le flux temps réel suivra */ }
    } catch (e) {
      erreurLecture = phrase(e);
    }
    occupe = null;
  }

  const pisteN = $derived($t('v2.cd.trackN' as any));
</script>

<section class="v2-cd tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.nav.plugins' as any)}</div>
      <h1>{$t('v2.cd.title' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    {#if $cdPlugin === null}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !$cdCharge}
      <div class="state absent">{$t('v2.cd.notInstalled' as any)}</div>
    {:else if !etat && erreur}
      <div class="err" role="alert">{erreur}</div>
    {:else if !etat}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !etat.plateforme_prise_en_charge}
      <div class="state plateforme">{$t('v2.cd.unsupportedPlatform' as any)}</div>
    {:else if etat.presence === 'aucun_lecteur'}
      <div class="state lecteur-absent">{$t('v2.cd.noDrive' as any)}</div>
    {:else if etat.presence === 'vide'}
      <div class="state vide">{$t('v2.cd.noDisc' as any)}</div>
    {:else if erreur}
      <div class="err" role="alert">{erreur}</div>
    {:else if !disque}
      <div class="state">{$t('v2.cd.reading' as any)}</div>
    {:else}
      <div class="disque">
        {#if disque.pochette}
          <img class="pochette" src={disque.pochette} alt={disque.titre ?? ''} />
        {:else}
          <div class="pochette vide-pochette" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>
          </div>
        {/if}
        <div class="infos">
          <h2 class="album">{disque.titre || $t('v2.cd.unknownAlbum' as any)}</h2>
          {#if disque.artiste}<div class="artiste">{disque.artiste}</div>{/if}
          {#if disque.metadonnees === 'repli'}<div class="note">{$t('v2.cd.noMetadata' as any)}</div>{/if}
          <div class="actions">
            <button class="go lire-disque" disabled={$currentZoneId == null || occupe !== null} onclick={() => jouer()}>
              {occupe === 'disque' ? '…' : $t('v2.cd.playDisc' as any)}
            </button>
            {#if $currentZoneId == null}
              <span class="note">{$t('v2.art.noZone' as any)}</span>
            {:else if $currentZone?.name}
              <span class="note">{$t('v2.cd.toZone' as any).replace('{zone}', $currentZone.name)}</span>
            {/if}
          </div>
        </div>
      </div>

      {#if erreurLecture}<div class="err" role="alert">{erreurLecture}</div>{/if}

      <ol class="pistes">
        {#each disque.pistes as p (p.numero)}
          <li class="piste">
            <span class="num">{p.numero}</span>
            <span class="titre">
              {titrePisteCd(p, disque, pisteN)}
              {#if p.artiste && p.artiste !== disque.artiste}<small>{p.artiste}</small>{/if}
            </span>
            <span class="duree">{dureeCd(p.duree_ms)}</span>
            <button class="lnk lire-piste" disabled={$currentZoneId == null || occupe !== null}
              aria-label={$t('v2.cd.playTrack' as any)} title={$t('v2.cd.playTrack' as any)}
              onclick={() => jouer(p.numero)}>
              {occupe === p.numero ? '…' : '▶'}
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>

<style>
  .v2-cd{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; display:flex; flex-direction:column; gap:14px; max-width:880px}
  .state{color:var(--v2-txt3); font-size:13px}
  .absent,.plateforme,.lecteur-absent,.vide{padding:14px 16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2); color:var(--v2-txt2)}
  .err{padding:10px 14px; border-radius:10px; font-size:12.5px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .disque{display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap}
  .pochette{width:160px; height:160px; border-radius:12px; object-fit:cover; background:var(--v2-surface2); flex:none}
  .vide-pochette{display:flex; align-items:center; justify-content:center; color:var(--v2-txt3)}
  .vide-pochette svg{width:64px; height:64px}
  .infos{display:flex; flex-direction:column; gap:6px; min-width:0; flex:1}
  .album{font-size:20px; font-weight:700}
  .artiste{font-size:14px; color:var(--v2-txt2)}
  .note{font-size:11.5px; color:var(--v2-txt3)}
  .actions{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:8px}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .pistes{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .piste{display:grid; grid-template-columns:32px minmax(0,1fr) auto 36px; align-items:center; gap:10px;
    padding:8px 6px; border-bottom:1px solid var(--v2-line); font-size:13px}
  .num{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .titre{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .titre small{margin-left:8px; color:var(--v2-txt3)}
  .duree{font:11.5px var(--v2-mono); color:var(--v2-txt2)}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px}
  .lnk:disabled{opacity:.35; cursor:not-allowed}
</style>
