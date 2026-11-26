<script lang="ts">
  /**
   * TESS (C4, rc14) — la mesure de la pièce à PLUSIEURS positions, dans
   * l'onglet « Au micro » de `CorrectionPieceV2`. Le micro et l'étalonnage
   * sont choisis par l'écran parent ; ce composant tient le reste :
   *
   *  1. préparation : nombre de positions (3 à 9, 5 par défaut) et consigne ;
   *  2. session (`POST /zones/{z}/sessions`), puis une mesure par position
   *     (`POST /sessions/{id}/positions`), suivie et annulable comme une
   *     mesure ordinaire (`GET` / `DELETE /mesures/{id}`) ; une position
   *     écartée par le greffon est signalée avec sa raison, et se refait ;
   *  3. correction proposée sur la MOYENNE (`/sessions/{id}/correction`),
   *     appliquée par le geste commun du parent ;
   *  4. vérification : la même mesure, correction appliquée, puis
   *     `POST /comparaisons` (avant = 1re session, après = 2de) ;
   *  5. export et import du document de session (v2).
   *
   * Le parent ne le monte que si le serveur connaît les sessions
   * (`sonderSessions`, `404 session_inconnue` sur un id factice).
   */
  import { onDestroy, untrack } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import {
    POSITIONS_MIN, POSITIONS_MAX, POSITIONS_DEFAUT, SUIVI, LIBELLES_ETATS, ETATS_FINAUX,
    positionsBornees, positionMesuree, etatPosition, verdictPosition, prochainePosition, causeRejet, causeMesure,
    nomExportSession, telechargerJson, lireErreur, IMPORT_MAX_OCTETS, RELANCES_SUIVI, delaiRelance,
    creerSession, lireSession, mesurerPosition, lireAvancement, annulerMesure, exporterSession, importerSession,
    proposerSession, enregistrerProfilSession, comparer,
    type VueSession, type Avancement, type Proposition, type TypeCible, type Comparaison, type DemandeMesure,
    type ProfilEnregistre,
  } from '../../lib/correctionPiece';
  import CourbeCorrectionPiece from './CourbeCorrectionPiece.svelte';
  import PropositionCorrectionPiece from './PropositionCorrectionPiece.svelte';

  type Erreur = { cle: string; cause: string | null; code: string | null };

  let {
    zoneId, zoneNom, verrouille, demande, application, erreurDe, onAppliquer, onOccupe, onReinitialiser,
    memoire, onMemoire,
  }: {
    zoneId: number;
    zoneNom: string;
    verrouille: boolean;
    /** Le micro choisi par le parent ; `null` tant qu'il n'y en a pas. */
    demande: DemandeMesure | null;
    application: 'repos' | 'en_cours' | 'faite';
    /** Celui du parent : un 402 y verrouille l'écran entier. */
    erreurDe: (cle: string, e: unknown) => Erreur | null;
    onAppliquer: (enregistrer: () => Promise<ProfilEnregistre>, poserErreur: (e: Erreur | null) => void) => void;
    onOccupe: (occupe: boolean) => void;
    onReinitialiser: () => void;
    /**
     * Les sessions en cours, gardées par le PARENT : un changement d'onglet
     * démonte ce composant, et il les reprend au retour (mesure en cours
     * comprise). Le parent y range aussi la session retrouvée par
     * `GET /mesures` quand l'écran entier est rouvert.
     */
    memoire: { a: string | null; b: string | null };
    onMemoire: (m: { a: string | null; b: string | null }) => void;
  } = $props();

  let nombre = $state(POSITIONS_DEFAUT);
  /** La mesure de la pièce (avant correction). */
  let session = $state<VueSession | null>(null);
  /** La même mesure, correction appliquée : l'« après » de la comparaison. */
  let verification = $state<VueSession | null>(null);
  let creation = $state(false);
  let courante = $state<{ session: string; index: number; avancement: Avancement } | null>(null);
  let proposition = $state<Proposition | null>(null);
  let cible = $state<TypeCible>('plate');
  let comparaison = $state<Comparaison | null>(null);
  let erreur = $state<Erreur | null>(null);
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  /** Le POST d'une position est parti, sa réponse pas encore arrivée (M3). */
  let lancement = $state(false);
  /** L'annulation est demandée : on attend l'état final du serveur (M4). */
  let annulation = $state(false);
  let reprise = $state(false);
  /** Démonté : plus aucun suivi ne doit écrire (M2). */
  let detruit = false;

  const enCours = $derived(lancement || reprise || (courante != null && !ETATS_FINAUX.has(courante.avancement.etat)));
  $effect(() => { onOccupe(enCours || creation); });
  // B1 — un onglet quitté pendant une mesure ne laisse pas l'écran figé.
  onDestroy(() => { detruit = true; arreterSuivi(); onOccupe(false); });

  // Le parent garde les ids : au retour sur l'onglet, on reprend où on en était.
  const memoriser = () => onMemoire({ a: session?.id ?? null, b: verification?.id ?? null });
  $effect(() => {
    const { a, b } = memoire;
    untrack(() => { if (a && session?.id !== a) void reprendre(a, b); });
  });

  /** Le serveur ne connaît plus la mesure ou la session : redémarré (sessions en mémoire). */
  function perdue(e: unknown): boolean {
    const x = lireErreur(e);
    return x.status === 404 && (x.code === 'mesure_inconnue' || x.code === 'session_inconnue');
  }
  const ERREUR_PERDUE = (code: string | null): Erreur => ({ cle: 'v2.room.multiErrLost', cause: null, code });

  async function reprendre(a: string, b: string | null) {
    reprise = true;
    erreur = null;
    try {
      const va = await lireSession(a);
      const vb = b ? await lireSession(b).catch(() => null) : null;
      if (detruit) return;
      session = va;
      verification = vb;
      // Une position encore en cours se suit de nouveau.
      for (const v of [vb, va]) {
        const e = v?.etats.find((x) => x.mesure_id && !ETATS_FINAUX.has(x.etat));
        if (v && e?.mesure_id) {
          courante = { session: v.id, index: e.index,
            avancement: { id: e.mesure_id, zone_id: zoneId, entree: '', etat: e.etat, progression: 0, avertissements: [] } };
          suivre(e.mesure_id);
          break;
        }
      }
      if (va.moyenne) await proposer();
      if (vb?.moyenne) await comparerAvantApres();
    } catch (e) {
      if (detruit) return;
      erreur = perdue(e) ? ERREUR_PERDUE('session_inconnue') : erreurDe('v2.room.multiErrSession', e);
      onMemoire({ a: null, b: null });
    } finally {
      reprise = false;
    }
  }

  /** Une session importée d'une autre zone (ou sans zone) se consulte : on n'y mesure pas. */
  const lectureSeule = (s: VueSession) => s.zone_id !== zoneId;

  const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const f0 = (v: number) => Math.round(v).toString();
  const tr = (cle: string) => $t(cle as any);

  /** Le schéma vu de dessus : la place d'écoute au centre, les autres autour. */
  const schema = $derived.by(() => {
    const n = positionsBornees(nombre);
    const points = [{ n: 1, x: 0, y: 0 }];
    for (let k = 1; k < n; k++) {
      const a = (2 * Math.PI * (k - 1)) / (n - 1) - Math.PI / 2;
      points.push({ n: k + 1, x: Math.round(Math.cos(a) * 42), y: Math.round(Math.sin(a) * 42) });
    }
    return points;
  });

  async function commencer() {
    if (verrouille || creation) return;
    creation = true;
    erreur = null;
    try {
      session = await creerSession(zoneId, positionsBornees(nombre));
      verification = null;
      memoriser();
      proposition = null;
      comparaison = null;
      onReinitialiser();
    } catch (e) {
      erreur = erreurDe('v2.room.multiErrCreate', e);
    } finally {
      creation = false;
    }
  }

  async function commencerVerification() {
    if (!session || verrouille || creation) return;
    creation = true;
    erreur = null;
    try {
      verification = await creerSession(zoneId, session.positions_prevues);
      memoriser();
      comparaison = null;
    } catch (e) {
      erreur = erreurDe('v2.room.multiErrCreate', e);
    } finally {
      creation = false;
    }
  }

  function nouvelle() {
    arreterSuivi();
    session = null;
    verification = null;
    courante = null;
    proposition = null;
    comparaison = null;
    erreur = null;
    memoriser();
    onReinitialiser();
  }

  async function mesurer(s: VueSession, index: number) {
    if (verrouille || enCours || !demande || lectureSeule(s)) return;
    lancement = true;
    const lieu = index === s.centrale ? tr('v2.room.multiCentral') : tr('v2.room.multiAround');
    const question = tr('v2.room.multiConfirm')
      .replace('{n}', String(index + 1)).replace('{lieu}', lieu).replace('{zone}', zoneNom);
    if (!(await dialogs.confirm(question))) { lancement = false; return; }
    erreur = null;
    annulation = false;
    try {
      // Retour de Didier (rc13.90) — la vérification se mesure AVEC la
      // correction de la zone : sans ce drapeau, le serveur la contournait
      // comme pour toute mesure, et « après » valait « avant ».
      const avecCorrection = verification?.id === s.id;
      const r = await mesurerPosition(s.id, { ...demande, index, ...(avecCorrection ? { avec_correction: true } : {}) });
      if (detruit) return;
      courante = {
        session: s.id, index: r.position,
        avancement: { id: r.id, zone_id: zoneId, entree: demande.entree, etat: 'preparation', progression: 0, avertissements: [] },
      };
      suivre(r.id);
    } catch (e) {
      erreur = perdue(e) ? ERREUR_PERDUE('session_inconnue') : erreurDe('v2.room.errMeasure', e);
    } finally {
      lancement = false;
    }
  }

  function arreterSuivi() {
    if (minuterie) clearTimeout(minuterie);
    minuterie = null;
  }
  /** La mesure suivie passe en erreur : l'écran se débloque (B2). */
  function abandonner(id: string, e: Erreur | null) {
    if (courante?.avancement.id === id) {
      courante = { ...courante, avancement: { ...courante.avancement, etat: 'erreur', message: undefined } };
    }
    annulation = false;
    erreur = e;
  }
  /**
   * Le suivi d'une mesure. Un 404 (`mesure_inconnue`) dit que le serveur l'a
   * oubliée : redémarrage, les mesures vivent en mémoire. Une panne passagère
   * (réseau, 5xx) se relance RELANCES_SUIVI fois, à intervalle croissant.
   */
  function suivre(id: string, echecs = 0) {
    arreterSuivi();
    const delai = echecs ? delaiRelance(echecs, SUIVI.intervalleMs) : SUIVI.intervalleMs;
    minuterie = setTimeout(async () => {
      minuterie = null;
      if (detruit) return;
      let a: Avancement;
      try {
        a = await lireAvancement(id);
      } catch (e) {
        if (detruit) return;
        const x = lireErreur(e);
        if (perdue(e)) { abandonner(id, ERREUR_PERDUE(x.code)); return; }
        if (x.premium || (x.status != null && x.status < 500) || echecs >= RELANCES_SUIVI) {
          abandonner(id, erreurDe('v2.room.errMeasure', e));
          return;
        }
        suivre(id, echecs + 1);
        return;
      }
      if (detruit || !courante || courante.avancement.id !== id) return;
      courante = { ...courante, avancement: a };
      if (!ETATS_FINAUX.has(a.etat)) { suivre(id); return; }
      annulation = false;
      await rafraichir(courante.session);
    }, delai);
  }

  async function annuler() {
    if (!courante || annulation) return;
    const c = courante;
    annulation = true;
    try {
      await annulerMesure(c.avancement.id);
      // M4 — le bouton « Mesurer » revient quand le serveur dit la mesure finie.
      if (!minuterie && !detruit) suivre(c.avancement.id);
    } catch (e) {
      if (perdue(e)) { abandonner(c.avancement.id, ERREUR_PERDUE('mesure_inconnue')); return; }
      annulation = false;
      erreur = erreurDe('v2.room.errCancel', e);
    }
  }

  /** Relit la session (le serveur y recopie les résultats terminés), puis enchaîne. */
  async function rafraichir(id: string) {
    let vue: VueSession;
    try {
      vue = await lireSession(id);
    } catch (e) {
      if (detruit) return;
      erreur = perdue(e) ? ERREUR_PERDUE('session_inconnue') : erreurDe('v2.room.multiErrSession', e);
      return;
    }
    if (detruit) return;
    if (session?.id === id) {
      session = vue;
      if (vue.moyenne) await proposer();
    } else if (verification?.id === id) {
      verification = vue;
      if (vue.moyenne) await comparerAvantApres();
    }
  }

  async function proposer() {
    if (!session?.moyenne || lectureSeule(session)) return;
    try {
      proposition = await proposerSession(session.id, cible);
    } catch (e) {
      proposition = null;
      erreur = erreurDe('v2.room.errProposal', e);
    }
  }
  function changerCible(c: TypeCible) {
    cible = c;
    onReinitialiser();
    void proposer();
  }
  function appliquer() {
    const s = session;
    if (!s) return;
    const c = cible;
    onAppliquer(() => enregistrerProfilSession(s.id, c), (e) => { erreur = e; });
  }

  async function comparerAvantApres() {
    if (!session || !verification?.moyenne) return;
    try {
      comparaison = await comparer(session.id, verification.id, cible);
    } catch (e) {
      comparaison = null;
      erreur = erreurDe('v2.room.multiErrCompare', e);
    }
  }

  async function exporter(s: VueSession) {
    erreur = null;
    try {
      const doc = await exporterSession(s.id);
      telechargerJson(nomExportSession(s), doc);
    } catch (e) {
      erreur = erreurDe('v2.room.multiErrExport', e);
    }
  }

  async function importer(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const fichier = input.files?.[0];
    if (!fichier) return;
    erreur = null;
    // M6 — la limite de la route (`IMPORT_MAX_OCTETS`), vérifiée avant de lire le fichier.
    if (fichier.size > IMPORT_MAX_OCTETS) {
      erreur = { cle: 'v2.room.multiErrImportTooBig', cause: null, code: 'trop_grand' };
      input.value = '';
      return;
    }
    try {
      let doc: unknown;
      try {
        doc = JSON.parse(await fichier.text());
      } catch {
        erreur = { cle: 'v2.room.multiErrImport', cause: null, code: 'json' };
        return;
      }
      const vue = await importerSession(doc);
      nouvelle();
      session = vue;
      memoriser();
      if (vue.moyenne) await proposer();
    } catch (err) {
      const x = lireErreur(err);
      erreur = x.code === 'unsupported_version'
        ? { cle: 'v2.room.multiErrImportVersion', cause: null, code: x.code }
        : erreurDe('v2.room.multiErrImport', err);
    } finally {
      input.value = '';
    }
  }
