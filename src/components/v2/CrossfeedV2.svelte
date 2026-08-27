<script lang="ts">
  /**
   * Crossfeed — nouveau client (direction Levente).
   *
   * ÉCRAN AUTONOME, sorti de l'Égaliseur (Bertrand, 27/08). C'est un réglage
   * de CASQUE, pas une correction de courbe : le mêler à l'égaliseur le
   * rendait introuvable pour qui le cherche, et incompréhensible pour qui
   * tombe dessus.
   *
   * Ce qu'il fait : verse dans chaque oreille une copie retardée et atténuée
   * du canal opposé, pour que la scène stéréo se pose DEVANT vous au lieu de
   * rester dans votre tête. Sortie locale uniquement.
   *
   * Bornes et réglages tout faits viennent de `lib/crossfeed` — la MÊME
   * définition que l'égaliseur actuel et « En écoute ». Deux listes qui
   * dérivent, et « Standard » ne veut plus dire la même chose d'un écran à
   * l'autre.
   */
  import * as api from '../../lib/api';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { t } from '../../lib/i18n';
  import {
    CF_PRESETS, CF_MAX_AMOUNT, CF_MAX_DELAY,
    reglagesCrossfeed, presetActif,
  } from '../../lib/crossfeed';
  import '../../styles/tune-v2.css';

  let enabled = $state(false);
  let amount = $state(0.30);
  let delay = $state(0.50);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const zoneName = $derived($currentZone?.name ?? null);
  const active = $derived(presetActif(amount, delay));
  /** Le crossfeed ne s'applique qu'à une sortie locale : sur une zone réseau
   *  le curseur bougerait sans que rien ne change à l'oreille. On le dit. */
  const localOutput = $derived(($currentZone?.output_type ?? 'local') === 'local');

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    loading = true;
    api.getDsp(zid)
      .then((d) => {
        const cf = d?.crossfeed;
        if (cf) { enabled = !!cf.enabled; amount = cf.amount ?? 0.3; delay = cf.delay_ms ?? 0.5; }
        error = null;
      })
      .catch(() => { error = 'Réglage indisponible sur ce serveur.'; })
      .finally(() => { loading = false; });
  });

  // Le serveur dit sur CHAQUE écriture si le réglage a atteint le flux en
  // cours. Sans ce retour, quand il ne prend pas — zone réseau, mode PURE —
  // on bouge le curseur, rien ne change, et ça se raconte ensuite comme
  // « le crossfeed ne marche pas ».
  let nextTrackWarned = false;
  function reportReach(appliedLive: boolean | undefined) {
    const listening = $currentZone?.state === 'playing';
    if (appliedLive === false && listening) {
      if (!nextTrackWarned) { nextTrackWarned = true; notifications.info($t('eq.effectNextTrack' as any)); }
    } else if (appliedLive === true) {
      nextTrackWarned = false;
    }
  }

  // Un envoi par tick de curseur inonderait le serveur : on regroupe.
  let timer: ReturnType<typeof setTimeout> | null = null;
  function queueSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void save(); }, 300);
  }
  async function save() {
    const zid = $currentZoneId;
    if (zid == null) return;
    // Borné AVANT l'envoi : l'écran doit montrer la valeur qui sera
    // réellement appliquée, pas celle qu'on a demandée.
    const crossfeed = reglagesCrossfeed(enabled, amount, delay);
    amount = crossfeed.amount; delay = crossfeed.delay_ms;
    try {
      const res: any = await api.setDsp(zid, { crossfeed });
      reportReach(res?.crossfeed_applied_live);
      error = null;
    } catch (e: any) {
      if (e?.message !== 'premium_required') error = 'Enregistrement impossible.';
    }
  }
  function toggle() { enabled = !enabled; save(); }
  function applyPreset(p: { amount: number; delay: number }) {
    amount = p.amount; delay = p.delay;
    if (!enabled) enabled = true;
    save();
  }
