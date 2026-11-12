<script lang="ts">
  /**
   * web#2706 — « Correction de pièce » (Premium), ouvert depuis le menu de
   * zone. Il parle au greffon serveur `calibration` (voir
   * `lib/correctionPiece.ts` pour les routes) :
   *
   *  1. Sans micro : dimensions et nature des six surfaces → modes de basse
   *     simulés → correction proposée → « Appliquer à l'égaliseur de la zone ».
   *  2. Au micro : micro et étalonnage → mesure suivie (annulable) → réponse
   *     et temps de réverbération → correction proposée → « Appliquer ».
   *  3. L'import d'un filtre FIR reste dans Réglages › Appareils : un lien.
   *
   * « Appliquer » = enregistrer le profil de pièce de la zone, PUIS
   * `POST /room-correction/profiles/{zone}/apply`, qui écrit l'égaliseur.
   */
  import { onDestroy } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { currentZone } from '../../lib/stores/zones';
  import { licenseState, isPremium } from '../../lib/stores/license';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import {
    zoneCorrectionPiece, presenceCalibration, ID_GREFFON_CALIBRATION, presenceEgaliseur, egaliseurManque, ID_GREFFON_EGALISEUR,
    SUIVI,
    PIECE_DEFAUT, SURFACES_DEFAUT, SURFACES, QUALITES, LIBELLES_SURFACES, LIBELLES_QUALITES, LIBELLES_TYPES_MODE,
    LIBELLES_ETATS, ETATS_FINAUX, BORNES_PIECE,
    coteHorsBornes, entreeSimulation, modesAffiches, modeFort, positionDuMode, LIBELLES_POSITIONS_MODE, micros,
    placementType, positionHorsPiece, enceinteAjoutee, expertParDefaut, expertBorne, COUPE_MIN_DB,
    ENCEINTES_MIN, ENCEINTES_MAX, AXES, COTE_DE_L_AXE, avertissementFrequenceMicro, mesureEnCours, rt60De, lireErreur,
    simuler, proposerSimulation, enregistrerProfilSimulation, appliquerProfilZone,
    lireMicrophones, deposerEtalonnage, lancerMesure, lireMesures, lireAvancement, annulerMesure,
    lireResultat, proposerMesure, enregistrerProfilMesure,
    type PresenceCalibration, type PresenceEgaliseur, type Piece, type Surfaces, type Simulation, type Proposition, type TypeCible,
    type Microphones, type Avancement, type ResultatMesure, type ProfilEnregistre,
    type Placement, type Position, type ReglageExpert,
  } from '../../lib/correctionPiece';
  import CourbeCorrectionPiece from './CourbeCorrectionPiece.svelte';
  import PropositionCorrectionPiece from './PropositionCorrectionPiece.svelte';
  import '../../styles/tune-v2.css';

  const zone = $derived(
    $zoneCorrectionPiece
      ?? ($currentZone?.id != null ? { id: $currentZone.id, name: $currentZone.name } : null),
  );
  const zoneId = $derived(zone?.id ?? null);

  let presence = $state<PresenceCalibration>('inconnu');
  let installation = $state(false);
  /** web#2719 : sans le greffon `equalizer` actif, « Appliquer » ne s'entend pas. */
  let egaliseur = $state<PresenceEgaliseur>('inconnu');
  let installationEq = $state(false);
  const sansEgaliseur = $derived(egaliseurManque(egaliseur));
  /** Un 402 reçu : le serveur a tranché, quoi que dise la licence lue. */
  let refusPremium = $state(false);
  const sansPremium = $derived(refusPremium || ($licenseState.loaded && !$isPremium));
  /** `inconnu` (liste des greffons illisible) ne verrouille pas : la route répondra. */
  const greffonPret = $derived(presence === 'actif' || presence === 'inconnu');
  const verrouille = $derived(sansPremium || !greffonPret || zoneId == null);

  let onglet = $state<'simulation' | 'micro'>('simulation');

  /** Une erreur affichée : ce qui a échoué, et POURQUOI (le texte du greffon). */
  type Erreur = { cle: string; cause: string | null; code: string | null };
  function erreurDe(cle: string, e: unknown): Erreur | null {
    const x = lireErreur(e);
    if (x.premium) { refusPremium = true; return null; }
    if (x.status === 404 && (x.code === 'not found' || x.code === 'not_found')) presence = 'a_redemarrer';
    return { cle, cause: x.cause, code: x.code };
  }

  $effect(() => {
    api.getInstalledPlugins()
      .then((liste) => { presence = presenceCalibration(liste); egaliseur = presenceEgaliseur(liste); })
      .catch(() => { presence = 'inconnu'; egaliseur = 'inconnu'; });
  });

  async function installer() {
    if (installation) return;
    installation = true;
    const ko = $t('v2.room.installFailed' as any);
    try {
      const r = await api.installPlugin(ID_GREFFON_CALIBRATION);
      presence = r?.restart_required === false ? 'actif' : 'a_redemarrer';
    } catch {
      notifications.error(ko);
    } finally {
      installation = false;
    }
  }

  async function installerEgaliseur() {
    if (installationEq) return;
    installationEq = true;
    const ko = $t('v2.room.installFailed' as any);
    try {
      const r = await api.installPlugin(ID_GREFFON_EGALISEUR);
      egaliseur = r?.restart_required === false ? 'actif' : 'a_redemarrer';
    } catch {
      notifications.error(ko);
    } finally {
      installationEq = false;
    }
  }

  function ouvrirFir() {
    v2SettingsTarget.set({ tab: 'devices', section: 'perZone', zone: zoneId ?? undefined, bloc: 'fir' });
    activeView.set('settings');
  }

  // ─── Application (commune aux deux parties) ────────────────────────────
  let application = $state<'repos' | 'en_cours' | 'faite'>('repos');
  let appliquee = $state<{ filtres: number; live: boolean | undefined } | null>(null);

  async function appliquer(enregistrer: () => Promise<ProfilEnregistre>, poserErreur: (e: Erreur | null) => void) {
    const zid = zoneId;
    if (zid == null || verrouille) return;
    const question = $t((sansEgaliseur ? 'v2.room.eqApplyConfirm' : 'v2.room.applyConfirm') as any).replace('{zone}', zone?.name ?? '');
    if (!(await dialogs.confirm(question))) return;
    application = 'en_cours';
    poserErreur(null);
    const cleKo = 'v2.room.errApply';
    try {
      const profil = await enregistrer();
      const r = await appliquerProfilZone(profil.zone_id ?? zid);
      if (r?.applied === false) {
        poserErreur({ cle: cleKo, cause: r.reason ?? null, code: null });
        application = 'repos';
        return;
      }
      appliquee = { filtres: r?.filter_count ?? 0, live: r?.applied_live };
      application = 'faite';
    } catch (e) {
      poserErreur(erreurDe(cleKo, e));
      application = 'repos';
    }
  }

  // ─── 1. Sans micro ──────────────────────────────────────────────────────
  let piece = $state<Piece>({ ...PIECE_DEFAUT });
  let surfaces = $state<Surfaces>({ ...SURFACES_DEFAUT });
  let simulation = $state<Simulation | null>(null);
  let propSim = $state<Proposition | null>(null);
  let cibleSim = $state<TypeCible>('plate');
  let calculSim = $state(false);
  let erreurSim = $state<Erreur | null>(null);
  const horsBornes = $derived(coteHorsBornes(piece));
  const DIMS: [keyof Piece, string, { min: number; max: number }][] = [
    ['longueur_m', 'v2.room.length', BORNES_PIECE.cote],
    ['largeur_m', 'v2.room.width', BORNES_PIECE.cote],
    ['hauteur_m', 'v2.room.height', BORNES_PIECE.hauteur],
  ];

  /*
   * web#2803 (Tades, fil 2725 ; serveur tune-server-rust#8332) — les positions
   * de l'auditeur et des enceintes. Tant qu'on n'en a touché aucune, elles
   * SUIVENT les dimensions (disposition type) ; dès la première saisie, elles
   * sont figées telles quelles, jusqu'à « Rétablir la disposition type ».
   */
  let placementSaisi = $state<Placement | null>(null);
  const placement = $derived<Placement>(placementSaisi ?? placementType(piece));
  const posHors = $derived(positionHorsPiece(placement, piece));
  /** Le nombre d'enceintes de la simulation affichée (le couplage va de −N à +N). */
  let enceintesSimulees = $state(2);

  function copiePlacement(): Placement {
    return { auditeur: { ...placement.auditeur }, enceintes: placement.enceintes.map((e) => ({ ...e })) };
  }
  function reglerPosition(qui: number, axe: keyof Position, e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    const pl = copiePlacement();
    if (qui < 0) pl.auditeur[axe] = v; else pl.enceintes[qui][axe] = v;
    placementSaisi = pl;
  }
  function ajouterEnceinte() {
    if (placement.enceintes.length >= ENCEINTES_MAX) return;
    const pl = copiePlacement();
    pl.enceintes.push(enceinteAjoutee(piece, pl.enceintes));
    placementSaisi = pl;
  }
  function retirerEnceinte(i: number) {
    if (placement.enceintes.length <= ENCEINTES_MIN) return;
    const pl = copiePlacement();
    pl.enceintes.splice(i, 1);
    placementSaisi = pl;
  }

  /** Le schéma vu de dessus : largeur en abscisse, longueur (depuis le mur avant) en ordonnée. */
  const SCHEMA = 160;
  const schema = $derived.by(() => {
    const L = Math.max(0.1, Number(piece.longueur_m) || 0.1);
    const l = Math.max(0.1, Number(piece.largeur_m) || 0.1);
    const k = SCHEMA / Math.max(L, l);
    return { w: l * k, h: L * k, px: (y: number) => y * k, py: (x: number) => x * k };
  });

  /*
   * Le mode expert (#8332) : bornes relevées jusqu'à celles d'une mesure, lues
   * dans la simulation (`bornes_correction.expert`). Un serveur qui ne les
   * publie pas ne le propose pas.
   */
  let expertActif = $state(false);
  let reglageExpert = $state<ReglageExpert | null>(null);
  const bornesExpert = $derived(simulation?.bornes_correction?.expert ?? null);
  const expertEnvoye = $derived(expertActif && bornesExpert && reglageExpert ? expertBorne(reglageExpert, bornesExpert) : null);

  function basculerExpert(e: Event) {
    expertActif = (e.currentTarget as HTMLInputElement).checked;
    if (expertActif && bornesExpert && !reglageExpert) reglageExpert = expertParDefaut(bornesExpert);
    application = 'repos';
    appliquee = null;
    void proposerSim();
  }
  function reglerExpert(cle: keyof ReglageExpert, e: Event) {
    if (!bornesExpert) return;
    const base = reglageExpert ?? expertParDefaut(bornesExpert);
    reglageExpert = expertBorne({ ...base, [cle]: Number((e.currentTarget as HTMLInputElement).value) }, bornesExpert);
    application = 'repos';
    appliquee = null;
    void proposerSim();
  }

  async function lancerSimulation() {
    if (verrouille || calculSim) return;
    if (horsBornes || posHors) return;
    calculSim = true;
    erreurSim = null;
    simulation = null;
    propSim = null;
    application = 'repos';
    appliquee = null;
    try {
      const e = entreeSimulation(piece, surfaces, zoneId, placement);
      simulation = await simuler(e);
      enceintesSimulees = e.enceintes.length;
    } catch (e) {
      erreurSim = erreurDe('v2.room.errSimulation', e);
      calculSim = false;
      return;
    }
    await proposerSim();
    calculSim = false;
  }

  async function proposerSim() {
    if (!simulation) return;
    // Un refus précédent (422 en mode expert) ne doit pas survivre à la demande suivante.
    erreurSim = null;
    try {
      propSim = await proposerSimulation(simulation.id, cibleSim, expertEnvoye);
    } catch (e) {
      propSim = null;
      erreurSim = erreurDe('v2.room.errProposal', e);
    }
  }

  function changerCibleSim(c: TypeCible) {
    cibleSim = c;
    application = 'repos';
    appliquee = null;
    void proposerSim();
  }

  function appliquerSim() {
    const sim = simulation;
    const zid = zoneId;
    if (!sim || zid == null) return;
    const expert = expertEnvoye;
    void appliquer(() => enregistrerProfilSimulation(sim.id, cibleSim, zid, expert), (e) => { erreurSim = e; });
  }

  function regler(cle: keyof Piece, e: Event) {
    piece = { ...piece, [cle]: Number((e.currentTarget as HTMLInputElement).value) };
  }
  function qualite(s: (typeof SURFACES)[number], e: Event) {
    surfaces = { ...surfaces, [s]: (e.currentTarget as HTMLSelectElement).value as Surfaces[typeof s] };
  }

  const f0 = (v: number) => Math.round(v).toString();
  const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const f2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

  // ─── 2. Au micro ────────────────────────────────────────────────────────
  let microphones = $state<Microphones | null>(null);
  let lectureMicros = $state(false);
  let erreurMicros = $state<Erreur | null>(null);
  let entree = $state('');
  let voie = $state(0);
  let etalonnage = $state('');
  let mesure = $state<Avancement | null>(null);
  let resultat = $state<ResultatMesure | null>(null);
  let propMes = $state<Proposition | null>(null);
  let cibleMes = $state<TypeCible>('plate');
  let erreurMes = $state<Erreur | null>(null);
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  const listeMicros = $derived(micros(microphones));
  const micro = $derived(listeMicros.find((m) => m.id === entree || m.nom === entree) ?? null);
  const sansMicro = $derived(microphones != null && listeMicros.length === 0);
  const enCours = $derived(mesure != null && !ETATS_FINAUX.has(mesure.etat));

  async function chargerMicros() {
    lectureMicros = true;
    erreurMicros = null;
    try {
      microphones = await lireMicrophones();
      if (!entree && listeMicros.length) entree = listeMicros[0].id || listeMicros[0].nom;
    } catch (e) {
      microphones = null;
      erreurMicros = erreurDe('v2.room.errMicrophones', e);
    } finally {
      lectureMicros = false;
    }
  }

  $effect(() => {
    if (onglet !== 'micro' || !greffonPret || sansPremium) return;
    void chargerMicros();
    const zid = zoneId;
    if (zid == null) return;
    // L'écran rouvert pendant une mesure la retrouve et reprend le suivi.
    lireMesures()
      .then((r) => {
        const m = mesureEnCours(r?.mesures, zid);
        if (m && !mesure) { mesure = m; suivre(m.id); }
      })
      .catch(() => {});
  });

  async function deposer(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const fichier = input.files?.[0];
    if (!fichier) return;
    const nom = fichier.name.replace(/\.[^.]+$/, '');
    try {
      const texte = await fichier.text();
      const r = await deposerEtalonnage(nom, texte);
      await chargerMicros();
      etalonnage = r?.nom ?? nom;
    } catch (err) {
      erreurMicros = erreurDe('v2.room.errCalibrationFile', err);
    } finally {
      input.value = '';
    }
  }

  async function lancer() {
    const zid = zoneId;
    if (zid == null || verrouille || !micro || enCours) return;
    const question = $t('v2.room.measureConfirm' as any).replace('{zone}', zone?.name ?? '');
    if (!(await dialogs.confirm(question))) return;
    erreurMes = null;
    resultat = null;
    propMes = null;
    application = 'repos';
    appliquee = null;
    try {
      const r = await lancerMesure(zid, {
        entree: micro.id || micro.nom,
        voie_micro: voie,
        etalonnage: etalonnage || null,
      });
      mesure = { id: r.id, zone_id: zid, entree: micro.id, etat: 'preparation', progression: 0, avertissements: [] };
      suivre(r.id);
    } catch (e) {
      erreurMes = erreurDe('v2.room.errMeasure', e);
    }
  }

  function arreterSuivi() {
    if (minuterie) clearTimeout(minuterie);
    minuterie = null;
  }
  function suivre(id: string) {
    arreterSuivi();
    minuterie = setTimeout(async () => {
      minuterie = null;
      try {
        const a = await lireAvancement(id);
        mesure = a;
        if (!ETATS_FINAUX.has(a.etat)) { suivre(id); return; }
        if (a.etat === 'terminee') await finir(id);
      } catch (e) {
        erreurMes = erreurDe('v2.room.errMeasure', e);
      }
    }, SUIVI.intervalleMs);
  }
  onDestroy(arreterSuivi);

  async function finir(id: string) {
    try {
      resultat = await lireResultat(id);
    } catch (e) {
      erreurMes = erreurDe('v2.room.errResult', e);
      return;
    }
    await proposerMes();
  }
  async function proposerMes() {
    if (!mesure) return;
    try {
      propMes = await proposerMesure(mesure.id, cibleMes);
    } catch (e) {
      propMes = null;
      erreurMes = erreurDe('v2.room.errProposal', e);
    }
  }
  function changerCibleMes(c: TypeCible) {
    cibleMes = c;
    application = 'repos';
    appliquee = null;
    void proposerMes();
  }
  async function annuler() {
    if (!mesure) return;
    try {
      await annulerMesure(mesure.id);
      arreterSuivi();
      mesure = { ...mesure, etat: 'annulee' };
    } catch (e) {
      erreurMes = erreurDe('v2.room.errCancel', e);
    }
  }
  function appliquerMes() {
    const m = mesure;
    if (!m) return;
    void appliquer(() => enregistrerProfilMesure(m.id, cibleMes), (e) => { erreurMes = e; });
  }
