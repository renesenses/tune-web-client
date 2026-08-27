<script lang="ts">
  /**
   * Égaliseur — nouveau client (direction Levente).
   *
   * Égaliseur GRAPHIQUE sur les grilles ISO (10 / 15 / 31 bandes), avec
   * réglages tout faits, courbes gauche/droite déliables, et report honnête
   * de ce que le serveur a réellement appliqué.
   *
   * Le CROSSFEED n'est plus ici : il a son écran (Bertrand, 27/08). C'est un
   * réglage de casque, pas une correction de courbe.
   *
   * PÉRIMÈTRE ASSUMÉ : le sous-mode PARAMÉTRIQUE (bandes libres
   * fréquence/gain/Q/type) et l'assistant « Tune Master Profiler » de l'écran
   * actuel ne sont pas repris ici. Ce sont deux outils à part entière ; les
   * esquisser produirait des courbes fausses. L'écran le dit et y renvoie.
   *
   * La règle des canaux vient de `lib/eqGraphicChannels` — on la RÉUTILISE au
   * lieu de la réécrire : elle a ses tests, et deux implémentations d'un
   * découpage gauche/droite finiraient par diverger.
   */
  import * as api from '../../lib/api';
  import type { EqBand } from '../../lib/api';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { t } from '../../lib/i18n';
  import { bandesGraphiques } from '../../lib/eqGraphicChannels';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  // Grilles ISO : octave (10), 2/3 d'octave (15), 1/3 d'octave (31) — les
  // repères de REW. La résolution est une clé SERVEUR : web, iPad et mobile
  // partagent la même grille.
  const GRIDS: Record<number, number[]> = {
    10: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
    31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
         1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
  };
  // Q adapté à la largeur de bande ; 10 bandes garde le 1.0 historique pour ne
  // pas changer le rendu des réglages existants.
  const GRID_Q: Record<number, number> = { 10: 1.0, 15: 2.15, 31: 4.32 };
  const MIN_GAIN = -12, MAX_GAIN = 12;

  const PRESETS: { key: string; label: string; gains: number[] }[] = [
    { key: 'flat',         label: 'Plat',          gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { key: 'bass_boost',   label: 'Graves +',      gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
    { key: 'treble_boost', label: 'Aigus +',       gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8] },
    { key: 'loudness',     label: 'Loudness',      gains: [6, 4, 0, -2, -1, 0, 2, 4, 5, 6] },
    { key: 'rock',         label: 'Rock',          gains: [5, 3, 0, -2, -1, 2, 4, 5, 5, 4] },
    { key: 'jazz',         label: 'Jazz',          gains: [3, 2, 0, 2, -1, -1, 0, 2, 4, 5] },
    { key: 'classical',    label: 'Classique',     gains: [0, 0, 0, 0, 0, 0, -2, -3, -2, -1] },
  ];

  let bandCount = $state(10);
  const BANDS = $derived(GRIDS[bandCount] ?? GRIDS[10]);
  let gains = $state<number[]>(Array(10).fill(0));
  /** Courbe du canal DROIT. `null` = courbes liées, et c'est le défaut : une
   *  seule passe part au serveur, sans champ `channel`. */
  let gainsRight = $state<number[] | null>(null);
  let editing = $state<'left' | 'right'>('left');
  let enabled = $state(true);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const curve = $derived(gainsRight !== null && editing === 'right' ? gainsRight : gains);

  /** Rééchantillonne une courbe d'une grille vers une autre, par plus proche
   *  voisin en fréquence : changer de résolution ne doit jamais remettre la
   *  courbe à plat. */
  function resample(src: number[], from: number[], to: number[]): number[] {
    return to.map((f) => {
      let best = 0, d = Infinity;
      from.forEach((g, i) => { const dd = Math.abs(Math.log2(f / g)); if (dd < d) { d = dd; best = i; } });
      return src[best] ?? 0;
    });
  }

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    loading = true;
    Promise.allSettled([api.getEqExpertSettings(), api.getEq(zid)])
      .then(([res, eq]) => {
        if (res.status === 'fulfilled') bandCount = res.value.expert_bands ?? 10;
        const grid = GRIDS[bandCount] ?? GRIDS[10];
        if (eq.status === 'fulfilled' && eq.value) {
          enabled = eq.value.enabled ?? true;
          const bands = eq.value.bands ?? [];
          const left = bands.filter((b) => b.channel === undefined || b.channel === 0);
          const right = bands.filter((b) => b.channel === 1);
          gains = grid.map((f) => left.find((b) => Math.abs(b.freq - f) < 0.51)?.gain ?? 0);
          gainsRight = right.length ? grid.map((f) => right.find((b) => Math.abs(b.freq - f) < 0.51)?.gain ?? 0) : null;
        } else {
          gains = Array(grid.length).fill(0);
        }
        error = null;
      })
      .catch(() => { error = 'Égaliseur indisponible.'; })
      .finally(() => { loading = false; });
  });

  // Le serveur applique au flux en cours quand il le peut (#1725). Quand il ne
  // le peut pas — zone réseau, mode PURE — et qu'on écoute, on pousse un
  // curseur et on n'entend rien : ce silence se raconte comme « l'égaliseur
  // ne fonctionne pas ». On le dit, UNE fois.
  let nextTrackWarned = false;
  function reportReach(appliedLive: boolean | undefined) {
    const listening = $currentZone?.state === 'playing';
    if (appliedLive === false && listening) {
      if (!nextTrackWarned) { nextTrackWarned = true; notifications.info($t('eq.effectNextTrack' as any)); }
    } else if (appliedLive === true) {
      nextTrackWarned = false;
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function queueSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void save(); }, 300);
  }
  async function save() {
    const zid = $currentZoneId;
    if (zid == null) return;
    const bands: EqBand[] = bandesGraphiques(BANDS, gains, gainsRight, GRID_Q[bandCount] ?? 1.0);
    try {
      const res: any = await api.setEq(zid, { bands, enabled });
      reportReach(res?.applied_live);
      error = null;
    } catch (e: any) {
      // Un refus silencieux, c'est un égaliseur qui « ne marche pas » : les
      // curseurs bougent, la courbe tient à l'écran, et le son ne change
      // jamais. On le remonte.
      if (e?.message !== 'premium_required') error = 'Le serveur a refusé le réglage.';
    }
  }

  function setGain(i: number, v: number) {
    if (gainsRight !== null && editing === 'right') gainsRight = gainsRight.map((g, k) => (k === i ? v : g));
    else gains = gains.map((g, k) => (k === i ? v : g));
    queueSave();
  }
  function applyPreset(p: { gains: number[] }) {
    const next = bandCount === 10 ? [...p.gains] : resample(p.gains, GRIDS[10], BANDS);
    if (gainsRight !== null && editing === 'right') gainsRight = next; else gains = next;
    save();
  }
  function reset() {
    gains = Array(BANDS.length).fill(0);
    if (gainsRight !== null) gainsRight = Array(BANDS.length).fill(0);
    save();
  }
  function toggle() { enabled = !enabled; save(); }
  async function setBands(n: number) {
    const from = BANDS, prevRight = gainsRight;
    bandCount = n;
    const to = GRIDS[n];
    gains = resample(gains, from, to);
    if (prevRight) gainsRight = resample(prevRight, from, to);
    try { await api.setEqExpertSettings(n); } catch { /* vieux serveur : la grille reste locale */ }
    save();
  }
  /** Délier : la droite part de la gauche, à l'identique. Rien ne doit changer
   *  à ce qu'on entend — c'est une préparation, pas un réglage. */
  function unlink() { gainsRight = [...gains]; editing = 'left'; save(); }
  /** Relier : la courbe qui SURVIT est celle de gauche. Il faut en choisir
   *  une ; une moyenne inventerait une courbe que personne n'a réglée. */
  function relink() { gainsRight = null; editing = 'left'; save(); }

  function freqLabel(f: number): string { return f >= 1000 ? `${f / 1000}k` : `${f}`; }
