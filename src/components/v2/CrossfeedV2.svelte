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
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import {
    CF_PRESETS,
    reglagesCrossfeed, presetActif, bornesCrossfeed, niveauEnPourcent,
    indisponibiliteCrossfeed, cleIndisponibiliteCrossfeed,
  } from '../../lib/crossfeed';
  import CompensationNiveauV2 from './CompensationNiveauV2.svelte';
  import '../../styles/tune-v2.css';

  let enabled = $state(false);
  /** Incrémenté à chaque réglage enregistré : `CompensationNiveauV2` se relit. */
  let revisionDsp = $state(0);
  let amount = $state(0.30);
  let delay = $state(0.50);
  let loading = $state(true);
  let error = $state<string | null>(null);
  /** Le bout des curseurs : celui du SERVEUR quand il le publie
   *  (`crossfeed_limits`, tune-server-rust#4683), sinon nos constantes. */
  let bornes = $state(bornesCrossfeed(null));

  const zoneName = $derived($currentZone?.name ?? null);
  const active = $derived(presetActif(amount, delay));
  /** Ce que le SERVEUR dit du crossfeed sur cette zone (`crossfeed_status`,
   *  GET/PUT /zones/{id}/dsp depuis la 0.9.132) : `unavailable` VERROUILLE le
   *  contrôle, case cochée ou non. À défaut du champ (serveur antérieur), le
   *  type de sortie tranche : hors sortie locale, le crossfeed n'a aucun
   *  chemin de code (tune-server-rust#2742). */
  let status = $state<api.CrossfeedStatus | null>(null);
  const indispo = $derived(indisponibiliteCrossfeed(status, $currentZone?.output_type));

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    loading = true;
    api.getDsp(zid)
      .then((d) => {
        const cf = d?.crossfeed;
        status = d?.crossfeed_status ?? null;
        bornes = bornesCrossfeed(d?.crossfeed_limits);
        if (cf) { enabled = !!cf.enabled; amount = cf.amount ?? 0.3; delay = cf.delay_ms ?? 0.5; }
        error = null;
      })
      .catch(() => { error = $t('v2.cf.errUnavailable' as any); })
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
    const zid = zoneRequise();
    if (zid == null) return;
    // Borné AVANT l'envoi : l'écran doit montrer la valeur qui sera
    // réellement appliquée, pas celle qu'on a demandée.
    const crossfeed = reglagesCrossfeed(enabled, amount, delay, bornes);
    amount = crossfeed.amount; delay = crossfeed.delay_ms;
    try {
      const res: any = await api.setDsp(zid, { crossfeed });
      status = res?.crossfeed_status ?? status;
      // « Prendra effet à la piste suivante » serait faux là où le serveur
      // vient de dire « jamais » (tune-server-rust#2742).
      if (!indispo.indisponible) reportReach(res?.crossfeed_applied_live);
      // Le dosage a changé : ce que la compensation rend aussi (#4685).
      revisionDsp++;
      error = null;
    } catch (e: any) {
      if (e?.message !== 'premium_required') error = $t('v2.cf.errSave' as any);
    }
  }
  function toggle() { enabled = !enabled; save(); }
  function applyPreset(p: { amount: number; delay: number }) {
    amount = p.amount; delay = p.delay;
    if (!enabled) enabled = true;
    save();
  }

  /*
   * « Mes préréglages » (tune-server-rust#4684) — enregistrés CÔTÉ SERVEUR,
   * donc partagés entre appareils et inclus dans la sauvegarde de
   * configuration, sur le modèle de ceux de l'égaliseur. Appliquer = envoyer
   * leurs valeurs par le chemin ordinaire (`save`), qui dit aussi si le réglage
   * a atteint le son. Serveur antérieur : la liste reste vide, sans erreur.
   */
  let mesPresets = $state<api.CrossfeedPresetServeur[]>([]);
  async function chargerMesPresets() {
    try { mesPresets = await api.listCrossfeedPresets(); } catch { mesPresets = []; }
  }
  $effect(() => { void chargerMesPresets(); });

  async function enregistrerPreset() {
    const saisi = await dialogs.prompt($t('eq.presetNamePlaceholder' as any));
    const nom = saisi?.trim();
    if (!nom) return;
    const { amount: a, delay_ms } = reglagesCrossfeed(enabled, amount, delay, bornes);
    try {
      // Même nom = le serveur met à jour le préréglage existant (même id).
      const p = await api.saveCrossfeedPreset({ name: nom, amount: a, delay_ms });
      mesPresets = [...mesPresets.filter((x) => x.id !== p.id), p];
      notifications.success($t('eq.presetSaved' as any).replace('{name}', p.name));
    } catch (e: any) {
      if (e?.message !== 'premium_required') notifications.error($t('eq.presetSaveFailed' as any));
    }
  }

  function appliquerMonPreset(p: api.CrossfeedPresetServeur) {
    applyPreset({ amount: p.amount, delay: p.delay_ms });
  }

  async function supprimerMonPreset(p: api.CrossfeedPresetServeur) {
    const avant = mesPresets;
    mesPresets = mesPresets.filter((x) => x.id !== p.id);
    try {
      await api.deleteCrossfeedPreset(p.id);
    } catch {
      // La suppression n'a pas eu lieu : la liste revient, et on le dit.
      mesPresets = avant;
      notifications.error($t('common.error' as any));
    }
  }
  /** Le préréglage personnel qui correspond aux curseurs, s'il y en a un. */
  const monActif = $derived(
    mesPresets.find((p) => Math.abs(p.amount - amount) < 0.005 && Math.abs(p.delay_ms - delay) < 0.005)?.id ?? null
  );
