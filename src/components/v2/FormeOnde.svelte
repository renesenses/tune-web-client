<script lang="ts">
  /**
   * La FORME D'ONDE d'une piste, section de la fiche technique — fil du
   * forum 2793 (Didier), décision de Bertrand du 13/11/2026.
   *
   * Par canal : les crêtes (min / max, bande claire), la RMS (bande foncée)
   * et les colonnes écrêtées (en rouge), sur une échelle linéaire ou en dB,
   * repère 0 dBFS aux bords. En chiffres : crête maximale, RMS globale,
   * facteur de crête (crête − RMS) et échantillons écrêtés, par canal et en tout.
   * Zoom : boutons ×2 / ÷2, ou glisser sur le tracé pour choisir une plage ;
   * la plage est redemandée au serveur après un court anti-rebond (des clics
   * rapprochés ne lancent qu'un calcul), et en attendant ou à défaut
   * découpée dans la forme de la piste entière. Aucun son.
   *
   * Sonie EBU R128 (réponse 11020) : la sonie intégrée (LUFS) et la crête
   * vraie (dBTP) que la passe ReplayGain du serveur a déjà mesurées, quand
   * elles existent — aucune mesure nouvelle.
   *
   * Données : `lib/formeOnde` (`GET /library/tracks/{id}/forme-onde`).
   */
  import { t, locale } from '../../lib/i18n';
  import { dateLisible } from '../../lib/ficheTechnique';
  import {
    chargerFormeOnde, ErreurFormeOnde, graduationsOnde, cheminBande, colonnesEcretees, cheminEcretees, ANTI_REBOND_ZOOM_MS,
    trancher, zoomer, nombreDb, tempsLisible,
    type FormeOnde, type SectionFormeOnde, type Echelle, type Plage, type GenreErreurFormeOnde,
  } from '../../lib/formeOnde';
  import { libelleDb } from '../../lib/spectrogramme';

  interface Props {
    trackId: number;
    section?: SectionFormeOnde | null;
    titre?: string;
  }
  let { trackId, section = null, titre = '' }: Props = $props();

  const LARGEUR = 1000;
  const HAUTEUR = 120;

  type Etat =
    | { v: 'repos' }
    | { v: 'chargement' }
    | { v: 'pret'; forme: FormeOnde }
    | { v: 'erreur'; genre: GenreErreurFormeOnde };
  // `raw` : des milliers de nombres, jamais modifiés en place ; et `plage`
  // se compare par identité au retour du serveur.
  let etat = $state.raw<Etat>({ v: 'repos' });
  let echelle = $state<Echelle>('lineaire');
  let plage = $state.raw<Plage | null>(null);
  let detail = $state.raw<FormeOnde | null>(null);
  let selection = $state<{ x0: number; x1: number } | null>(null);
  let controle: AbortController | null = null;
  let controleDetail: AbortController | null = null;
  let minuterieDetail: ReturnType<typeof setTimeout> | null = null;

  const langue = $derived($locale ?? 'fr');
  const complete = $derived(etat.v === 'pret' ? etat.forme : null);
  const vue = $derived.by(() => {
    if (!complete) return null;
    if (!plage) return complete;
    return detail ?? trancher(complete, plage);
  });
  const graduations = $derived(graduationsOnde(echelle));
  const sonie = $derived(section?.sonie ?? null);
  const sonieDatee = $derived(dateLisible(sonie?.mesure_le, langue));

  async function charger() {
    controle?.abort();
    const c = new AbortController();
    controle = c;
    etat = { v: 'chargement' };
    plage = null;
    detail = null;
    try {
      const f = await chargerFormeOnde(trackId, { signal: c.signal });
      if (!c.signal.aborted) etat = { v: 'pret', forme: f };
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      etat = { v: 'erreur', genre: e instanceof ErreurFormeOnde ? e.genre : 'reseau' };
    }
  }

  function annulerDetail() {
    if (minuterieDetail) clearTimeout(minuterieDetail);
    minuterieDetail = null;
    controleDetail?.abort();
    controleDetail = null;
  }

  /**
   * Affiche tout de suite la découpe de la plage, et ne la demande au
   * serveur qu'après l'anti-rebond : cinq clics « ×2 » d'affilée ne lancent
   * qu'un décodage, celui de la dernière plage.
   */
  function chargerPlage(p: Plage | null) {
    annulerDetail();
    plage = p;
    detail = null;
    if (!p) return;
    minuterieDetail = setTimeout(() => {
      minuterieDetail = null;
      void demanderPlage(p);
    }, ANTI_REBOND_ZOOM_MS);
  }

  async function demanderPlage(p: Plage) {
    const c = new AbortController();
    controleDetail = c;
    try {
      const f = await chargerFormeOnde(trackId, { plage: p, signal: c.signal });
      if (!c.signal.aborted && plage === p) detail = f;
    } catch {
      // Repli : la plage reste découpée dans la forme de la piste entière.
    }
  }

  function zoom(facteur: number) {
    if (!complete) return;
    chargerPlage(zoomer(plage, facteur, complete.duree_s));
  }

  $effect(() => {
    void trackId;
    if (section?.etat === 'a_jour') void charger();
    return () => { controle?.abort(); annulerDetail(); };
  });

  function nomDuCanal(canal: number, canaux: number): string {
    if (canaux === 2) return $t((canal === 0 ? 'fiche.waveform.left' : 'fiche.waveform.right') as any);
    if (canaux === 1) return $t('fiche.waveform.mono' as any);
    return $t('fiche.waveform.channelN' as any).replace('{n}', String(canal + 1));
  }

  const dbfs = (v: number | null) => $t('fiche.waveform.dbfs' as any).replace('{n}', nombreDb(v, langue));
  const db = (v: number | null) => $t('fiche.waveform.db' as any).replace('{n}', nombreDb(v, langue));
  const entier = (n: number) => new Intl.NumberFormat(langue).format(n);

  // Glisser pour choisir une plage : fraction de la largeur du tracé.
  function fraction(e: PointerEvent): number {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    if (!r.width) return 0;
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  function appui(e: PointerEvent) {
    if (!vue) return;
    const x = fraction(e);
    selection = { x0: x, x1: x };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function glisse(e: PointerEvent) {
    if (selection) selection = { ...selection, x1: fraction(e) };
  }
  function relache() {
    const s = selection;
    selection = null;
    if (!s || !vue || !complete) return;
    const a = Math.min(s.x0, s.x1);
    const b = Math.max(s.x0, s.x1);
    if (b - a < 0.01) return;
    const debut = vue.debut_s + a * vue.duree_s;
    const fin = vue.debut_s + b * vue.duree_s;
    chargerPlage(fin - debut >= complete.duree_s - 1e-6 ? null : { debut, fin });
  }
</script>

<h3>{$t('fiche.section.waveform' as any)}</h3>
<p class="aide">{$t('fiche.waveform.help' as any)}</p>

{#if sonie && (sonie.integree_lufs != null || sonie.crete_vraie_dbtp != null)}
  <div class="sonie" data-sonie>
    <h4>{$t('fiche.waveform.loudness' as any)}</h4>
    <dl>
      {#if sonie.integree_lufs != null}
        <dt>{$t('fiche.waveform.integrated' as any)}</dt>
        <dd>{$t('fiche.waveform.lufs' as any).replace('{n}', nombreDb(sonie.integree_lufs, langue))}</dd>
      {/if}
      {#if sonie.crete_vraie_dbtp != null}
        <dt>{$t('fiche.waveform.truePeak' as any)}</dt>
        <dd class:alerte={sonie.crete_vraie_dbtp > 0}>{$t('fiche.waveform.dbtp' as any).replace('{n}', nombreDb(sonie.crete_vraie_dbtp, langue))}</dd>
      {/if}
    </dl>
    <p class="aide">{$t('fiche.waveform.loudnessHelp' as any)}</p>
    {#if sonieDatee}<p class="date">{$t('fiche.measuredOn' as any).replace('{date}', sonieDatee)}</p>{/if}
  </div>
{/if}

{#if etat.v === 'chargement'}
  <p class="etat" role="status" aria-live="polite">{$t('fiche.waveform.loading' as any)}</p>
{:else if etat.v === 'erreur'}
  {#if etat.genre === 'indisponible'}
    <p class="etat" role="status">{$t('fiche.waveform.unavailable' as any)}</p>
  {:else if etat.genre === 'introuvable'}
    <p class="etat" role="status">{$t('fiche.trackNotFound' as any)}</p>
  {:else if etat.genre === 'non-locale'}
    <p class="etat" role="status">{$t('fiche.waveform.notLocal' as any)}</p>
  {:else}
    <p class="etat" role="alert">{$t('fiche.waveform.failed' as any)}</p>
    <button class="bouton" onclick={charger}>{$t('fiche.waveform.compute' as any)}</button>
  {/if}
{:else if etat.v === 'repos'}
  <button class="bouton" onclick={charger}>{$t('fiche.waveform.compute' as any)}</button>
{:else if complete && vue}
  <div class="outils" role="toolbar" aria-label={$t('fiche.waveform.tools' as any)}>
    <div class="groupe" role="group" aria-label={$t('fiche.waveform.scale' as any)}>
      <button class="puce" aria-pressed={echelle === 'lineaire'} onclick={() => (echelle = 'lineaire')}>{$t('fiche.waveform.linear' as any)}</button>
      <button class="puce" aria-pressed={echelle === 'db'} onclick={() => (echelle = 'db')}>{$t('fiche.waveform.logDb' as any)}</button>
    </div>
    <div class="groupe">
      <button class="puce" data-zoom="plus" onclick={() => zoom(2)}>{$t('fiche.waveform.zoomIn' as any)}</button>
      <button class="puce" data-zoom="moins" disabled={!plage} onclick={() => zoom(0.5)}>{$t('fiche.waveform.zoomOut' as any)}</button>
      <button class="puce" data-zoom="tout" disabled={!plage} onclick={() => chargerPlage(null)}>{$t('fiche.waveform.zoomAll' as any)}</button>
    </div>
  </div>

  {#each vue.voies as voie (voie.canal)}
    {@const ecretees = colonnesEcretees(voie, vue.seuil_ecretage_dbfs ?? 0)}
    <div class="canal" data-canal={voie.canal}>
      <span class="nom">{nomDuCanal(voie.canal, vue.canaux)}</span>
      <div class="trace">
        <div class="echelle" aria-hidden="true">
          {#each graduations as g (g.db)}
            <span style:top={`${((1 - g.y) / 2) * 100}%`}>{libelleDb(g.db)}</span>
          {/each}
        </div>
        <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} preserveAspectRatio="none" role="img"
          aria-label={$t('fiche.waveform.alt' as any).replace('{title}', titre).replace('{channel}', nomDuCanal(voie.canal, vue.canaux))}
          onpointerdown={appui} onpointermove={glisse} onpointerup={relache} onpointercancel={() => (selection = null)}>
          {#each graduations as g (g.db)}
            <line class={g.db === 0 ? 'zero' : 'grille'} x1="0" x2={LARGEUR} y1={HAUTEUR / 2 - g.y * HAUTEUR / 2} y2={HAUTEUR / 2 - g.y * HAUTEUR / 2} />
            <line class={g.db === 0 ? 'zero' : 'grille'} x1="0" x2={LARGEUR} y1={HAUTEUR / 2 + g.y * HAUTEUR / 2} y2={HAUTEUR / 2 + g.y * HAUTEUR / 2} />
          {/each}
          <line class="centre" x1="0" x2={LARGEUR} y1={HAUTEUR / 2} y2={HAUTEUR / 2} />
          <path class="crete" d={cheminBande(voie.max, voie.min, LARGEUR, HAUTEUR, echelle)} />
          <path class="rms" d={cheminBande(voie.rms, voie.rms.map((r) => -r), LARGEUR, HAUTEUR, echelle)} />
          {#if ecretees.length}
            <path class="ecrete" d={cheminEcretees(ecretees, voie.max.length, LARGEUR, HAUTEUR)} />
          {/if}
          {#if selection}
            <rect class="selection" x={Math.min(selection.x0, selection.x1) * LARGEUR} y="0"
              width={Math.abs(selection.x1 - selection.x0) * LARGEUR} height={HAUTEUR} />
          {/if}
        </svg>
      </div>
    </div>
  {/each}
  <div class="temps" aria-hidden="true">
    <span>{tempsLisible(vue.debut_s, vue.duree_s < 10)}</span>
    <span>{tempsLisible(vue.debut_s + vue.duree_s, vue.duree_s < 10)}</span>
  </div>
  <p class="date">{$t('fiche.waveform.legend' as any)}</p>

  <table class="chiffres">
    <thead>
      <tr>
        <th scope="col">{$t('fiche.waveform.channel' as any)}</th>
        <th scope="col">{$t('fiche.waveform.peak' as any)}</th>
        <th scope="col">{$t('fiche.waveform.rms' as any)}</th>
        <th scope="col">{$t('fiche.waveform.plr' as any)}</th>
        <th scope="col">{$t('fiche.waveform.clipped' as any)}</th>
      </tr>
    </thead>
    <tbody>
      {#each complete.voies as voie (voie.canal)}
        <tr data-chiffres={voie.canal}>
          <th scope="row">{nomDuCanal(voie.canal, complete.canaux)}</th>
          <td>{dbfs(voie.crete_dbfs)}</td>
          <td>{dbfs(voie.rms_dbfs)}</td>
          <td>{db(voie.facteur_crete_db)}</td>
          <td class:alerte={voie.ecretes > 0}>{entier(voie.ecretes)}</td>
        </tr>
      {/each}
      {#if complete.canaux > 1}
        <tr data-chiffres="global">
          <th scope="row">{$t('fiche.waveform.all' as any)}</th>
          <td>{dbfs(complete.global.crete_dbfs)}</td>
          <td>{dbfs(complete.global.rms_dbfs)}</td>
          <td>{db(complete.global.facteur_crete_db)}</td>
          <td class:alerte={complete.global.ecretes > 0}>{entier(complete.global.ecretes)}</td>
        </tr>
      {/if}
    </tbody>
  </table>
{/if}

<style>
  h3{font:600 calc(13.5px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt, var(--tune-text, inherit)); margin-bottom:6px}
  .aide,.date{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3, var(--tune-text-secondary, inherit)); margin:4px 0}
  .etat{font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt3, inherit); padding:8px 0}
  .outils{display:flex; flex-wrap:wrap; gap:8px 14px; margin:8px 0}
  .groupe{display:flex; gap:4px}
  .puce{border:1px solid var(--v2-line2, var(--tune-border, #333)); background:transparent; color:var(--v2-txt2, inherit);
    border-radius:999px; padding:3px 10px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); cursor:pointer}
  .puce[aria-pressed="true"]{border-color:var(--v2-acc1, var(--tune-accent, currentColor)); color:var(--v2-acc1, var(--tune-accent, currentColor))}
  .puce:disabled{opacity:.45; cursor:default}
  .puce:focus-visible{outline:2px solid var(--v2-acc1, var(--tune-accent, currentColor)); outline-offset:2px}
  .sonie{margin:6px 0 8px}
  h4{font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt2, inherit); margin:0 0 4px}
  .sonie dl{display:grid; grid-template-columns:max-content 1fr; gap:3px 14px; margin:0; font-variant-numeric:tabular-nums}
  .sonie dt{color:var(--v2-txt3, var(--tune-text-secondary, inherit))}
  .sonie dd{margin:0}
  .canal{margin:4px 0}
  .nom{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3, inherit)}
  .trace{position:relative; padding-left:30px}
  .echelle{position:absolute; left:0; top:0; bottom:0; width:28px; font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono, monospace);
    color:var(--v2-txt3, inherit); text-align:right}
  .echelle span{position:absolute; right:2px; transform:translateY(-50%); line-height:1}
  svg{display:block; width:100%; height:120px; background:var(--v2-bg, #0e0e10); border-radius:6px; touch-action:pan-y; cursor:crosshair}
  .grille{stroke:var(--v2-line2, #333); stroke-width:1; vector-effect:non-scaling-stroke; stroke-dasharray:3 4}
  .zero{stroke:var(--v2-txt3, #888); stroke-width:1; vector-effect:non-scaling-stroke}
  .centre{stroke:var(--v2-line2, #333); stroke-width:1; vector-effect:non-scaling-stroke}
  .crete{fill:var(--v2-acc1, var(--tune-accent, #6cc)); opacity:.45}
  .rms{fill:var(--v2-acc1, var(--tune-accent, #6cc)); opacity:.95}
  .ecrete{fill:var(--v2-danger, #e5484d); opacity:.85}
  .selection{fill:var(--v2-txt, #fff); opacity:.15}
  .temps{display:flex; justify-content:space-between; padding-left:30px; font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono, monospace); color:var(--v2-txt3, inherit)}
  .chiffres{width:100%; border-collapse:collapse; margin-top:8px; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .chiffres th,.chiffres td{text-align:right; padding:3px 6px; border-bottom:1px solid var(--v2-line2, var(--tune-border, #333)); font-variant-numeric:tabular-nums}
  .chiffres th:first-child{text-align:left}
  .chiffres thead th{color:var(--v2-txt3, inherit); font-weight:500}
  .alerte{color:var(--v2-danger, #e5484d); font-weight:600}
  .bouton{margin-top:8px; border:1px solid var(--v2-acc1, var(--tune-accent, currentColor)); background:transparent;
    color:var(--v2-acc1, var(--tune-accent, currentColor)); border-radius:999px; padding:6px 14px;
    font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); cursor:pointer}
  .bouton:hover{background:var(--v2-hover, rgba(255,255,255,.06))}
  .bouton:focus-visible{outline:2px solid var(--v2-acc1, var(--tune-accent, currentColor)); outline-offset:2px}
</style>