</script>

{#snippet bloc(s: VueSession, role: 'session' | 'verification')}
  {@const prochaine = prochainePosition(s)}
  {@const seule = lectureSeule(s)}
  <ol class="positions" data-multi="positions" data-multi-role={role}>
    {#each Array.from({ length: s.positions_prevues }, (_, i) => i) as i (i)}
      {@const ici = courante && courante.session === s.id && courante.index === i ? courante : null}
      {@const mesuree = positionMesuree(s, i)}
      {@const etat = etatPosition(s, i)}
      {@const verdict = verdictPosition(s, i)}
      <li class="pos" class:rejetee={verdict?.rejetee} data-multi-position={i}
        data-etat={ici ? ici.avancement.etat : mesuree ? 'terminee' : (etat?.etat ?? 'libre')}
        data-rejetee={verdict?.rejetee ? 'oui' : 'non'}>
        <div class="pos-tete">
          <span class="num">{i + 1}</span>
          <span class="nom">
            {tr('v2.room.multiPosition').replace('{n}', String(i + 1))}
            {#if i === s.centrale}<span class="hint"> · {tr('v2.room.multiCentral')}</span>{/if}
          </span>
          <span class="act">
            {#if ici && !ETATS_FINAUX.has(ici.avancement.etat)}
              <button class="v2-btn danger" data-multi="annuler" disabled={annulation} onclick={annuler}>{tr('v2.room.cancel')}</button>
            {:else if !seule}
              <button class="v2-btn" class:primaire={!mesuree && i === prochaine} data-multi={mesuree ? 'refaire' : 'mesurer'}
                disabled={verrouille || enCours || !demande} onclick={() => mesurer(s, i)}>
                {mesuree ? tr('v2.room.multiRedo') : tr('v2.room.multiMeasure')}
              </button>
            {/if}
          </span>
        </div>
        {#if ici && !ETATS_FINAUX.has(ici.avancement.etat)}
          <div class="avancement" data-multi="avancement">
            <span>{tr(LIBELLES_ETATS[ici.avancement.etat])}</span>
            <progress max="1" value={ici.avancement.progression}></progress>
            <span class="val">{f0(ici.avancement.progression * 100)} %</span>
          </div>
        {:else if mesuree && verdict?.rejetee}
          <div class="verdict faux" data-multi="rejet" data-cause={causeRejet(verdict, s)} role="status">
            <b>{tr('v2.room.multiRejected')}</b>
            <span>
              {causeRejet(verdict, s) === 'niveau'
                ? tr('v2.room.multiRejectLevel').replace('{d}', f1(Math.abs(verdict.decalage_niveau_db)))
                : tr('v2.room.multiRejectShape').replace('{e}', f1(verdict.ecart_median_db)).replace('{s}', f1(s.moyenne?.seuil_rejet_db ?? 0))}
            </span>
          </div>
        {:else if mesuree}
          <div class="verdict" data-multi="resultat">
            {tr('v2.room.multiMeasured')}{#if verdict} · {tr('v2.room.multiCloseToOthers').replace('{e}', f1(verdict.ecart_median_db))}{/if}
          </div>
        {:else if etat && etat.etat !== 'terminee' && ETATS_FINAUX.has(etat.etat)}
          {@const cause = ici ? causeMesure(ici.avancement, tr) : (etat.motif ?? etat.message ?? null)}
          <div class="verdict" data-multi="echec">
            {tr(LIBELLES_ETATS[etat.etat])}{#if cause} · <span class="hint">{cause}</span>{/if}
          </div>
        {:else}
          <div class="verdict hint">{tr('v2.room.multiToMeasure')}</div>
        {/if}
      </li>
    {/each}
  </ol>

  {#if s.moyenne}
    <div class="resume" data-multi="moyenne">
      {tr('v2.room.multiAverage').replace('{n}', String(s.moyenne.positions_retenues)).replace('{total}', String(s.positions_prevues))}
    </div>
    <CourbeCorrectionPiece titre={tr('v2.room.multiAverageCurve')}
      series={[{ cle: 'mesure', freqs: s.moyenne.freqs_hz, db: s.moyenne.db }]} />
    {#if s.moyenne.avertissements.length}
      <ul class="avert">{#each s.moyenne.avertissements as a, k (k)}<li>{a}</li>{/each}</ul>
    {/if}
  {:else}
    <p class="hint" data-multi="moyenne-attente">{tr('v2.room.multiAverageWaiting')}</p>
  {/if}

  <div class="actions">
    <button class="v2-btn" data-multi={role === 'session' ? 'exporter' : 'exporter-verification'}
      disabled={!s.positions.some((p) => p.resultat)} onclick={() => exporter(s)}>
      {role === 'session' ? tr('v2.room.multiExport') : tr('v2.room.multiExportCheck')}
    </button>
    {#if role === 'session'}<span class="hint">{tr('v2.room.multiExportHint')}</span>{/if}
  </div>
{/snippet}

<div class="multi" data-multi="parcours">
  {#if erreur}
    <div class="err" role="alert" data-room-erreur={erreur.code ?? ''}>
      <b>{tr(erreur.cle).replace('{mo}', String(IMPORT_MAX_OCTETS / (1024 * 1024)))}</b>
      {#if erreur.cause}<span data-room="cause">{erreur.cause}</span>{/if}
    </div>
  {/if}

  {#if !session}
    <div class="prepa" data-multi="preparation">
      <p class="hint intro">{tr('v2.room.multiIntro')}</p>
      <div class="prepa-corps">
        <div class="prepa-champs">
          <label class="dim">
            <span>{tr('v2.room.multiCount')}</span>
            <input type="number" data-multi="nombre" min={POSITIONS_MIN} max={POSITIONS_MAX} step="1" value={nombre}
              onchange={(e) => (nombre = positionsBornees((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <span class="hint">{tr('v2.room.multiCountHint').replace('{min}', String(POSITIONS_MIN)).replace('{max}', String(POSITIONS_MAX))}</span>
          <p class="consigne" data-multi="consigne">{tr('v2.room.multiHow')}</p>
        </div>
        <svg class="schema" data-multi="schema" viewBox="-60 -60 120 120" width="132" height="132" role="img"
          aria-label={tr('v2.room.multiSchema')}>
          <circle class="zone" cx="0" cy="0" r="42" />
          {#each schema as p (p.n)}
            <circle class:centre={p.n === 1} class="pt" cx={p.x} cy={p.y} r="9" />
            <text class="pt-n" x={p.x} y={p.y + 3.5} text-anchor="middle">{p.n}</text>
          {/each}
        </svg>
      </div>
      <div class="actions">
        <button class="v2-btn primaire" data-multi="commencer" disabled={verrouille || creation || !demande} onclick={commencer}>
          {tr('v2.room.multiStart')}
        </button>
        <label class="v2-btn fichier">
          <span>{tr('v2.room.multiImport')}</span>
          <input type="file" accept=".json,application/json" data-multi="importer" onchange={importer} disabled={verrouille} />
        </label>
      </div>
    </div>
  {:else}
    {#if lectureSeule(session)}
      <div class="warn" data-multi="lecture-seule">{tr('v2.room.multiImported')}</div>
    {/if}
    {@render bloc(session, 'session')}

    {#if proposition && !lectureSeule(session)}
      <PropositionCorrectionPiece {proposition} {cible} {verrouille} {application} onCible={changerCible} onAppliquer={appliquer} />
    {/if}

    {#if session.moyenne && !lectureSeule(session) && session.positions_prevues >= POSITIONS_MIN}
      <div class="verif" data-multi="verification">
        <div class="titre">{tr('v2.room.multiCheckTitle')}</div>
        {#if !verification}
          <p class="hint">{tr('v2.room.multiCheckIntro')}</p>
          <div class="actions">
            <button class="v2-btn" data-multi="verifier" disabled={verrouille || enCours || creation || !demande}
              onclick={commencerVerification}>{tr('v2.room.multiCheckStart')}</button>
          </div>
        {:else}
          {@render bloc(verification, 'verification')}
        {/if}
      </div>
    {/if}

    {#if comparaison}
      <div class="comparaison" data-multi="comparaison" data-amelioree={comparaison.amelioree ? 'oui' : 'non'}>
        <div class="titre">{tr('v2.room.multiCompareTitle')}</div>
        <div class="hint">{tr('v2.room.multiCompareBand').replace('{lo}', f0(comparaison.bande_hz[0])).replace('{hi}', f0(comparaison.bande_hz[1]))}</div>
        <div class={comparaison.amelioree ? 'ok' : 'warn'} data-multi="verdict-ab">
          {comparaison.amelioree ? tr('v2.room.multiCompareBetter') : tr('v2.room.multiCompareWorse')}
        </div>
        <table class="ab">
          <thead><tr><th>{tr('v2.room.multiColIndicator')}</th><th>{tr('v2.room.multiColBefore')}</th><th>{tr('v2.room.multiColAfter')}</th></tr></thead>
          <tbody>
            <tr data-indicateur="ecart_type"><td>{tr('v2.room.multiIndRegularity')}</td><td>{f1(comparaison.avant.ecart_type_db)} dB</td><td>{f1(comparaison.apres.ecart_type_db)} dB</td></tr>
            <tr data-indicateur="pic"><td>{tr('v2.room.multiIndPeak')}</td><td>{f1(comparaison.avant.pic_max_db)} dB</td><td>{f1(comparaison.apres.pic_max_db)} dB</td></tr>
            <tr data-indicateur="creux"><td>{tr('v2.room.multiIndDip')}</td><td>{f1(comparaison.avant.creux_max_db)} dB</td><td>{f1(comparaison.apres.creux_max_db)} dB</td></tr>
            {#if comparaison.avant.ecart_cible_db != null && comparaison.apres.ecart_cible_db != null}
              <tr data-indicateur="cible"><td>{tr('v2.room.multiIndTarget')}</td><td>{f1(comparaison.avant.ecart_cible_db)} dB</td><td>{f1(comparaison.apres.ecart_cible_db)} dB</td></tr>
            {/if}
          </tbody>
        </table>
        <p class="hint">{tr('v2.room.multiCompareHelp')}</p>
        <CourbeCorrectionPiece titre={tr('v2.room.multiCompareCurve')}
          series={[{ cle: 'mesure', freqs: comparaison.freqs_hz, db: comparaison.avant_db },
                   { cle: 'corrigee', freqs: comparaison.freqs_hz, db: comparaison.apres_db }]} />
      </div>
    {/if}

    <div class="actions">
      <button class="v2-btn" data-multi="nouvelle" disabled={enCours} onclick={nouvelle}>{tr('v2.room.multiNew')}</button>
    </div>
  {/if}
</div>

<style>
  .multi{display:flex; flex-direction:column; gap:10px}
  .err,.warn,.ok{padding:11px 14px; border-radius:10px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5;
    display:flex; flex-direction:column; gap:4px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .ok{color:var(--v2-txt); border:1px solid var(--v2-acc1)}
  .hint{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3); max-width:62ch; margin:0}
  .intro{font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .prepa{display:flex; flex-direction:column; gap:10px}
  .prepa-corps{display:flex; flex-wrap:wrap; gap:14px 24px; align-items:flex-start}
  .prepa-champs{display:flex; flex-direction:column; gap:6px; flex:1; min-width:220px}
  .consigne{margin:0; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5; color:var(--v2-txt)}
  .dim{display:flex; align-items:center; gap:8px; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .dim input{width:64px}
  input[type=number]{background:var(--v2-bg); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:8px; padding:6px 8px; font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .fichier{position:relative; overflow:hidden; cursor:pointer}
  .fichier input{position:absolute; inset:0; opacity:0; cursor:pointer}
  .schema{flex:none; overflow:visible}
  .schema .zone{fill:none; stroke:var(--v2-line2); stroke-dasharray:3 4}
  .schema .pt{fill:var(--v2-bg); stroke:var(--v2-acc-tint); stroke-width:1.5}
  .schema .pt.centre{fill:var(--v2-acc-soft); stroke:var(--v2-acc1); stroke-width:2.5}
  .schema .pt-n{font:600 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); fill:var(--v2-txt)}
  .actions{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .positions{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px}
  .pos{border:1px solid var(--v2-line); border-radius:10px; padding:8px 12px; display:flex; flex-direction:column; gap:4px}
  .pos.rejetee{border-color:var(--v2-danger-bd)}
  .pos-tete{display:flex; align-items:center; gap:10px}
  .num{font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); width:22px; height:22px; border-radius:50%;
    display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--v2-line2); color:var(--v2-txt2)}
  .nom{flex:1; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt)}
  .act{display:flex; gap:8px}
  .verdict{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); display:flex; flex-direction:column; gap:2px}
  .verdict.faux{color:var(--v2-danger)}
  .avancement{display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .avancement progress{width:220px; accent-color:var(--v2-acc1)}
  .val{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .resume{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .avert{margin:0; padding-left:18px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.5; color:var(--v2-txt3)}
  .verif,.comparaison{border-top:1px solid var(--v2-line); padding-top:10px; display:flex; flex-direction:column; gap:8px}
  .titre{font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:600}
  .ab{border-collapse:collapse; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .ab th{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); text-transform:uppercase; letter-spacing:.06em; color:var(--v2-txt3); text-align:left; padding:4px 18px 4px 0}
  .ab td{padding:4px 18px 4px 0; border-top:1px solid var(--v2-line)}
  .ab td:first-child{font-family:var(--v2-sans)}
</style>