</script>

<section class="v2-cf tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.cf.eyebrow' as any)}</div>
      <h1>Crossfeed</h1>
    </div>
  </header>

  <div class="scroll">
    <p class="lead">
      {$t('v2.cf.leadA' as any)} <b>{$t('v2.cf.leadFront' as any)}</b> {$t('v2.cf.leadB' as any)}
    </p>

    {#if error}<div class="err">{error}</div>{/if}

    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if $currentZoneId == null}
      <div class="state">{$t('v2.cf.noZone' as any)}</div>
    {:else}
      {#if indispo.indisponible}
        <div class="warn">
          {#if zoneName}<b>{zoneName}</b> — {/if}{$t(cleIndisponibiliteCrossfeed(indispo.motif) as any)}
        </div>
      {/if}

      <div class="card">
        <div class="row">
          <div class="lbl">
            <span>{$t('v2.cf.enable' as any)}</span>
            {#if zoneName}<span class="hint">{$t('v2.cf.perZoneA' as any)} <b>{zoneName}</b>{$t('v2.cf.perZoneB' as any)}</span>{/if}
          </div>
          <label class="sw">
            <input type="checkbox" checked={enabled} onchange={toggle} disabled={indispo.indisponible} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="presets" class:off={!enabled}>
          {#each CF_PRESETS as p (p.key)}
            <button class:on={active === p.key} disabled={!enabled || indispo.indisponible} onclick={() => applyPreset(p)}>
              {$t(p.labelKey as any)}
            </button>
          {/each}
        </div>

        <div class="presets mes" class:off={!enabled}>
          <span class="mesl">{$t('eq.myPresets' as any)}</span>
          {#each mesPresets as p (p.id)}
            <span class="mien">
              <button class:on={monActif === p.id} disabled={!enabled || indispo.indisponible}
                onclick={() => appliquerMonPreset(p)}>{p.name}</button>
              <button class="x" onclick={() => supprimerMonPreset(p)}
                title={$t('eq.deletePreset' as any)} aria-label={$t('eq.deletePreset' as any)}>×</button>
            </span>
          {/each}
          <button disabled={!enabled || indispo.indisponible} onclick={enregistrerPreset}>+ {$t('eq.savePreset' as any)}</button>
        </div>

        <div class="row" class:off={!enabled}>
          <div class="lbl">
            <span>{$t('v2.cf.amount' as any)}</span>
            <span class="hint">{$t('v2.cf.amountHint' as any)} {$t('v2.cf.amountScaleHint' as any)}</span>
          </div>
          <div class="sl">
            <!-- tune-server-rust#4683 — la course du curseur va de 0 à la
                 borne du serveur, et s'affiche de 0 à 100 % : elle
                 affichait `amount × 100`, soit « 50 % » en butée. -->
            <input type="range" min="0" max={bornes.amountMax} step="0.01" bind:value={amount}
              disabled={!enabled || indispo.indisponible} oninput={queueSave} aria-label={$t('v2.cf.amountAria' as any)} />
            <span class="val">{niveauEnPourcent(amount, bornes.amountMax)} %</span>
          </div>
        </div>

        <div class="row" class:off={!enabled}>
          <div class="lbl">
            <span>{$t('v2.cf.delay' as any)}</span>
            <span class="hint">{$t('v2.cf.delayHint' as any)}</span>
          </div>
          <div class="sl">
            <input type="range" min="0" max={bornes.delayMax} step="0.1" bind:value={delay}
              disabled={!enabled || indispo.indisponible} oninput={queueSave} aria-label={$t('v2.cf.delayAria' as any)} />
            <span class="val">{delay.toFixed(1)} ms</span>
          </div>
        </div>
      </div>

      <CompensationNiveauV2 revision={revisionDsp} />
    {/if}
  </div>
</section>

<style>
  .v2-cf{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
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
  .presets.mes{align-items:center; padding-top:10px}
  .mesl{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .mien{display:inline-flex}
  .mien .x{padding:0 7px}

  .sl{display:flex; align-items:center; gap:14px; flex:0 0 auto}
  .sl input{width:220px; accent-color:var(--v2-acc1)}
  .val{font:12px var(--v2-mono); color:var(--v2-txt2); width:56px; text-align:right}
</style>