</script>

<section class="v2-cf tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Casque</div>
      <h1>Crossfeed</h1>
    </div>
  </header>

  <div class="scroll">
    <p class="lead">
      Verse dans chaque oreille une copie retardée et atténuée du canal opposé.
      La scène stéréo se pose <b>devant vous</b> au lieu de rester dans votre tête —
      ce que fait naturellement une paire d'enceintes.
    </p>

    {#if error}<div class="err">{error}</div>{/if}

    {#if loading}
      <div class="state">Chargement…</div>
    {:else if $currentZoneId == null}
      <div class="state">Aucune zone active — sélectionnez une zone pour régler son crossfeed.</div>
    {:else}
      {#if !localOutput}
        <div class="warn">
          La zone <b>{zoneName}</b> n'est pas une sortie locale. Le crossfeed s'applique au
          rendu local ; sur une sortie réseau, le réglage peut rester sans effet audible.
        </div>
      {/if}

      <div class="card">
        <div class="row">
          <div class="lbl">
            <span>Activer le crossfeed</span>
            {#if zoneName}<span class="hint">Réglage propre à la zone <b>{zoneName}</b>.</span>{/if}
          </div>
          <label class="sw">
            <input type="checkbox" checked={enabled} onchange={toggle} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="presets" class:off={!enabled}>
          {#each CF_PRESETS as p (p.key)}
            <button class:on={active === p.key} disabled={!enabled} onclick={() => applyPreset(p)}>
              {$t(p.labelKey as any)}
            </button>
          {/each}
        </div>

        <div class="row" class:off={!enabled}>
          <div class="lbl">
            <span>Intensité</span>
            <span class="hint">Quelle proportion du canal opposé passe dans l'autre oreille.</span>
          </div>
          <div class="sl">
            <input type="range" min="0" max={CF_MAX_AMOUNT} step="0.01" bind:value={amount}
              disabled={!enabled} oninput={queueSave} aria-label="Intensité du crossfeed" />
            <span class="val">{Math.round(amount * 100)} %</span>
          </div>
        </div>

        <div class="row" class:off={!enabled}>
          <div class="lbl">
            <span>Retard</span>
            <span class="hint">Le temps que met le son à contourner la tête. C'est lui qui crée la distance.</span>
          </div>
          <div class="sl">
            <input type="range" min="0" max={CF_MAX_DELAY} step="0.1" bind:value={delay}
              disabled={!enabled} oninput={queueSave} aria-label="Retard du crossfeed" />
            <span class="val">{delay.toFixed(1)} ms</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-cf{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{padding:24px 30px 10px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; max-width:820px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .lead{font-size:14px; line-height:1.6; color:var(--v2-txt2); padding:6px 0 18px; max-width:62ch}
  .lead b{color:var(--v2-txt)}
  .state{padding:24px 0; color:var(--v2-txt3)}
  .err,.warn{padding:11px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; margin-bottom:16px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .warn b{color:var(--v2-acc-tint)}

  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:6px 20px 18px}
  .row{display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0;
    border-bottom:1px solid var(--v2-line)}
  .row:last-child{border-bottom:0}
  .row.off{opacity:.45}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:14px; font-weight:600}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:46ch}
  .hint b{color:var(--v2-txt2)}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}

  .presets{display:flex; gap:7px; padding:14px 0 2px; flex-wrap:wrap}
  .presets.off{opacity:.45}
  .presets button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:8px 15px; border-radius:var(--v2-r-pill); transition:.15s}
  .presets button:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-acc2)}
  .presets button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .presets button:disabled{cursor:default}

  .sl{display:flex; align-items:center; gap:14px; flex:0 0 auto}
  .sl input{width:220px; accent-color:var(--v2-acc1)}
  .val{font:12px var(--v2-mono); color:var(--v2-txt2); width:56px; text-align:right}
</style>