</script>

<section class="v2-eq tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Correction</div>
      <h1>Égaliseur</h1>
    </div>
    <label class="sw">
      <input type="checkbox" checked={enabled} onchange={toggle} />
      <span class="slider"></span>
    </label>
    <span class="onoff">{enabled ? 'Actif' : 'Inactif'}</span>
    <button class="lnk" onclick={reset}>Remettre à plat</button>
  </header>

  {#if error}<div class="err">{error}</div>{/if}

  <div class="scroll">
    {#if loading}
      <div class="state">Chargement…</div>
    {:else if $currentZoneId == null}
      <div class="state">Aucune zone active — sélectionnez une zone pour régler son égaliseur.</div>
    {:else}
      <div class="presets">
        {#each PRESETS as p (p.key)}
          <button onclick={() => applyPreset(p)}>{p.label}</button>
        {/each}
      </div>

      {#if showExpert}
        <div class="ctrls">
          <span class="cl">Résolution</span>
          <div class="seg">
            {#each [10, 15, 31] as n (n)}
              <button class:on={bandCount === n} onclick={() => setBands(n)}>{n} bandes</button>
            {/each}
          </div>
          <span class="cl sep">Canaux</span>
          {#if gainsRight === null}
            <button class="lnk" onclick={unlink}>Délier G/D</button>
            <span class="note">La droite partira de la gauche, à l'identique.</span>
          {:else}
            <div class="seg">
              <button class:on={editing === 'left'} onclick={() => (editing = 'left')}>Gauche</button>
              <button class:on={editing === 'right'} onclick={() => (editing = 'right')}>Droite</button>
            </div>
            <button class="lnk" onclick={relink}>Relier</button>
            <span class="note">En reliant, c'est la courbe de <b>gauche</b> qui survit.</span>
          {/if}
        </div>
      {/if}

      <div class="board" class:off={!enabled}>
        {#each BANDS as f, i (f)}
          <div class="band">
            <span class="g">{curve[i] > 0 ? '+' : ''}{(curve[i] ?? 0).toFixed(1)}</span>
            <!-- Verticalite par CSS (`writing-mode`) : l'attribut `orient` est un
                 heritage Firefox, absent des types et sans effet ailleurs. -->
            <input class="v" type="range" min={MIN_GAIN} max={MAX_GAIN} step="0.5"
              value={curve[i] ?? 0} disabled={!enabled}
              oninput={(e) => setGain(i, Number((e.currentTarget as HTMLInputElement).value))}
              aria-label={`${freqLabel(f)} Hz`} />
            <span class="f">{freqLabel(f)}</span>
          </div>
        {/each}
      </div>

      {#if showExpert}
        <p class="more">
          L'égaliseur <b>paramétrique</b> (bandes libres : fréquence, gain, Q, type) et
          l'assistant <b>Tune Master Profiler</b> ne sont pas encore repris dans ce client.
          <button class="lnk sm" onclick={() => activeView.set('settings')}>Ouvrir les réglages</button>
        </p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .v2-eq{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:16px; padding:24px 30px 12px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .onoff{font:11px var(--v2-mono); color:var(--v2-txt3); margin-right:auto}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer; margin-bottom:3px}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}

  .err{margin:0 30px 10px; padding:10px 14px; border-radius:10px; font-size:12.5px;
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 0; color:var(--v2-txt3)}

  .presets{display:flex; gap:7px; flex-wrap:wrap; padding:2px 0 16px}
  .presets button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:8px 15px; border-radius:var(--v2-r-pill); transition:.15s}
  .presets button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}

  .ctrls{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:0 0 18px}
  .cl{font:10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .cl.sep{margin-left:12px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:11px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{border:0; background:transparent; color:var(--v2-txt2); font:600 11.5px var(--v2-sans);
    padding:6px 12px; border-radius:8px; cursor:pointer}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .note{font-size:11px; color:var(--v2-txt3)}
  .note b{color:var(--v2-txt2)}

  .board{display:flex; align-items:flex-end; gap:4px; padding:18px 16px 10px; border-radius:14px;
    border:1px solid var(--v2-line); background:var(--v2-surface2); overflow-x:auto}
  .board.off{opacity:.4}
  .board::-webkit-scrollbar{height:8px}.board::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .band{display:flex; flex-direction:column; align-items:center; gap:8px; flex:1 1 0; min-width:34px}
  .band .g{font:10px var(--v2-mono); color:var(--v2-acc2); min-height:13px}
  .band .f{font:9.5px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .band .v{writing-mode:vertical-lr; direction:rtl; width:22px; height:190px; accent-color:var(--v2-acc1); cursor:pointer}

  .more{margin-top:20px; padding:13px 16px; border-radius:11px; font-size:12.5px; line-height:1.55;
    color:var(--v2-txt3); border:1px dashed var(--v2-line2)}
  .more b{color:var(--v2-txt2)}
</style>
