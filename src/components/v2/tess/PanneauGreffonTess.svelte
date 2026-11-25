<script lang="ts">
  /**
   * TESS W2 — le corps des réglages du greffon choisi (colonne de droite).
   *
   * Un panneau SANS sélecteur de zone : la zone est celle de l'écran TESS, et
   * chaque geste remonte des `settings` complets (`onChange`) que l'écran
   * envoie avec la chaîne entière par `PUT /zones/{id}/tess`. Le serveur
   * recopie ces réglages dans les anciennes clés (écriture croisée de T02) :
   * l'écran Égaliseur, Crossfeed ou Réaffectation montre la même chose.
   *
   * Sobre pour la rc14 : curseurs et champs simples ; l'éditeur paramétrique
   * est celui de l'écran Égaliseur (`ParametricEq`, même calcul de courbe).
   *
   * `verrou` (motif) : greffon Premium sans licence. Tout est en lecture
   * seule — et le serveur, qui fait foi, refuserait de toute façon (402).
   */
  import { t } from '../../../lib/i18n';
  import type { EqBand } from '../../../lib/api';
  import type { LienGreffonTess } from '../../../lib/tess';
  import { freqLabel } from '../../../lib/spectrumScale';
  import { GRILLES_EQ } from '../../../lib/eqGrilles';
  import {
    genrePanneau, reglagesEq, courbeGraphique, avecCourbeGraphique, changerTaille, avecGain, avecBandes,
    reglagesCrossfeedTess, reglagesReaffectation, avecCase, avecDimensions, borner,
    CANAUX_MAX, type CourbeGraphique,
  } from '../../../lib/tessPanneaux';
  import { CF_MAX_AMOUNT, CF_MAX_DELAY, CF_COUPURE_MIN, CF_COUPURE_MAX, CF_PENTE_MIN, CF_PENTE_MAX } from '../../../lib/crossfeed';
  import ParametricEq from '../../partages/ParametricEq.svelte';
  import InterrupteurTess from './InterrupteurTess.svelte';
  import * as api from '../../../lib/api';
  import {
    modeEgaliseur, avecTonalite, avecCourbeSansTonalite, tonaliteDe, environnementNeutre,
    TONALITE_MIN, TONALITE_MAX, BORNES_GAIN_DEFAUT, type BornesGain, type Tonalite,
  } from '../../../lib/tessPanneaux';
  import { messageErreurImport, nomDuFichierPeq, TAILLE_MAX_FICHIER_PEQ, type TextesErreurImport } from '../../../lib/eqImportPeq';

  let {
    lien,
    verrou = null,
    ecranHistorique = null,
    titreEcranHistorique = '',
    bornes = BORNES_GAIN_DEFAUT,
    onConfigurer = null,
    zoneId = null,
    onChange,
    onOuvrirEcran,
  }: {
    lien: LienGreffonTess;
    /** Motif du verrou (Premium sans licence), ou `null`. */
    verrou?: string | null;
    /** Libellé du lien « Réglages avancés » vers l'écran historique, ou `null`
     *  (pas d'écran, autre zone, ou greffon Premium sans licence). */
    ecranHistorique?: string | null;
    /** Le nom de cet écran, en infobulle (« Ouvrir l'écran Égaliseur »). */
    titreEcranHistorique?: string;
    /** Refonte rc14 — bornes de gain publiées par le catalogue (sinon ±12). */
    bornes?: BornesGain;
    /** Refonte rc14 — « Configurer… » d'un greffon sans panneau ici, ou `null`. */
    onConfigurer?: (() => void) | null;
    zoneId?: number | null;
    onChange: (id: string, reglages: Record<string, unknown>) => void;
    onOuvrirEcran?: () => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const genre = $derived(genrePanneau(lien.id));
  const bloque = $derived(verrou != null);

  // ── Brouillon : la vue du geste en cours, recalée sur le serveur ─────────
  // Les réglages affichés sont ceux du SERVEUR (`lien.settings`), sauf pendant
  // un geste : le brouillon garde la valeur que la main vient de poser jusqu'à
  // ce que la réponse du `PUT` revienne.
  let brouillon = $state<Record<string, unknown> | null>(null);
  let dernierRecu = '';
  $effect(() => {
    const recu = JSON.stringify(lien.settings ?? null) + lien.id;
    if (recu !== dernierRecu) { dernierRecu = recu; brouillon = null; }
  });
  const reglages = $derived(brouillon ?? (lien.settings as Record<string, unknown> | null) ?? null);

  function poser(r: Record<string, unknown>) {
    if (bloque) return;
    brouillon = r;
    onChange(lien.id, r);
  }

  // ── Égaliseur graphique ──────────────────────────────────────────────────
  const courbe = $derived(genre === 'eq-graphique' ? courbeGraphique(reglages) : null);
  let canal = $state<'gauche' | 'droite'>('gauche');
  const gainsAffiches = $derived(courbe ? (canal === 'droite' && courbe.droite ? courbe.droite : courbe.gauche) : []);
  function poserCourbe(c: CourbeGraphique) { poser(avecCourbeSansTonalite(reglages, c)); }

  // ── « Courbe » ou « À l'oreille » (refonte rc14, l'ancien Assistant) ─────
  // Le moteur ne joue la tonalité QUE sans bandes : les deux modes
  // s'excluent, et passer de l'un à l'autre efface ce que l'autre portait —
  // on le demande d'abord, sur place.
  let modeChoisi = $state<'courbe' | 'oreille' | null>(null);
  let modeDuLien = '';
  $effect(() => { if (lien.id !== modeDuLien) { modeDuLien = lien.id; modeChoisi = null; confirmerMode = null; } });
  const mode = $derived(modeChoisi ?? modeEgaliseur(reglages));
  let confirmerMode = $state<'courbe' | 'oreille' | null>(null);
  const tonalite = $derived(tonaliteDe(reglages));
  const envHerite = $derived(genre === 'eq-graphique' && !environnementNeutre(reglages));
  function aPerdre(vers: 'courbe' | 'oreille'): boolean {
    if (vers === 'oreille') return reglagesEq(reglages).bands.some((b) => b.gain !== 0 || (b.type ?? 'peak') !== 'peak');
    return tonalite.bass !== 0 || tonalite.mid !== 0 || tonalite.treble !== 0;
  }
  function choisirMode(vers: 'courbe' | 'oreille') {
    if (vers === mode || bloque) return;
    if (aPerdre(vers)) { confirmerMode = vers; return; }
    modeChoisi = vers;
  }
  function confirmer() {
    const vers = confirmerMode;
    confirmerMode = null;
    if (!vers) return;
    modeChoisi = vers;
    if (vers === 'oreille') poser(avecTonalite(reglages, { bass: 0, mid: 0, treble: 0 }));
    else poser(avecCourbeSansTonalite(reglages, { taille: courbe?.taille ?? 10, gauche: Array(courbe?.taille ?? 10).fill(0), droite: null }));
  }
  function poserTonalite(k: keyof Tonalite, v: number) {
    poser(avecTonalite(reglages, { ...tonalite, [k]: v }));
  }
  const signe = (v: number) => (v > 0 ? '+' : '');

  // ── Import d'un fichier PEQ (refonte rc14 : depuis l'ancien Égaliseur) ───
  let fichierPeq = $state<HTMLInputElement | null>(null);
  let importEnCours = $state(false);
  let avisImport = $state<string | null>(null);
  let erreurImport = $state<string | null>(null);
  function textesErreurImport(): TextesErreurImport {
    return {
      aLaLigne: tr('eq.importErrAtLine'),
      aLaBande: tr('eq.importErrAtBand'),
      causes: {
        unrecognized_line: tr('eq.importErrUnrecognizedLine'),
        unknown_filter_type: tr('eq.importErrUnknownFilterType'),
        missing_field: tr('eq.importErrMissingField'),
        invalid_number: tr('eq.importErrInvalidNumber'),
        value_out_of_range: tr('eq.importErrValueOutOfRange'),
        missing_on_off: tr('eq.importErrMissingOnOff'),
        unsupported_channel: tr('eq.importErrUnsupportedChannel'),
        per_channel_preamp: tr('eq.importErrPerChannelPreamp'),
        no_active_filter: tr('eq.importErrNoActiveFilter'),
        too_many_bands: tr('eq.importErrTooManyBands'),
        profile_too_large: tr('eq.importPeqTooLarge'),
        invalid_json: tr('eq.importErrInvalidJson'),
        unsupported_eq_type: tr('eq.importErrUnsupportedEqType'),
        unsupported_slope: tr('eq.importErrUnsupportedSlope'),
      },
    };
  }
  /**
   * Le fichier (AutoEq ParametricEQ, Equalizer APO, OPRA) est analysé par le
   * serveur SANS rien enregistrer (`POST /eq/import/preview`) ; ses bandes
   * remplacent celles du paramétrique de la chaîne. Serveur sans aperçu
   * (404) : l'import d'avant, qui range aussi le fichier dans « Mes presets ».
   */
  async function importerPeq(e: Event) {
    const champ = e.currentTarget as HTMLInputElement;
    const fichier = champ.files?.[0];
    champ.value = '';
    if (!fichier || bloque) return;
    const textes = textesErreurImport();
    const msgKo = tr('eq.importPeqFailed');
    avisImport = null;
    erreurImport = null;
    if (fichier.size > TAILLE_MAX_FICHIER_PEQ) { erreurImport = tr('eq.importPeqTooLarge'); return; }
    importEnCours = true;
    try {
      const texte = await fichier.text();
      const nomFichier = nomDuFichierPeq(fichier.name);
      let bandes: EqBand[];
      try {
        bandes = (await api.previewEqImport({ text: texte, name: nomFichier })).bands;
      } catch (err) {
        if ((err as { status?: number })?.status !== 404) throw err;
        bandes = (await api.importAutoEqPreset({ text: texte, name: nomFichier })).preset.bands;
      }
      bandesP = bandes.map((b) => ({ ...b }));
      surParametrique();
      avisImport = tr('tess.peq.imported').replace('{count}', String(bandes.length)).replace('{name}', nomFichier ?? fichier.name);
    } catch (err) {
      erreurImport = messageErreurImport(err, textes) ?? msgKo;
    } finally {
      importEnCours = false;
    }
  }

  // ── Égaliseur paramétrique (et casque) ───────────────────────────────────
  let bandesP = $state<EqBand[]>([]);
  let bandesRecues = '';
  $effect(() => {
    if (genre !== 'eq-parametrique') return;
    const b = reglagesEq(reglages).bands;
    const k = JSON.stringify(b);
    if (k !== bandesRecues) { bandesRecues = k; bandesP = b.map((x) => ({ ...x })); }
  });
  function surParametrique() {
    bandesRecues = JSON.stringify(bandesP);
    poser(avecBandes(reglages, $state.snapshot(bandesP) as EqBand[]));
  }

  // ── Crossfeed ─────────────────────────────────────────────────────────────
  const cf = $derived(genre === 'crossfeed' ? reglagesCrossfeedTess(reglages) : null);
  function poserCf(champ: string, v: number | boolean) {
    poser({ ...reglagesCrossfeedTess(reglages), [champ]: v });
  }

  // ── Réaffectation ─────────────────────────────────────────────────────────
  const ra = $derived(genre === 'reaffectation' ? reglagesReaffectation(reglages) : null);
  function lireGain(v: string): number | null {
    const s = v.trim().replace(',', '.').replace('−', '-');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const nbBandesPiece = $derived(genre === 'correction-piece' ? reglagesEq(reglages).bands.length : 0);
  const fichierConvolution = $derived.by(() => {
    const r = reglages ?? {};
    const v = (r as any).ir_path ?? (r as any).filter_set;
    return typeof v === 'string' ? v.split(/[\\/]/).pop() ?? v : '';
  });
  const pct = (x: number, max: number) => `${Math.round((x / max) * 100)} %`;
</script>

<div class="panneau-tess" data-tess-panneau={lien.id} data-tess-genre={genre}>
  {#if verrou}
    <p class="verrou" role="note" data-tess-verrou={lien.id}>{verrou}</p>
  {/if}

  <fieldset disabled={bloque}>
    {#if genre === 'eq-graphique'}
      <div class="seg modes" role="group" aria-label={$t('tess.eq.mode' as any)}>
        <button type="button" class:on={mode === 'courbe'} aria-pressed={mode === 'courbe'} data-tess-mode-eq="courbe"
                onclick={() => choisirMode('courbe')}>{$t('tess.eq.modeCurve' as any)}</button>
        <button type="button" class:on={mode === 'oreille'} aria-pressed={mode === 'oreille'} data-tess-mode-eq="oreille"
                onclick={() => choisirMode('oreille')}>{$t('tess.eq.modeEar' as any)}</button>
      </div>
      {#if confirmerMode}
        <div class="confirmer" role="alertdialog" aria-live="polite" data-tess-confirmer-mode={confirmerMode}>
          <p class="note">{confirmerMode === 'oreille' ? $t('tess.eq.switchToEar' as any) : $t('tess.eq.switchToCurve' as any)}</p>
          <div class="pied-ctrl">
            <button type="button" class="petit plein" data-tess-confirmer-oui onclick={confirmer}>{$t('tess.eq.switchContinue' as any)}</button>
            <button type="button" class="petit" onclick={() => (confirmerMode = null)}>{$t('common.cancel' as any)}</button>
          </div>
        </div>
      {/if}
      {#if mode === 'oreille'}
        <p class="note">{$t('tess.eq.earIntro' as any)}</p>
        {#if envHerite}<p class="note avis-env" role="note" data-tess-env-herite>{$t('tess.eq.envReset' as any)}</p>{/if}
        <div class="champs" data-tess-oreille>
          {#each [['bass', 'v2.prof.bass'], ['mid', 'v2.prof.mid'], ['treble', 'v2.prof.treble']] as [k, cle] (k)}
            {@const v = tonalite[k as keyof Tonalite]}
            <label class="champ">
              <span class="lbl">{tr(cle)} <b>{signe(v)}{v} dB</b></span>
              <input type="range" min={TONALITE_MIN} max={TONALITE_MAX} step="0.5" value={v} data-tess-tonalite={k}
                     onchange={(e) => poserTonalite(k as keyof Tonalite, Number((e.currentTarget as HTMLInputElement).value))} />
            </label>
          {/each}
        </div>
      {:else if courbe}
        <div class="ligne-ctrl">
          <span class="lbl">{$t('tess.eq.resolution' as any)}</span>
          <div class="seg" role="group" aria-label={$t('tess.eq.resolution' as any)}>
            {#each [10, 15, 31] as n (n)}
              <button type="button" class:on={courbe.taille === n} data-tess-taille={n} aria-pressed={courbe.taille === n}
                      onclick={() => poserCourbe(changerTaille(courbe, n))}>{n}</button>
            {/each}
          </div>
          {#if courbe.droite}
            <div class="seg" role="group" aria-label={$t('tess.eq.channel' as any)}>
              <button type="button" class:on={canal === 'gauche'} onclick={() => (canal = 'gauche')}>{$t('tess.eq.left' as any)}</button>
              <button type="button" class:on={canal === 'droite'} onclick={() => (canal = 'droite')}>{$t('tess.eq.right' as any)}</button>
            </div>
          {/if}
        </div>
        <div class="bandes" data-tess-bandes={courbe.taille}>
          {#each GRILLES_EQ[courbe.taille] as f, i (f)}
            <label class="bande">
              <span class="val">{gainsAffiches[i] > 0 ? '+' : ''}{gainsAffiches[i]}</span>
              <input type="range" class="vertical" min={bornes.min} max={bornes.max} step="0.5" value={gainsAffiches[i]}
                     data-tess-gain={i}
                     aria-label={$t('tess.eq.bandAria' as any).replace('{f}', freqLabel(f))}
                     onchange={(e) => poserCourbe(avecGain(courbe, i, Number((e.currentTarget as HTMLInputElement).value), courbe.droite ? canal : 'gauche', bornes))} />
              <span class="f">{freqLabel(f)}</span>
            </label>
          {/each}
        </div>
        <div class="pied-ctrl">
          <button type="button" class="petit" data-tess-plat
                  onclick={() => poserCourbe({ ...courbe, gauche: courbe.gauche.map(() => 0), droite: courbe.droite ? courbe.droite.map(() => 0) : null })}>
            {$t('tess.eq.flat' as any)}
          </button>
        </div>
      {:else}
        <p class="note" data-tess-courbe-libre>{$t('tess.eq.notGraphic' as any)}</p>
      {/if}

    {:else if genre === 'eq-parametrique'}
      <!-- Refonte rc14 (demande 7) : édition dans la liste et à la souris, sans
           verrou « Modifier », échelle adaptative, bornes publiées. -->
      <ParametricEq bind:bands={bandesP} enabled={!bloque} onchange={surParametrique}
                    editeurSelection={false} verrouEdition={false} gainMin={bornes.min} gainMax={bornes.max} />
      <div class="pied-ctrl">
        <input type="file" accept=".txt,.json,text/plain,application/json" class="cache" bind:this={fichierPeq}
               onchange={importerPeq} data-tess-fichier-peq />
        <button type="button" class="petit" data-tess-importer-peq disabled={bloque || importEnCours}
                onclick={() => fichierPeq?.click()}>{$t('tess.peq.import' as any)}</button>
      </div>
      {#if avisImport}<p class="note" role="status" data-tess-import-ok>{avisImport}</p>{/if}
      {#if erreurImport}<p class="note erreur-import" role="alert" data-tess-import-erreur>{erreurImport}</p>{/if}

    {:else if genre === 'correction-piece'}
      <p class="note" data-tess-piece>{$t('tess.room.computed' as any).replace('{n}', String(nbBandesPiece))}</p>

    {:else if genre === 'crossfeed' && cf}
      <div class="champs">
        <label class="champ">
          <span class="lbl">{$t('tess.cf.amount' as any)} <b>{pct(cf.amount, CF_MAX_AMOUNT)}</b></span>
          <input type="range" min="0" max={CF_MAX_AMOUNT} step="0.01" value={cf.amount} data-tess-cf="amount"
                 onchange={(e) => poserCf('amount', Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <label class="champ">
          <span class="lbl">{$t('tess.cf.delay' as any)} <b>{cf.delay_ms.toFixed(1)} ms</b></span>
          <input type="range" min="0" max={CF_MAX_DELAY} step="0.1" value={cf.delay_ms} data-tess-cf="delay_ms"
                 onchange={(e) => poserCf('delay_ms', Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <InterrupteurTess data-tess-cf="head_shadow_enabled" checked={cf.head_shadow_enabled} disabled={bloque}
                          texte={$t('tess.cf.headShadow' as any)} label={$t('tess.cf.headShadow' as any)}
                          onToggle={(v) => poserCf('head_shadow_enabled', v)} />
        {#if cf.head_shadow_enabled}
          <label class="champ">
            <span class="lbl">{$t('tess.cf.cutoff' as any)} <b>{Math.round(cf.cutoff_hz)} Hz</b></span>
            <input type="number" min={CF_COUPURE_MIN} max={CF_COUPURE_MAX} step="10" value={Math.round(cf.cutoff_hz)} data-tess-cf="cutoff_hz"
                   onchange={(e) => {
                     const v = Number((e.currentTarget as HTMLInputElement).value);
                     if (Number.isFinite(v)) poserCf('cutoff_hz', borner(v, CF_COUPURE_MIN, CF_COUPURE_MAX));
                   }} />
          </label>
          <label class="champ">
            <span class="lbl">{$t('tess.cf.slope' as any)} <b>{cf.slope_db_per_octave} dB</b></span>
            <input type="range" min={CF_PENTE_MIN} max={CF_PENTE_MAX} step="0.5" value={cf.slope_db_per_octave} data-tess-cf="slope_db_per_octave"
                   onchange={(e) => poserCf('slope_db_per_octave', Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
        {/if}
      </div>

    {:else if genre === 'reaffectation' && ra}
      <div class="ligne-ctrl">
        <label class="mini">
          <span class="lbl">{$t('tess.remap.inputs' as any)}</span>
          <input type="number" min="1" max={CANAUX_MAX} value={ra.inputs} data-tess-ra="inputs"
                 onchange={(e) => poser(avecDimensions(reglages, Number((e.currentTarget as HTMLInputElement).value), ra.outputs))} />
        </label>
        <label class="mini">
          <span class="lbl">{$t('tess.remap.outputs' as any)}</span>
          <input type="number" min="1" max={CANAUX_MAX} value={ra.outputs} data-tess-ra="outputs"
                 onchange={(e) => poser(avecDimensions(reglages, ra.inputs, Number((e.currentTarget as HTMLInputElement).value)))} />
        </label>
        <InterrupteurTess data-tess-ra="normalize" checked={ra.normalize} disabled={bloque}
                          texte={$t('tess.remap.normalize' as any)} label={$t('tess.remap.normalize' as any)}
                          onToggle={(v) => poser({ ...ra, normalize: v })} />
      </div>
      <p class="note">{$t('tess.remap.hint' as any)}</p>
      <div class="matrice-defile">
        <table class="matrice" data-tess-matrice>
          <thead>
            <tr><th></th>{#each Array(ra.inputs) as _, i (i)}<th scope="col">{$t('tess.remap.in' as any).replace('{n}', String(i + 1))}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each ra.gains_db as ligne, o (o)}
              <tr>
                <th scope="row">{$t('tess.remap.out' as any).replace('{n}', String(o + 1))}</th>
                {#each ligne as g, i (i)}
                  <td>
                    <input type="text" inputmode="decimal" value={g == null ? '' : String(g)} placeholder="—"
                           data-tess-case-ra={`${o}-${i}`}
                           aria-label={$t('tess.remap.cellAria' as any).replace('{o}', String(o + 1)).replace('{i}', String(i + 1))}
                           onchange={(e) => poser(avecCase(reglages, o, i, lireGain((e.currentTarget as HTMLInputElement).value)))} />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

    {:else if genre === 'convolution'}
      <p class="note" data-tess-convolution>
        {fichierConvolution ? $t('tess.conv.filter' as any).replace('{file}', fichierConvolution) : $t('tess.conv.none' as any)}
      </p>

    {:else if genre === 'vide'}
      <p class="note" data-tess-vide>{$t('tess.noSettings' as any)}</p>

    {:else}
      <p class="note" data-tess-ancien-ecran>{$t('tess.ownScreen' as any)}</p>
      {#if onConfigurer}
        <!-- Refonte rc14 (demande 9) : sa configuration s'ouvre dans la popup. -->
        <div class="pied-ctrl">
          <button type="button" class="petit plein" data-tess-configurer={lien.id} onclick={onConfigurer}>{$t('tess.configure' as any)}</button>
        </div>
      {/if}
    {/if}
  </fieldset>

  {#if ecranHistorique && onOuvrirEcran}
    <div class="pied-ctrl">
      <button type="button" class="petit lien" data-tess-ecran-historique title={titreEcranHistorique || undefined}
              onclick={onOuvrirEcran}>{ecranHistorique} →</button>
    </div>
  {/if}
</div>

<style>
  .panneau-tess{display:flex; flex-direction:column; gap:12px; min-width:0}
  fieldset{border:0; margin:0; padding:0; min-width:0; display:flex; flex-direction:column; gap:12px}
  fieldset:disabled{opacity:.55}
  .verrou{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2)}
  .note{margin:0; color:var(--v2-txt2); line-height:1.5; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .ligne-ctrl{display:flex; flex-wrap:wrap; gap:12px; align-items:center}
  .lbl{color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .lbl b{color:var(--v2-txt); font-weight:600; margin-left:4px}
  .seg{display:inline-flex; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); overflow:hidden}
  .seg button{background:transparent; border:0; color:var(--v2-txt2); font:inherit; padding:5px 12px; cursor:pointer}
  .seg button.on{background:var(--v2-acc-soft); color:var(--v2-txt); font-weight:600}
  .bandes{display:flex; gap:4px; overflow-x:auto; padding-bottom:6px}
  .bande{display:flex; flex-direction:column; align-items:center; gap:4px; min-width:30px}
  .vertical{writing-mode:vertical-lr; direction:rtl; height:150px; width:22px; accent-color:var(--v2-acc1)}
  .val,.f{font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .champs{display:flex; flex-direction:column; gap:12px; max-width:460px}
  .champ{display:flex; flex-direction:column; gap:6px}
  .champ input[type=range]{accent-color:var(--v2-acc1)}
  .champ input[type=number],.mini input{background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:8px;
    color:var(--v2-txt); font:inherit; padding:6px 8px; width:110px}
  .mini{display:inline-flex; align-items:center; gap:8px}
  .mini input{width:64px}
  .modes{align-self:flex-start}
  .confirmer{display:flex; flex-direction:column; gap:8px; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .avis-env{padding:8px 10px; border-radius:8px; border:1px dashed var(--v2-line2)}
  .petit.plein{background:var(--v2-acc1); color:var(--v2-on-acc); border-color:var(--v2-acc1); font-weight:600}
  .cache{display:none}
  .erreur-import{color:var(--v2-danger)}
  .matrice-defile{overflow-x:auto}
  .matrice{border-collapse:collapse}
  .matrice th{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); padding:4px 6px; text-align:center; white-space:nowrap}
  .matrice td{padding:2px}
  .matrice input{width:58px; text-align:center; background:var(--v2-surface2); border:1px solid var(--v2-line); border-radius:6px;
    color:var(--v2-txt); font:inherit; padding:5px 4px}
  .pied-ctrl{display:flex; justify-content:flex-start; gap:8px}
  .petit{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); border-radius:var(--v2-r-pill);
    padding:6px 12px; cursor:pointer; font:inherit; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .petit.lien{border-color:transparent; color:var(--v2-acc1); padding-left:0}
</style>
