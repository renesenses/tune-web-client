<script lang="ts">
  /**
   * rc14 (Didier) — le test de niveau du micro, AVANT la mesure
   * (tune-server-rust#9529, `plugins/tune-calibration/src/niveau.rs`) :
   *
   *  - « Écouter le micro » : l'entrée et la voie choisies, sans rien jouer ;
   *    le vumètre bouge quand on parle (bonne entrée ? bonne voie ?). Le
   *    serveur l'arrête seul en 30 s au plus.
   *  - « Tester le niveau » : une seconde de bruit de fond, un bruit rose
   *    court sur la zone au volume de mesure, puis le verdict (trop faible,
   *    bon, trop fort) avec les valeurs et la plage conseillée.
   *
   * Le vumètre suit par interrogation (`SUIVI_NIVEAU`), comme l'avancement
   * d'une mesure. Le verdict est annoncé (`role="status"`).
   */
  import { onDestroy } from 'svelte';
  import { locale, t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import {
    SUIVI_NIVEAU, ECHECS_SUIVI_NIVEAU, ETATS_FINAUX_NIVEAU, UNITE_DBFS, LIBELLES_ETATS_NIVEAU, PLANCHER_VUMETRE_DBFS,
    lancerTestNiveau, lireTestNiveau, arreterTestNiveau, dbfs, fractionVumetre, texteVerdict, valeursVerdict, causeMesure,
    CIBLE_DBC, consigneNiveauC,
    type AvancementNiveau, type ModeNiveau, type ConsigneNiveauC,
  } from '../../lib/correctionPiece';

  type Erreur = { cle: string; cause: string | null; code: string | null };

  let {
    zoneId, zoneNom, entree, voie, etalonnage = null, gainReference = null, volumeMesure = 40, verrouille, occupe, erreurDe, onOccupe,
  }: {
    zoneId: number | null;
    zoneNom: string;
    /** L'identifiant (ou le nom) de l'entrée choisie ; `null` sans micro. */
    entree: string | null;
    voie: number;
    /** L'étalonnage choisi : le serveur plafonne alors la pression au micro. */
    etalonnage?: string | null;
    gainReference?: number | null;
    volumeMesure?: number;
    verrouille: boolean;
    /** Une mesure est en cours : le test attend. */
    occupe: boolean;
    erreurDe: (cle: string, e: unknown) => Erreur | null;
    onOccupe?: (o: boolean) => void;
  } = $props();

  let test = $state<AvancementNiveau | null>(null);
  let erreur = $state<Erreur | null>(null);
  let alerteAsio = $state(false);
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  const enCours = $derived(test != null && !ETATS_FINAUX_NIVEAU.has(test.etat));
  const vumetre = $derived(test?.vumetre ?? null);
  const verdict = $derived(test?.etat === 'terminee' ? test.verdict : null);
  const cause = $derived(test?.etat === 'erreur' ? causeMesure(test, (k) => $t(k as any)) : null);
  const mesureC = $derived(etalonnage && gainReference !== null && !verdict?.coupe
    && typeof verdict?.niveau_dbc === 'number' && Number.isFinite(verdict.niveau_dbc)
    ? verdict.niveau_dbc : null);
  const ecartC = $derived(mesureC === null ? 0 : Math.round((mesureC - CIBLE_DBC) * 10) / 10);
  /* rc14, version prudente (26/11) — l'estimation prudente borne la hausse. */
  const prudente = $derived(mesureC !== null && typeof verdict?.estimation_prudente_db === 'number'
    && Number.isFinite(verdict.estimation_prudente_db) ? verdict.estimation_prudente_db : null);
  const consigne = $derived(mesureC === null ? null : consigneNiveauC(mesureC, prudente));
  const nonVerifiee = $derived(verdict?.raison_prudence === 'conversion_non_verifiee');
  const CLES_CONSIGNE: Record<ConsigneNiveauC, string> = {
    cible: 'v2.room.lvlAtTarget', monter: 'v2.room.lvlRaise', baisser: 'v2.room.lvlLower',
    eleve: 'v2.room.lvlHigh', pas_de_hausse: 'v2.room.lvlNoRaise',
  };
  const formatDb = $derived(new Intl.NumberFormat($locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const tr = (k: string) => $t(k as any);

  $effect(() => { onOccupe?.(enCours); });

  function arreterSuivi() {
    if (minuterie) clearTimeout(minuterie);
    minuterie = null;
  }
  let demonte = false;
  /*
   * Relecture m-w2 — une lecture ratée (réseau) ne conclut pas : le serveur
   * joue peut-être encore. On relit ; après ECHECS_SUIVI_NIVEAU échecs
   * d'affilée, on ARRÊTE réellement le test (DELETE) avant de dire l'erreur.
   */
  function suivre(id: string, echecs = 0) {
    arreterSuivi();
    if (demonte) return;
    minuterie = setTimeout(async () => {
      minuterie = null;
      try {
        const a = await lireTestNiveau(id);
        if (demonte) return;
        test = a;
        alerteAsio = alerteAsio || a.alerte_asio === true;
        if (!ETATS_FINAUX_NIVEAU.has(a.etat)) suivre(id);
      } catch (e) {
        if (demonte) return;
        if (echecs + 1 < ECHECS_SUIVI_NIVEAU) { suivre(id, echecs + 1); return; }
        void arreterTestNiveau(id).catch(() => {});
        erreur = erreurDe('v2.room.errLevelTest', e);
        test = test ? { ...test, etat: 'erreur' } : null;
      }
    }, SUIVI_NIVEAU.intervalleMs);
  }

  async function lancer(mode: ModeNiveau) {
    if (!entree || verrouille || occupe || enCours) return;
    if (mode === 'signal') {
      if (zoneId == null) return;
      const question = $t('v2.room.lvlConfirm' as any).replace('{zone}', zoneNom);
      if (!(await dialogs.confirm(question))) return;
    }
    erreur = null;
    alerteAsio = false;
    try {
      const r = await lancerTestNiveau({ mode, entree, voie_micro: voie, zone_id: zoneId, etalonnage: etalonnage || null, gain_relatif_db: gainReference, volume: volumeMesure });
      alerteAsio = r?.alerte_asio === true;
      test = {
        id: r.id, mode, zone_id: zoneId, entree, etat: 'preparation', depuis_s: 0, duree_prevue_s: 0,
        vumetre: null, bruit: null, verdict: null, avertissements: [],
      };
      suivre(r.id);
    } catch (e) {
      const x = erreurDe('v2.room.errLevelTest', e);
      // Relecture m3 — la zone joue : le message, dans la langue de l'écran.
      erreur = x && x.code === 'zone_en_lecture' ? { cle: 'v2.room.lvlZonePlaying', cause: null, code: x.code } : x;
    }
  }

  async function arreter() {
    if (!test || !enCours) return;
    const id = test.id;
    try {
      await arreterTestNiveau(id);
    } catch (e) {
      erreur = erreurDe('v2.room.errLevelTest', e);
    }
  }

  onDestroy(() => {
    demonte = true;
    arreterSuivi();
    // L'écran quitté pendant un test : l'entrée et la zone sont rendues.
    if (test && !ETATS_FINAUX_NIVEAU.has(test.etat)) void arreterTestNiveau(test.id).catch(() => {});
  });
</script>

<div class="niveau" data-room="niveau">
  <div class="titre">{$t('v2.room.lvlTitle' as any)}</div>
  <p class="hint">{$t('v2.room.lvlIntro' as any)}</p>
  <p class="hint">{$t('v2.room.lvlTarget' as any)}</p>
  {#if !etalonnage || gainReference === null}
    <p class="hint" data-room="calibration-manquante">{$t('v2.room.lvlCalNeeded' as any)}</p>
  {/if}
  <div class="actions">
    <button class="v2-btn" data-room="tester-niveau" disabled={!entree || zoneId == null || verrouille || occupe || enCours}
      onclick={() => lancer('signal')}>{$t('v2.room.lvlTest' as any)}</button>
    <button class="v2-btn" data-room="ecouter-micro" disabled={!entree || verrouille || occupe || enCours}
      onclick={() => lancer('ecoute')}>{$t('v2.room.lvlListen' as any)}</button>
    {#if enCours}
      <button class="v2-btn danger" data-room="arreter-niveau" onclick={arreter}>{$t('v2.room.lvlStop' as any)}</button>
    {/if}
  </div>

  {#if alerteAsio}
    <div class="warn" data-room="alerte-asio">{$t('v2.room.lvlAsio' as any)}</div>
  {/if}

  {#if test}
    <div class="etat" data-room="etat-niveau" data-etat={test.etat}>{$t(LIBELLES_ETATS_NIVEAU[test.etat] as any)}</div>
    {#if vumetre}
      <div class="vumetre" data-room="vumetre" role="meter" aria-label={$t('v2.room.lvlTitle' as any)}
        aria-valuemin={PLANCHER_VUMETRE_DBFS} aria-valuemax="0" aria-valuenow={Math.max(PLANCHER_VUMETRE_DBFS, Math.round(vumetre.crete_dbfs))}
        aria-valuetext={$t('v2.room.lvlMeterText' as any).replace('{crete}', dbfs(vumetre.crete_dbfs)).replace('{rms}', dbfs(vumetre.rms_dbfs))}>
        <div class="piste">
          <div class="rms" style:width={`${fractionVumetre(vumetre.rms_dbfs) * 100}%`}></div>
          <div class="crete" style:width={`${fractionVumetre(vumetre.crete_dbfs) * 100}%`}></div>
          <div class="maxi" style:left={`${fractionVumetre(vumetre.crete_max_dbfs) * 100}%`}></div>
        </div>
        <div class="valeurs">
          <span>{$t('v2.room.lvlPeak' as any)} <b data-room="vumetre-crete">{dbfs(vumetre.crete_dbfs)}</b> {UNITE_DBFS}</span>
          <span>{$t('v2.room.lvlRms' as any)} <b data-room="vumetre-rms">{dbfs(vumetre.rms_dbfs)}</b> {UNITE_DBFS}</span>
        </div>
      </div>
    {/if}
  {/if}

  <div role="status" aria-live="polite" data-room="verdict-annonce">
    {#if verdict}
      <div class="verdict" data-room="verdict" data-jugement={verdict.jugement} data-motif={verdict.motif}>
        <b>{mesureC !== null && verdict.motif === 'rsb_faible' ? $t('v2.room.lvlLowSnr' as any) : texteVerdict(verdict, tr)}</b>
        {#if mesureC !== null}
          <span data-room="niveau-dbc">{$t('v2.room.lvlMeasured' as any).replace('{niveau}', formatDb.format(mesureC)).replace('{ecart}', (ecartC > 0 ? '+' : '') + formatDb.format(ecartC || 0))}</span>
          {#if consigne === 'eleve'}
            <span class="alerte" role="alert" data-room="niveau-eleve">{$t('v2.room.lvlHigh' as any)}</span>
          {:else if consigne && (verdict.jugement === 'bon' || verdict.jugement === 'faible')}
            <span data-room="consigne-volume" data-consigne={consigne}>{$t(CLES_CONSIGNE[consigne] as any)}</span>
          {/if}
        {:else if etalonnage && gainReference !== null}
          <span class="hint" data-room="niveau-indisponible">{$t('v2.room.lvlUnavailable' as any)}</span>
        {/if}
        {#if nonVerifiee}
          <span class="hint note" data-room="conversion-non-verifiee">{$t('v2.room.lvlUnverified' as any).replace('{prudente}', prudente === null ? '–' : formatDb.format(prudente))}</span>
        {/if}
        <span class="hint" data-room="verdict-valeurs">{valeursVerdict(verdict, tr)}</span>
      </div>
    {/if}
  </div>
  {#if cause || erreur}
    <div class="err" role="alert" data-room="erreur-niveau" data-room-erreur={erreur?.code ?? test?.code ?? ''}>
      <b>{$t((erreur?.cle ?? 'v2.room.errLevelTest') as any)}</b>
      {#if erreur?.cause ?? cause}<span>{erreur?.cause ?? cause}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .niveau{display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--v2-line); padding-top:10px}
  .titre{font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt)}
  .hint{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3); max-width:62ch; margin:0}
  .actions{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .etat{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .vumetre{display:flex; flex-direction:column; gap:4px; max-width:420px}
  .piste{position:relative; height:12px; border-radius:6px; background:var(--v2-bg); border:1px solid var(--v2-line2); overflow:hidden}
  .piste .crete{position:absolute; inset:0 auto 0 0; background:var(--v2-acc-soft)}
  .piste .rms{position:absolute; inset:0 auto 0 0; background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2)); z-index:1}
  .piste .maxi{position:absolute; top:0; bottom:0; width:2px; background:var(--v2-txt); z-index:2}
  .valeurs{display:flex; gap:16px; font:calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .verdict{display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-line2);
    font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5}
  .verdict[data-jugement="bon"]{border-color:var(--v2-acc1)}
  .verdict[data-jugement="faible"]{border-color:var(--v2-acc2)}
  .verdict[data-jugement="trop_fort"], .verdict[data-jugement="trop_faible"]{border-color:var(--v2-danger-bd)}
  .warn{padding:9px 12px; border-radius:10px; font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.5;
    color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .err{padding:9px 12px; border-radius:10px; font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.5;
    display:flex; flex-direction:column; gap:4px; color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .alerte{color:var(--v2-danger); font-weight:600}
  .note{font-style:italic}
</style>