</script>

{#snippet erreur(e: Erreur | null)}
  {#if e}
    <div class="err" role="alert" data-room-erreur={e.code ?? ''}>
      <b>{$t(e.cle as any)}</b>
      {#if e.cause}<span data-room="cause">{e.cause}</span>{/if}
    </div>
  {/if}
{/snippet}

{#snippet appliqueeNote()}
  {#if application === 'faite' && appliquee}
    <div class="ok" role="status" data-room="appliquee">
      {$t('v2.room.applied' as any).replace('{n}', String(appliquee.filtres)).replace('{zone}', zone?.name ?? '')}
      {#if appliquee.live === false}<span class="hint">{$t('v2.room.appliedNextTrack' as any)}</span>{/if}
    </div>
  {/if}
{/snippet}

<section class="v2-room tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{zone?.name ?? $t('v2.room.eyebrow' as any)}</div>
      <h1>{$t('v2.zone.roomCorrection' as any)} <span class="badge" data-room="badge-premium">{$t('v2.room.premiumBadge' as any)}</span></h1>
    </div>
    <div class="v2-actions">
      <button class="v2-btn" data-room="fir" onclick={ouvrirFir}>{$t('v2.room.firLink' as any)}</button>
    </div>
  </header>

  <div class="scroll">
    {#if sansPremium}
      <div class="warn" data-room-motif="premium"><b>{$t('v2.room.premiumBadge' as any)}</b> <span>{$t('v2.room.premium' as any)}</span></div>
    {/if}
    {#if zoneId == null}
      <div class="warn" data-room-motif="zone">{$t('v2.room.noZone' as any)}</div>
    {/if}
    {#if presence === 'absent'}
      <div class="warn" data-room-motif="absent">{$t('v2.room.pluginAbsent' as any)}</div>
    {:else if presence === 'a_installer'}
      <div class="warn row-warn" data-room-motif="a_installer">
        <span>{$t('v2.room.pluginInstall' as any)}</span>
        <button class="v2-btn" data-room="installer" disabled={installation} onclick={installer}>
          {installation ? $t('v2.room.installing' as any) : $t('v2.room.install' as any)}
        </button>
      </div>
    {:else if presence === 'a_redemarrer'}
      <div class="warn" data-room-motif="a_redemarrer">{$t('v2.room.pluginRestart' as any)}</div>
    {/if}

    {#if sansEgaliseur}
      <div class="warn row-warn" data-room-motif="egaliseur" data-egaliseur={egaliseur}>
        <span>{$t((egaliseur === 'a_installer' ? 'v2.room.eqMissing' : egaliseur === 'desactive' ? 'v2.room.eqInactive' : 'v2.room.eqRestart') as any)}</span>
        {#if egaliseur === 'a_installer'}
          <button class="v2-btn" data-room="installer-egaliseur" disabled={installationEq} onclick={installerEgaliseur}>
            {installationEq ? $t('v2.room.installing' as any) : $t('v2.room.eqInstall' as any)}
          </button>
        {/if}
      </div>
    {/if}

    <div class="onglets" role="tablist">
      <button role="tab" aria-selected={onglet === 'simulation'} class:on={onglet === 'simulation'} data-onglet="simulation"
        onclick={() => (onglet = 'simulation')}>{$t('v2.room.tabNoMic' as any)}</button>
      <button role="tab" aria-selected={onglet === 'micro'} class:on={onglet === 'micro'} data-onglet="micro"
        onclick={() => (onglet = 'micro')}>{$t('v2.room.tabMic' as any)}</button>
    </div>

    {#if onglet === 'simulation'}
      <fieldset class="card" class:voile={verrouille} disabled={verrouille} data-room="simulation">
        <p class="hint intro">{$t('v2.room.simIntro' as any)}</p>
        <div class="dims">
          {#each DIMS as [cle, lib, b] (cle)}
            <label class="dim">
              <span>{$t(lib as any)}</span>
              <input type="number" data-dim={cle} min={b.min} max={b.max} step="0.05" value={piece[cle]}
                oninput={(e) => regler(cle, e)} class:faux={horsBornes === cle} />
              <span class="unite">m</span>
            </label>
          {/each}
        </div>
        {#if horsBornes}
          <div class="hint faux" data-room="hors-bornes">
            {$t('v2.room.dimsBounds' as any)
              .replace('{min}', String(BORNES_PIECE.cote.min))
              .replace('{max}', String(BORNES_PIECE.cote.max))
              .replace('{hmax}', String(BORNES_PIECE.hauteur.max))}
          </div>
        {/if}

        <div class="surfaces">
          {#each SURFACES as s (s)}
            <label class="surf">
              <span>{$t(LIBELLES_SURFACES[s] as any)}</span>
              <select data-surface={s} value={surfaces[s]} onchange={(e) => qualite(s, e)}>
                {#each QUALITES as q (q)}<option value={q}>{$t(LIBELLES_QUALITES[q] as any)}</option>{/each}
              </select>
            </label>
          {/each}
        </div>
        <div class="positions" data-room="positions">
          <div class="pos-titre">
            <span>{$t('v2.room.positionsTitle' as any)}</span>
            <span class="hint">{$t('v2.room.positionsHelp' as any)}</span>
          </div>
          <div class="pos-corps">
            <table class="pos">
              <thead><tr><th></th>{#each AXES as a (a)}<th>{a}</th>{/each}<th></th></tr></thead>
              <tbody>
                {#each [-1, ...placement.enceintes.map((_, i) => i)] as qui (qui)}
                  {@const pos = qui < 0 ? placement.auditeur : placement.enceintes[qui]}
                  <tr data-position={qui < 0 ? 'auditeur' : `enceinte-${qui}`}>
                    <th scope="row">{qui < 0 ? $t('v2.room.listener' as any) : $t('v2.room.speakerN' as any).replace('{n}', String(qui + 1))}</th>
                    {#each AXES as a (a)}
                      <td><input type="number" data-axe={a} min="0" max={piece[COTE_DE_L_AXE[a]]} step="0.05" value={pos[a]}
                        aria-label={`${qui < 0 ? $t('v2.room.listener' as any) : $t('v2.room.speakerN' as any).replace('{n}', String(qui + 1))} ${a}`}
                        class:faux={posHors?.qui === qui && posHors?.axe === a}
                        oninput={(e) => reglerPosition(qui, a, e)} /></td>
                    {/each}
                    <td>
                      {#if qui >= 0 && placement.enceintes.length > ENCEINTES_MIN}
                        <button class="lien" data-room="retirer-enceinte" onclick={() => retirerEnceinte(qui)}>{$t('v2.room.removeSpeaker' as any)}</button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <svg class="schema" data-room="schema" viewBox={`-6 -6 ${schema.w + 12} ${schema.h + 12}`}
              width={schema.w + 12} height={schema.h + 12} role="img" aria-label={$t('v2.room.topView' as any)}>
              <rect class="mur" x="0" y="0" width={schema.w} height={schema.h} />
              <line class="avant" x1="0" y1="0" x2={schema.w} y2="0" />
              {#each placement.enceintes as e, i (i)}
                <rect class="hp" x={schema.px(e.y) - 4} y={schema.py(e.x) - 4} width="8" height="8" />
              {/each}
              <circle class="ecoute" cx={schema.px(placement.auditeur.y)} cy={schema.py(placement.auditeur.x)} r="5" />
            </svg>
          </div>
          {#if posHors}
            <div class="hint faux" data-room="position-hors">{$t('v2.room.positionOutside' as any)}</div>
          {/if}
          <div class="actions">
            {#if placement.enceintes.length < ENCEINTES_MAX}
              <button class="v2-btn" data-room="ajouter-enceinte" onclick={ajouterEnceinte}>{$t('v2.room.addSpeaker' as any)}</button>
            {/if}
            {#if placementSaisi}
              <button class="v2-btn" data-room="placement-type" onclick={() => (placementSaisi = null)}>{$t('v2.room.resetPlacement' as any)}</button>
            {:else}
              <span class="hint">{$t('v2.room.placementNote' as any)}</span>
            {/if}
          </div>
        </div>

        <div class="actions">
          <button class="v2-btn primaire" data-room="simuler" disabled={calculSim || horsBornes != null || posHors != null} onclick={lancerSimulation}>
            {calculSim ? $t('v2.room.simulating' as any) : $t('v2.room.simulate' as any)}
          </button>
        </div>

        {@render erreur(erreurSim)}

        {#if simulation}
          <div class="resume" data-room="sim-resume">
            {$t('v2.room.simSummary' as any)
              .replace('{v}', f1(simulation.volume_m3))
              .replace('{rt}', f2(simulation.rt60_sabine_s))
              .replace('{fs}', f0(simulation.f_schroeder_hz))}
          </div>
          <CourbeCorrectionPiece titre={$t('v2.room.simCurve' as any)}
            series={[{ cle: 'mesure', freqs: simulation.reponse.freqs_hz, db: simulation.reponse.db }]}
            modes={modesAffiches(simulation.modes).filter((m) => modeFort(m, enceintesSimulees)).map((m) => m.frequence_hz)} />
          <table class="modes" data-room="modes">
            <thead><tr><th>{$t('v2.room.colFreq' as any)}</th><th>{$t('v2.room.colType' as any)}</th><th>{$t('v2.room.colIndices' as any)}</th><th>{$t('v2.room.colDecay' as any)}</th><th></th></tr></thead>
            <tbody>
              {#each modesAffiches(simulation.modes) as m, i (i)}
                {@const ou = positionDuMode(m, enceintesSimulees)}
                <tr class:fort={ou === 'ventre'} data-mode={f1(m.frequence_hz)} data-couplage={ou}>
                  <td>{f1(m.frequence_hz)} Hz</td>
                  <td>{$t(LIBELLES_TYPES_MODE[m.type] as any)}</td>
                  <td>({m.indices.join(', ')})</td>
                  <td>{f2(m.t60_s)} s</td>
                  <td>{$t(LIBELLES_POSITIONS_MODE[ou] as any)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if simulation.avertissements.length}
            <ul class="avert">{#each simulation.avertissements as a, i (i)}<li>{a}</li>{/each}</ul>
          {/if}
        {/if}

        {#if bornesExpert}
          <details class="expert" data-room="expert">
            <summary>{$t('v2.room.expertTitle' as any)}</summary>
            <p class="hint faux" data-room="expert-avertissement">{$t('v2.room.expertWarning' as any)}</p>
            <label class="chk">
              <input type="checkbox" data-room="expert-actif" checked={expertActif} onchange={basculerExpert} />
              <span>{$t('v2.room.expertTitle' as any)}</span>
            </label>
            {#if expertActif && expertEnvoye}
              <div class="dims">
                <label class="dim">
                  <span>{$t('v2.room.expertBands' as any)}</span>
                  <input type="number" data-room="expert-bandes" min="1" max={bornesExpert.bandes_max} step="1"
                    value={expertEnvoye.bandes_max} onchange={(e) => reglerExpert('bandes_max', e)} />
                  <span class="unite">1–{bornesExpert.bandes_max}</span>
                </label>
                <label class="dim">
                  <span>{$t('v2.room.expertCut' as any)}</span>
                  <input type="number" data-room="expert-coupe" min={COUPE_MIN_DB} max={bornesExpert.coupe_max_db} step="0.5"
                    value={expertEnvoye.coupe_max_db} onchange={(e) => reglerExpert('coupe_max_db', e)} />
                  <span class="unite">dB ({COUPE_MIN_DB}–{bornesExpert.coupe_max_db})</span>
                </label>
              </div>
            {/if}
          </details>
        {/if}

        {#if propSim}
          <PropositionCorrectionPiece proposition={propSim} cible={cibleSim} {verrouille} {application}
            onCible={changerCibleSim} onAppliquer={appliquerSim} />
          {@render appliqueeNote()}
        {/if}
      </fieldset>
    {:else}
      <fieldset class="card" class:voile={verrouille} disabled={verrouille} data-room="micro">
        <p class="hint intro">{$t('v2.room.micIntro' as any)}</p>
        {@render erreur(erreurMicros)}
        {#if lectureMicros}
          <div class="state">{$t('v2.tool.loading' as any)}</div>
        {:else if sansMicro || (erreurMicros && erreurMicros.code === 'capture_indisponible')}
          <div class="warn" data-room-motif="nomic">{$t('v2.room.noMic' as any)}</div>
        {:else if microphones}
          <div class="dims">
            <label class="surf">
              <span>{$t('v2.room.microphone' as any)}</span>
              <select data-room="entree" bind:value={entree} disabled={enCours}>
                {#each listeMicros as m (m.id || m.nom)}<option value={m.id || m.nom}>{m.nom}</option>{/each}
              </select>
            </label>
            {#if micro && micro.canaux > 1}
              <label class="surf">
                <span>{$t('v2.room.micChannel' as any)}</span>
                <select data-room="voie" bind:value={voie} disabled={enCours}>
                  {#each Array.from({ length: micro.canaux }, (_, i) => i) as i (i)}<option value={i}>{i + 1}</option>{/each}
                </select>
              </label>
            {/if}
            <label class="surf">
              <span>{$t('v2.room.calibration' as any)}</span>
              <select data-room="etalonnage" bind:value={etalonnage} disabled={enCours}>
                <option value="">{$t('v2.room.calibrationNone' as any)}</option>
                {#each microphones.etalonnages as n (n)}<option value={n}>{n}</option>{/each}
              </select>
            </label>
            <label class="surf fichier">
              <span>{$t('v2.room.calibrationUpload' as any)}</span>
              <input type="file" accept=".txt,.cal,.frd" data-room="etalonnage-fichier" onchange={deposer} disabled={enCours} />
            </label>
          </div>
          {#if avertissementFrequenceMicro(micro, microphones.frequence_requise, $t)}
            <div class="hint faux" data-room="frequence">
              {avertissementFrequenceMicro(micro, microphones.frequence_requise, $t)}
            </div>
          {/if}
          <div class="actions">
            <button class="v2-btn primaire" data-room="mesurer" disabled={!micro || enCours} onclick={lancer}>{$t('v2.room.measure' as any)}</button>
            {#if enCours}
              <button class="v2-btn danger" data-room="annuler" onclick={annuler}>{$t('v2.room.cancel' as any)}</button>
            {/if}
          </div>
        {/if}

        {#if mesure}
          <div class="avancement" data-room="avancement" data-etat={mesure.etat}>
            <span>{$t(LIBELLES_ETATS[mesure.etat] as any)}</span>
            {#if enCours}
              <progress max="1" value={mesure.progression}></progress>
              <span class="val">{f0(mesure.progression * 100)} %</span>
            {/if}
            {#if mesure.motif || mesure.message}<span class="hint" data-room="cause">{mesure.motif ?? mesure.message}</span>{/if}
          </div>
        {/if}
        {@render erreur(erreurMes)}

        {#if resultat}
          <CourbeCorrectionPiece titre={$t('v2.room.measuredCurve' as any)}
            series={[{ cle: 'mesure', freqs: resultat.reponse.freqs_hz, db: resultat.reponse.db }]} />
          {#if resultat.rt60.length}
            <table class="modes" data-room="rt60">
              <thead><tr><th>{$t('v2.room.colBand' as any)}</th><th>{$t('v2.room.colRt60' as any)}</th></tr></thead>
              <tbody>
                {#each resultat.rt60 as b, i (i)}
                  {@const v = rt60De(b)}
                  <tr><td>{f0(b.centre_hz)} Hz</td><td>{v == null ? '–' : `${f2(v)} s`}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
          {#if resultat.avertissements.length}
            <ul class="avert">{#each resultat.avertissements as a, i (i)}<li>{a}</li>{/each}</ul>
          {/if}
        {/if}

        {#if propMes}
          <PropositionCorrectionPiece proposition={propMes} cible={cibleMes} {verrouille} {application}
            onCible={changerCibleMes} onAppliquer={appliquerMes} />
          {@render appliqueeNote()}
        {/if}
      </fieldset>
    {/if}
  </div>
</section>

<style>
  .v2-room{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; max-width:860px}
  .badge{font:600 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; vertical-align:middle;
    padding:3px 8px; border-radius:var(--v2-r-pill); color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .state{padding:16px 0; color:var(--v2-txt3)}
  .err,.warn,.ok{padding:11px 14px; border-radius:10px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5; margin-bottom:14px;
    display:flex; flex-direction:column; gap:4px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .warn b{color:var(--v2-acc-tint)}
  .row-warn{flex-direction:row; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap}
  .ok{color:var(--v2-txt); border:1px solid var(--v2-acc1)}

  .onglets{display:flex; gap:6px; margin:4px 0 14px}
  .onglets button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:8px 16px; border-radius:var(--v2-r-pill)}
  .onglets button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:14px 20px 18px;
    margin:0; min-width:0; display:flex; flex-direction:column; gap:10px}
  .card.voile{opacity:.45; pointer-events:none; user-select:none}
  .hint{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3); max-width:62ch; margin:0}
  .hint.faux{color:var(--v2-danger)}
  .intro{font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .dims,.surfaces{display:flex; flex-wrap:wrap; gap:12px 18px}
  .dim,.surf{display:flex; flex-direction:column; gap:5px; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .dim{flex-direction:row; align-items:center; gap:8px}
  .dim input{width:78px}
  input[type=number],select{background:var(--v2-bg); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:8px; padding:6px 8px; font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  input.faux{border-color:var(--v2-danger)}
  .unite{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .actions{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .resume{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .modes{border-collapse:collapse; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .modes th{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); text-transform:uppercase; letter-spacing:.06em; color:var(--v2-txt3); text-align:left; padding:4px 16px 4px 0}
  .modes td{padding:4px 16px 4px 0; border-top:1px solid var(--v2-line)}
  .modes tr.fort td{color:var(--v2-txt)}
  .avert{margin:0; padding-left:18px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.5; color:var(--v2-txt3)}
  .avancement{display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .avancement progress{width:220px; accent-color:var(--v2-acc1)}
  .val{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .positions{display:flex; flex-direction:column; gap:8px; padding-top:4px}
  .pos-titre{display:flex; flex-direction:column; gap:2px; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .pos-corps{display:flex; flex-wrap:wrap; gap:14px 24px; align-items:flex-start}
  .pos{border-collapse:collapse; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .pos th{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); text-align:left; padding:3px 10px 3px 0; font-weight:400}
  .pos tbody th{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2); white-space:nowrap}
  .pos td{padding:3px 8px 3px 0}
  .pos input{width:68px}
  .lien{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font:inherit; padding:0; text-decoration:underline}
  .schema{flex:none; overflow:visible}
  .schema .mur{fill:var(--v2-bg); stroke:var(--v2-line2); stroke-width:1}
  .schema .avant{stroke:var(--v2-acc1); stroke-width:3}
  .schema .hp{fill:var(--v2-acc-tint)}
  .schema .ecoute{fill:none; stroke:var(--v2-txt); stroke-width:2}
  .expert{border-top:1px solid var(--v2-line); padding-top:8px; display:flex; flex-direction:column; gap:8px}
  .expert summary{cursor:pointer; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .expert[open]{gap:8px}
  .chk{display:flex; align-items:center; gap:8px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt)}
  @media (max-width: 640px){ .scroll{padding:6px 16px 40px} }
</style>
