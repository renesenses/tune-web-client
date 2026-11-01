<script lang="ts">
  import { t } from '../../lib/i18n';
  import { freqLabel } from '../../lib/spectrumScale';
  import {
    choixDepuisBande,
    canalDepuisChoix,
    bandesDuCanal,
    reglageAsymetrique,
  } from '../../lib/eqChannel';
  import type { EqBand } from '../../lib/api';
  import { lireDecimal, borner, arrondir } from '../../lib/saisieDecimale';

  // Éditeur paramétrique : jusqu'à 31 bandes libres (fréquence, gain, Q, type),
  // éditées en glissant les points sur la courbe de réponse RÉELLE — calculée
  // avec les mêmes biquads RBJ que le serveur (tune-core/src/audio/eq.rs), pas
  // une interpolation cosmétique.
  let {
    bands = $bindable<EqBand[]>([]),
    enabled = true,
    maxBands = 31,
    onchange,
  }: {
    bands: EqBand[];
    enabled?: boolean;
    maxBands?: number;
    onchange?: () => void;
  } = $props();

  const W = 640;
  const H = 240;
  const F_MIN = 20;
  const F_MAX = 20000;
  const DB_RANGE = 15; // ±15 dB d'affichage (les gains restent bornés ±12)
  const MIN_GAIN = -12;
  const MAX_GAIN = 12;
  const SR = 48000; // affichage seulement — la forme de la réponse est identique

  const BAND_TYPES = ['peak', 'low_shelf', 'high_shelf', 'low_pass', 'high_pass', 'notch'] as const;

  let selected = $state<number | null>(null);
  let dragging = $state(false);

  function xOf(f: number): number {
    return (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * W;
  }
  function fOf(x: number): number {
    return F_MIN * Math.pow(F_MAX / F_MIN, Math.min(1, Math.max(0, x / W)));
  }
  function yOf(db: number): number {
    return H / 2 - (db / DB_RANGE) * (H / 2 - 10);
  }
  function dbOf(y: number): number {
    return ((H / 2 - y) / (H / 2 - 10)) * DB_RANGE;
  }

  // --- Biquads RBJ (miroir de eq.rs) ---
  type Coeffs = { b0: number; b1: number; b2: number; a1: number; a2: number };

  function coeffs(band: EqBand): Coeffs {
    const f = band.freq;
    const gain = band.gain;
    const q = band.q && band.q > 0 ? band.q : 1.0;
    const a = Math.pow(10, gain / 40);
    const w0 = (2 * Math.PI * f) / SR;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (band.type ?? 'peak') {
      case 'low_shelf': {
        const s = Math.sqrt(a) * sw * Math.SQRT2 / 2 * 2; // 2*sqrt(a)*alpha with S=1
        b0 = a * (a + 1 - (a - 1) * cw + s);
        b1 = 2 * a * (a - 1 - (a + 1) * cw);
        b2 = a * (a + 1 - (a - 1) * cw - s);
        a0 = a + 1 + (a - 1) * cw + s;
        a1 = -2 * (a - 1 + (a + 1) * cw);
        a2 = a + 1 + (a - 1) * cw - s;
        break;
      }
      case 'high_shelf': {
        const s = Math.sqrt(a) * sw * Math.SQRT2 / 2 * 2;
        b0 = a * (a + 1 + (a - 1) * cw + s);
        b1 = -2 * a * (a - 1 + (a + 1) * cw);
        b2 = a * (a + 1 + (a - 1) * cw - s);
        a0 = a + 1 - (a - 1) * cw + s;
        a1 = 2 * (a - 1 - (a + 1) * cw);
        a2 = a + 1 - (a - 1) * cw - s;
        break;
      }
      case 'low_pass':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'high_pass':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      default: // peak
        b0 = 1 + alpha * a; b1 = -2 * cw; b2 = 1 - alpha * a;
        a0 = 1 + alpha / a; a1 = -2 * cw; a2 = 1 - alpha / a;
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  function magnitudeDb(c: Coeffs, f: number): number {
    const w = (2 * Math.PI * f) / SR;
    const cos1 = Math.cos(w), cos2 = Math.cos(2 * w);
    const sin1 = Math.sin(w), sin2 = Math.sin(2 * w);
    const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
    const ni = -(c.b1 * sin1 + c.b2 * sin2);
    const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
    const di = -(c.a1 * sin1 + c.a2 * sin2);
    const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
    return 20 * Math.log10(Math.max(mag, 1e-9));
  }

  // Une courbe PAR CANAL. Sommer toutes les bandes sans regarder leur canal
  // traçait, pour un réglage asymétrique, une courbe qui ne décrivait NI la
  // gauche NI la droite — le son était juste, l'écran mentait. Quand tout est
  // symétrique les deux tracés se superposent exactement, et l'écran est celui
  // qu'on a toujours connu.
  function cheminPour(bandesDuTrace: EqBand[]): string {
    if (!bandesDuTrace.length) return `M 0 ${H / 2} L ${W} ${H / 2}`;
    const cs = bandesDuTrace.map(coeffs);
    const pts: string[] = [];
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const f = fOf((i / N) * W);
      let db = 0;
      for (const c of cs) db += magnitudeDb(c, f);
      pts.push(`${((i / N) * W).toFixed(1)} ${yOf(Math.max(-DB_RANGE, Math.min(DB_RANGE, db))).toFixed(1)}`);
    }
    return 'M ' + pts.join(' L ');
  }

  let cheminGauche = $derived(cheminPour(bandesDuCanal(bands, 0)));
  let cheminDroite = $derived(cheminPour(bandesDuCanal(bands, 1)));
  let asymetrique = $derived(reglageAsymetrique(bands));

  const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

  function notify() {
    bands = [...bands];
    onchange?.();
  }

  function addBandAt(x: number, y: number) {
    if (bands.length >= maxBands) return;
    const freq = Math.round(fOf(x));
    const gain = Math.round(Math.max(MIN_GAIN, Math.min(MAX_GAIN, dbOf(y))) * 2) / 2;
    bands.push({ freq, gain, q: 1.41, type: 'peak' } as EqBand);
    selected = bands.length - 1;
    notify();
  }

  let svgEl: SVGSVGElement;

  function svgPoint(e: PointerEvent): { x: number; y: number } {
    const r = svgEl.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function onPointDown(i: number, e: PointerEvent) {
    selected = i;
    dragging = true;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointMove(e: PointerEvent) {
    if (!dragging || selected === null) return;
    const { x, y } = svgPoint(e);
    const b = bands[selected];
    b.freq = Math.round(Math.max(F_MIN, Math.min(F_MAX, fOf(x))));
    b.gain = Math.round(Math.max(MIN_GAIN, Math.min(MAX_GAIN, dbOf(y))) * 2) / 2;
    notify();
  }

  function onPointUp() {
    dragging = false;
  }

  function onWheel(i: number, e: WheelEvent) {
    e.preventDefault();
    const b = bands[i];
    const q = b.q && b.q > 0 ? b.q : 1.41;
    const next = q * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
    b.q = Math.round(Math.max(0.1, Math.min(30, next)) * 100) / 100;
    selected = i;
    notify();
  }

  function onPlotDblClick(e: MouseEvent) {
    const r = svgEl.getBoundingClientRect();
    addBandAt(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
  }

  function removeBand(i: number) {
    brouillon = null;
    bands.splice(i, 1);
    selected = null;
    notify();
  }

  function updateSelected(patch: Partial<EqBand>) {
    if (selected === null) return;
    Object.assign(bands[selected], patch);
    notify();
  }

  // #7423, puis retour testeur du 01/11 (Falkon) : saisir « 1000 » affichait
  // « 2000 », effacer ramenait « 20 », et le « 1 » de 1,41 ne s'effaçait pas.
  // Le champ était un `type="number"` dont la valeur reliée était réécrite
  // pendant la frappe. Désormais : un champ TEXTE et un tampon local. La
  // frappe ne touche ni la bande ni le champ ; la valeur n'est lue, bornée et
  // appliquée qu'en sortant du champ ou sur Entrée. Échap annule la saisie ;
  // les flèches haut/bas ajustent finement (Maj : pas plus grand).
  type Cle = 'freq' | 'gain' | 'q';
  const CHAMPS: Record<Cle, { min: number; max: number; decimales: number }> = {
    freq: { min: F_MIN, max: F_MAX, decimales: 0 },
    gain: { min: MIN_GAIN, max: MAX_GAIN, decimales: 1 },
    q: { min: 0.1, max: 30, decimales: 2 },
  };
  // `bande` : l'indice de la bande éditée, figé à la première frappe. Cliquer
  // un autre point change `selected` AVANT que le champ ne perde le focus :
  // la validation doit viser la bande qu'on éditait, pas la nouvelle.
  let brouillon = $state<{ cle: Cle; texte: string; bande: number } | null>(null);

  function valeurDe(cle: Cle, i: number | null = selected): number {
    if (i === null) return 0;
    const v = bands[i]?.[cle];
    return typeof v === 'number' && Number.isFinite(v) ? v : cle === 'q' ? 1.41 : 0;
  }
  function texteDuChamp(cle: Cle): string {
    return brouillon?.cle === cle ? brouillon.texte : String(valeurDe(cle));
  }
  function surSaisie(cle: Cle, e: Event) {
    if (selected === null) return;
    brouillon = { cle, texte: (e.currentTarget as HTMLInputElement).value, bande: selected };
  }
  function appliquer(cle: Cle, v: number, i: number | null = selected): number {
    const { min, max, decimales } = CHAMPS[cle];
    const n = arrondir(borner(v, min, max), decimales);
    if (i === null || !bands[i]) return n;
    Object.assign(bands[i], { [cle]: n });
    notify();
    return n;
  }
  function validerChamp(cle: Cle, champ: HTMLInputElement) {
    if (brouillon?.cle !== cle) return;
    const { texte, bande } = brouillon;
    const lu = lireDecimal(texte);
    brouillon = null;
    // Vide ou illisible : la bande ne change pas, le champ la réaffiche.
    const n = lu === null ? valeurDe(cle, bande) : appliquer(cle, lu, bande);
    champ.value = String(bande === selected ? n : valeurDe(cle));
  }
  function annulerChamp(champ: HTMLInputElement) {
    brouillon = null;
    champ.value = String(valeurDe(champ.dataset.cle as Cle));
  }
  function ajuster(cle: Cle, sens: 1 | -1, grand: boolean, champ: HTMLInputElement) {
    const base = lireDecimal(brouillon?.cle === cle ? brouillon.texte : champ.value) ?? valeurDe(cle);
    let v: number;
    if (cle === 'freq') {
      // Pas relatif : 1 % (au moins 1 Hz), un tiers d'octave avec Maj.
      const r = grand ? Math.pow(2, 1 / 3) : 1.01;
      v = sens > 0 ? Math.max(base + 1, base * r) : Math.min(base - 1, base / r);
    } else {
      v = base + sens * (cle === 'gain' ? (grand ? 1 : 0.1) : grand ? 0.1 : 0.01);
    }
    brouillon = null;
    champ.value = String(appliquer(cle, v));
  }
  function surTouche(cle: Cle, e: KeyboardEvent) {
    const champ = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') {
      e.preventDefault();
      validerChamp(cle, champ);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      annulerChamp(champ);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      ajuster(cle, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey, champ);
    }
  }
</script>

<div class="peq" class:disabled={!enabled}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svgEl}
    viewBox="0 0 {W} {H}"
    class="peq-plot"
    role="img"
    ondblclick={onPlotDblClick}
    onpointermove={onPointMove}
    onpointerup={onPointUp}
  >
    <!-- Grille -->
    {#each GRID_FREQS as f}
      <line x1={xOf(f)} y1="0" x2={xOf(f)} y2={H} class="grid-v" />
      <text x={xOf(f) + 3} y={H - 4} class="grid-label">{freqLabel(f)}</text>
    {/each}
    {#each [-12, -6, 0, 6, 12] as db}
      <line x1="0" y1={yOf(db)} x2={W} y2={yOf(db)} class={db === 0 ? 'grid-zero' : 'grid-h'} />
      <text x="4" y={yOf(db) - 3} class="grid-label">{db > 0 ? '+' : ''}{db}</text>
    {/each}
    <!--
      Réponse cumulée, une courbe par canal. La droite est tracée EN DESSOUS :
      quand le réglage est symétrique les deux chemins sont identiques au pixel
      près, la gauche la recouvre entièrement, et on retrouve exactement le
      trait unique d'avant. Le tireté n'apparaît donc que si les canaux
      diffèrent réellement — et il distingue les deux courbes même pour qui ne
      sépare pas les couleurs.
    -->
    <path d={cheminDroite} class="response response-droite" />
    <path d={cheminGauche} class="response response-gauche" />
    <!-- Points de bande -->
    {#each bands as b, i}
      <circle
        cx={xOf(b.freq)}
        cy={yOf(Math.max(MIN_GAIN, Math.min(MAX_GAIN, b.gain)))}
        r={selected === i ? 8 : 6}
        class="band-dot"
        class:selected={selected === i}
        role="slider"
        aria-valuenow={b.gain}
        tabindex="0"
        onpointerdown={(e) => onPointDown(i, e)}
        onwheel={(e) => onWheel(i, e)}
      />
    {/each}
  </svg>

  <!--
    La légende n'apparaît QUE si les canaux diffèrent. Tant que tout est
    symétrique, les deux courbes se superposent : nommer « gauche » et
    « droite » sous un trait unique ne ferait qu'égarer.
  -->
  {#if asymetrique}
    <div class="peq-legende">
      <span><i class="l"></i>{$t('eq.peqChannelLeft' as any)}</span>
      <span><i class="r"></i>{$t('eq.peqChannelRight' as any)}</span>
    </div>
  {/if}

  <div class="peq-toolbar">
    <span class="peq-count">{bands.length}/{maxBands}</span>
    <span class="peq-hint">{$t('eq.peqHint' as any)}</span>
    <button
      class="peq-add"
      disabled={bands.length >= maxBands}
      onclick={() => addBandAt(W / 2, yOf(0))}
    >+ {$t('eq.peqAddBand' as any)}</button>
  </div>

  {#if selected !== null && bands[selected]}
    {@const b = bands[selected]}
    <div class="peq-editor">
      <label>
        <span>{$t('eq.peqFreq' as any)}</span>
        <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          data-cle="freq" value={texteDuChamp('freq')}
          oninput={(e) => surSaisie('freq', e)}
          onkeydown={(e) => surTouche('freq', e)}
          onchange={(e) => validerChamp('freq', e.currentTarget)}
          onblur={(e) => validerChamp('freq', e.currentTarget)} />
      </label>
      <label>
        <span>{$t('eq.peqGain' as any)}</span>
        <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          data-cle="gain" value={texteDuChamp('gain')}
          oninput={(e) => surSaisie('gain', e)}
          onkeydown={(e) => surTouche('gain', e)}
          onchange={(e) => validerChamp('gain', e.currentTarget)}
          onblur={(e) => validerChamp('gain', e.currentTarget)} />
      </label>
      <label>
        <span>Q</span>
        <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          data-cle="q" value={texteDuChamp('q')}
          oninput={(e) => surSaisie('q', e)}
          onkeydown={(e) => surTouche('q', e)}
          onchange={(e) => validerChamp('q', e.currentTarget)}
          onblur={(e) => validerChamp('q', e.currentTarget)} />
      </label>
      <label>
        <span>{$t('eq.peqType' as any)}</span>
        <select value={b.type ?? 'peak'}
          onchange={(e) => updateSelected({ type: (e.target as HTMLSelectElement).value as EqBand['type'] })}>
          {#each BAND_TYPES as bt}
            <option value={bt}>{bt}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{$t('eq.peqChannel' as any)}</span>
        <!--
          Absent = les deux canaux. On envoie donc `undefined` et non `-1` :
          le serveur lit l'absence du champ, et un préréglage qui ne vise pas
          de canal ne doit pas repartir avec une valeur qui en désigne un.
        -->
        <select
          value={choixDepuisBande(b.channel)}
          onchange={(e) =>
            updateSelected({ channel: canalDepuisChoix((e.target as HTMLSelectElement).value) })}
        >
          <option value="both">{$t('eq.peqChannelBoth' as any)}</option>
          <option value="0">{$t('eq.peqChannelLeft' as any)}</option>
          <option value="1">{$t('eq.peqChannelRight' as any)}</option>
        </select>
      </label>
      <button class="peq-del" onclick={() => removeBand(selected!)}>{$t('eq.peqRemove' as any)}</button>
    </div>
  {/if}
</div>

<style>
  .peq { display: flex; flex-direction: column; gap: 0.5rem; }
  /* Bypass : grisé pour signaler l'état « off », mais les points restent
     déplaçables — les éditer rallume l'EQ (onchange → parent). */
  .peq.disabled { opacity: 0.6; }
  .peq-plot {
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    touch-action: none;
    user-select: none;
  }
  .grid-v, .grid-h { stroke: rgba(255, 255, 255, 0.06); stroke-width: 1; }
  .grid-zero { stroke: rgba(255, 255, 255, 0.18); stroke-width: 1; }
  .grid-label { fill: rgba(255, 255, 255, 0.35); font-size: 9px; }
  .response { fill: none; stroke-width: 2; }
  .response-gauche { stroke: var(--tune-accent, #6366f1); }
  .response-droite { stroke: var(--tune-accent-2, #f59e0b); stroke-dasharray: 6 4; }

  .peq-legende { display: flex; gap: 1rem; align-items: center; font-size: 0.8rem; opacity: 0.85; }
  .peq-legende span { display: inline-flex; gap: 0.4rem; align-items: center; }
  .peq-legende i { width: 1.1rem; height: 0; border-top-width: 2px; border-top-style: solid; }
  .peq-legende .l { border-color: var(--tune-accent, #6366f1); }
  .peq-legende .r { border-color: var(--tune-accent-2, #f59e0b); border-top-style: dashed; }
  .band-dot { fill: var(--tune-accent, #6366f1); opacity: 0.85; cursor: grab; }
  .band-dot.selected { fill: #f59e0b; opacity: 1; }
  .peq-toolbar { display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; }
  .peq-count { color: var(--tune-text-dim, #9ca3af); }
  .peq-hint { color: var(--tune-text-dim, #9ca3af); flex: 1; }
  .peq-add, .peq-del {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--tune-text, #e5e7eb);
    border-radius: 6px;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .peq-add:disabled { opacity: 0.4; cursor: default; }
  .peq-del { color: #f87171; }
  .peq-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: end;
    padding: 0.6rem 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
  }
  .peq-editor label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.7rem; color: var(--tune-text-dim, #9ca3af); }
  .peq-editor input, .peq-editor select {
    width: 5.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--tune-text, #e5e7eb);
    border-radius: 6px;
    padding: 0.25rem 0.4rem;
  }
</style>
