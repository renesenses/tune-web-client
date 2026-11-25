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
    GAIN_EQ_MIN, GAIN_EQ_MAX, CANAUX_MAX, type CourbeGraphique,
  } from '../../../lib/tessPanneaux';
  import { CF_MAX_AMOUNT, CF_MAX_DELAY, CF_COUPURE_MIN, CF_COUPURE_MAX, CF_PENTE_MIN, CF_PENTE_MAX } from '../../../lib/crossfeed';
  import ParametricEq from '../../partages/ParametricEq.svelte';

  let {
    lien,
    verrou = null,
    ecranHistorique = null,
    titreEcranHistorique = '',
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
  const tilt = $derived.by(() => {
    const r = reglagesEq(reglages);
    return r.bands.length === 0 && [r.bass_gain_db, r.mid_gain_db, r.treble_gain_db].some((v) => typeof v === 'number' && v !== 0);
  });
  function poserCourbe(c: CourbeGraphique) { poser(avecCourbeGraphique(reglages, c)); }

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
      {#if courbe}
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
        {#if tilt}<p class="note">{$t('tess.eq.tiltNote' as any)}</p>{/if}
        <div class="bandes" data-tess-bandes={courbe.taille}>
          {#each GRILLES_EQ[courbe.taille] as f, i (f)}
            <label class="bande">
              <span class="val">{gainsAffiches[i] > 0 ? '+' : ''}{gainsAffiches[i]}</span>
              <input type="range" class="vertical" min={GAIN_EQ_MIN} max={GAIN_EQ_MAX} step="0.5" value={gainsAffiches[i]}
                     data-tess-gain={i}
                     aria-label={$t('tess.eq.bandAria' as any).replace('{f}', freqLabel(f))}
                     onchange={(e) => poserCourbe(avecGain(courbe, i, Number((e.currentTarget as HTMLInputElement).value), courbe.droite ? canal : 'gauche'))} />
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
      <ParametricEq bind:bands={bandesP} enabled={!bloque} onchange={surParametrique} />

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
        <label class="case-champ">
          <input type="checkbox" checked={cf.head_shadow_enabled} data-tess-cf="head_shadow_enabled"
                 onchange={(e) => poserCf('head_shadow_enabled', (e.currentTarget as HTMLInputElement).checked)} />
          <span>{$t('tess.cf.headShadow' as any)}</span>
        </label>
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
        <label class="case-champ">
          <input type="checkbox" checked={ra.normalize} data-tess-ra="normalize"
                 onchange={(e) => poser({ ...ra, normalize: (e.currentTarget as HTMLInputElement).checked })} />
          <span>{$t('tess.remap.normalize' as any)}</span>
        </label>
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
  .case-champ{display:inline-flex; align-items:center; gap:8px; color:var(--v2-txt2); cursor:pointer}
  .case-champ input{width:18px; height:18px; accent-color:var(--v2-acc1)}
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
