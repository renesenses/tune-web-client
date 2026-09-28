<script lang="ts">
  /**
   * Crossfeed Pro — écran de réglage DÉDIÉ au greffon audio natif premium
   * `crossfeed-pro` (décision de Bertrand, 28/09/2026). Le crossfeed intégré
   * garde son propre écran (`CrossfeedV2`).
   *
   * Routes de l'hôte (tune-server-rust v0.9.167, `routes/greffons_natifs_tiers.rs`) :
   *   GET|PUT  /audio-plugins/crossfeed-pro/zones/{zone}   réglage de la zone
   *   GET|POST /audio-plugins/crossfeed-pro/profiles        profils nommés
   *   DELETE   /audio-plugins/crossfeed-pro/profiles/{id}
   *
   * Le `PUT` porte le JSON de réglages ENTIER : l'hôte le stocke tel quel et
   * le fait valider par le greffon. Un profil se CHOISIT, il ne s'applique pas
   * côté hôte : charger un profil = envoyer ses réglages au `PUT` de la zone.
   *
   * Ce qui empêche le réglage d'agir est DIT, et verrouille les contrôles :
   * greffon absent ou inactif, compte sans Premium, zone non stéréo, mode PURE
   * (voile commun avec l'Égaliseur et le Crossfeed, web#1674).
   */
  import * as api from '../../lib/api';
  import { atteintLeSon } from '../../lib/porteeReglage';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { licenseState, isPremium } from '../../lib/stores/license';
  import { audiophileEnabled } from '../../lib/stores/audiophile';
  import { presenceCrossfeedPro } from '../../lib/stores/crossfeedPro';
  import { dialogs } from '../../lib/stores/dialogs';
  import { t } from '../../lib/i18n';
  import {
    CROSSFEED_PRO_ID,
    BORNES_CROSSFEED_PRO as B,
    DEFAUTS_CROSSFEED_PRO,
    PRESETS_CROSSFEED_PRO,
    POSITIONS_COUPURE,
    reglagesCrossfeedPro,
    appliquerPresetCrossfeedPro,
    presetCrossfeedProActif,
    profilCrossfeedProActif,
    positionCoupure,
    coupureDePosition,
    presenceDepuis,
    zoneStereo,
    type ReglagesCrossfeedPro,
    type PresetCrossfeedPro,
    type PresenceCrossfeedPro,
    type CurseurCrossfeedPro,
  } from '../../lib/crossfeedPro';
  import { libelleCoupure } from '../../lib/crossfeed';
  import VoilePur from './VoilePur.svelte';
  import '../../styles/tune-v2.css';

  let r = $state<ReglagesCrossfeedPro>({ ...DEFAUTS_CROSSFEED_PRO });
  let presence = $state<PresenceCrossfeedPro>('inconnue');
  let loading = $state(true);
  let error = $state<string | null>(null);
  /** Un 402 reçu à l'écriture : le serveur a tranché, quoi que dise la licence lue. */
  let refusPremium = $state(false);
  let profils = $state<api.ProfilGreffonNatif[]>([]);

  const zoneName = $derived($currentZone?.name ?? null);
  const pur = $derived($audiophileEnabled);
  const sansPremium = $derived(refusPremium || ($licenseState.loaded && !$isPremium));
  const stereo = $derived(zoneStereo($currentZone));
  const nonStereo = $derived(stereo === false);
  const disposition = $derived($currentZone?.channel_layout_status?.effective ?? $currentZone?.channel_layout ?? '');
  /** Tout ce qui rend le réglage impossible ou sans effet grise l'écran. */
  const verrouille = $derived(pur || sansPremium || nonStereo || presence !== 'actif');
  const presetActif = $derived(presetCrossfeedProActif(r));
  const profilActif = $derived(profilCrossfeedProActif(r, profils));

  function publierPresence(p: PresenceCrossfeedPro) {
    presence = p;
    if (p !== 'inconnue') presenceCrossfeedPro.set(p);
  }

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    loading = true;
    api.getReglageGreffonNatif(CROSSFEED_PRO_ID, zid)
      .then((d) => {
        publierPresence(presenceDepuis(d));
        r = reglagesCrossfeedPro(d?.settings);
        error = null;
      })
      .catch((e) => {
        const p = presenceDepuis(null, e);
        publierPresence(p);
        error = p === 'inconnue' ? $t('v2.cfp.errLoad' as any) : null;
      })
      .finally(() => { loading = false; });
  });

  async function chargerProfils() {
    try { profils = await api.listProfilsGreffonNatif(CROSSFEED_PRO_ID); } catch { profils = []; }
  }
  $effect(() => { if (presence === 'actif' || presence === 'inactif') void chargerProfils(); });

  let nextTrackWarned = false;
  function reportReach(appliedLive: boolean | undefined) {
    const listening = $currentZone?.state === 'playing';
    if (appliedLive === false && listening) {
      if (!nextTrackWarned) { nextTrackWarned = true; notifications.info($t('eq.effectNextTrack' as any)); }
    } else if (appliedLive === true) {
      nextTrackWarned = false;
    }
  }

  /** Un refus de l'hôte dit ce qui manque : on l'affiche là où il se voit. */
  function lireRefus(e: any): boolean {
    if (e?.status === 402) { refusPremium = true; return true; }
    const p = presenceDepuis(null, e);
    if (p === 'absent' || p === 'inactif') { publierPresence(p); return true; }
    if (e?.code === 'invalid_plugin_settings') { error = $t('v2.cfp.errRefused' as any); return true; }
    return false;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function queueSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void save(); }, 300);
  }
  async function save() {
    const zid = zoneRequise();
    if (zid == null || verrouille) return;
    // Borné AVANT l'envoi : l'écran montre la valeur réellement appliquée.
    const envoi = reglagesCrossfeedPro(r);
    r = envoi;
    try {
      const res = await api.setReglageGreffonNatif(CROSSFEED_PRO_ID, zid, envoi);
      reportReach(atteintLeSon(res?.applied_live, null));
      error = null;
    } catch (e: any) {
      if (!lireRefus(e)) error = $t('v2.cfp.errSave' as any);
    }
  }

  function basculer(cle: 'enabled' | 'head_shadow' | 'low_cut' | 'phase_guard' | 'experimental_itd') {
    r = { ...r, [cle]: !r[cle] };
    void save();
  }
  function regler(cle: CurseurCrossfeedPro, e: Event) {
    r = { ...r, [cle]: Number((e.currentTarget as HTMLInputElement).value) };
    queueSave();
  }
  function reglerCoupure(e: Event) {
    r = { ...r, head_shadow_hz: coupureDePosition(Number((e.currentTarget as HTMLInputElement).value)) };
    queueSave();
  }
  function choisirPreset(p: PresetCrossfeedPro) {
    r = appliquerPresetCrossfeedPro(r, p);
    void save();
  }

  async function enregistrerProfil() {
    const nom = (await dialogs.prompt($t('v2.cfp.profileNamePrompt' as any)))?.trim();
    if (!nom) return;
    try {
      // Même nom = l'hôte met à jour le profil existant (même id).
      const p = await api.saveProfilGreffonNatif(CROSSFEED_PRO_ID, { name: nom, settings: reglagesCrossfeedPro(r) });
      profils = [...profils.filter((x) => x.id !== p.id), p];
      notifications.success($t('v2.cfp.profileSaved' as any).replace('{name}', p.name));
    } catch (e: any) {
      if (!lireRefus(e)) notifications.error($t('v2.cfp.profileSaveFailed' as any));
    }
  }
  function chargerProfil(p: api.ProfilGreffonNatif) {
    // Choisir un profil, c'est vouloir l'entendre : il allume le greffon.
    r = { ...reglagesCrossfeedPro(p.settings), enabled: true };
    void save();
  }
  async function supprimerProfil(p: api.ProfilGreffonNatif) {
    const avant = profils;
    profils = profils.filter((x) => x.id !== p.id);
    try {
      await api.deleteProfilGreffonNatif(CROSSFEED_PRO_ID, p.id);
    } catch (e: any) {
      profils = avant;
      if (!lireRefus(e)) notifications.error($t('common.error' as any));
    }
  }

  const eteint = $derived(!r.enabled);
</script>

<section class="v2-cfp tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.cfp.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.crossfeedPro' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    <p class="lead">{$t('v2.cfp.lead' as any)}</p>

    {#if error}<div class="err">{error}</div>{/if}

    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if $currentZoneId == null}
      <div class="state">{$t('v2.cfp.noZone' as any)}</div>
    {:else if presence === 'absent'}
      <div class="warn" data-cfp-motif="absent">{$t('v2.cfp.absent' as any)}</div>
    {:else}
      {#if presence === 'inactif'}
        <div class="warn" data-cfp-motif="inactif">{$t('v2.cfp.inactive' as any)}</div>
      {/if}
      {#if sansPremium}
        <div class="warn" data-cfp-motif="premium">{$t('v2.cfp.premium' as any)}</div>
      {/if}
      {#if nonStereo}
        <div class="warn" data-cfp-motif="stereo">
          {#if zoneName}<b>{zoneName}</b> — {/if}{$t('v2.cfp.notStereo' as any).replace('{layout}', disposition)}
        </div>
      {/if}
      {#if pur}<VoilePur cle="v2.pure.veilCfPro" />{/if}

      <fieldset class="reglages" class:voile={verrouille} disabled={verrouille} aria-disabled={verrouille}>
        <div class="card">
          <div class="row">
            <div class="lbl">
              <span>{$t('v2.cfp.enable' as any)}</span>
              {#if zoneName}<span class="hint">{$t('v2.cfp.perZone' as any).replace('{zone}', zoneName)}</span>{/if}
            </div>
            <label class="sw">
              <input type="checkbox" data-cfp="enabled" checked={r.enabled} onchange={() => basculer('enabled')}
                aria-label={$t('v2.cfp.enable' as any)} />
              <span class="slider"></span>
            </label>
          </div>

          <div class="presets" data-cfp="presets">
            <span class="mesl">{$t('v2.cfp.presets' as any)}</span>
            {#each PRESETS_CROSSFEED_PRO as p (p.key)}
              <button class:on={presetActif === p.key} data-preset={p.key} onclick={() => choisirPreset(p)}>
                {$t(p.labelKey as any)}
              </button>
            {/each}
          </div>
          <p class="hint sous">{$t('v2.cfp.presetsHint' as any)}</p>

          <div class="presets mes" data-cfp="profils">
            <span class="mesl">{$t('v2.cfp.profiles' as any)}</span>
            {#each profils as p (p.id)}
              <span class="mien">
                <button class:on={profilActif === p.id} data-profil={p.id} onclick={() => chargerProfil(p)}>{p.name}</button>
                <button class="x" onclick={() => supprimerProfil(p)}
                  title={$t('v2.cfp.deleteProfile' as any)} aria-label={$t('v2.cfp.deleteProfile' as any)}>×</button>
              </span>
            {/each}
            <button data-cfp="save-profile" onclick={enregistrerProfil}>+ {$t('v2.cfp.saveProfile' as any)}</button>
          </div>

          <div class="row" class:off={eteint}>
            <div class="lbl">
              <span>{$t('v2.cfp.amount' as any)}</span>
              <span class="hint">{$t('v2.cfp.amountHint' as any)}</span>
            </div>
            <div class="sl">
              <input type="range" data-cfp="amount" min={B.amount.min} max={B.amount.max} step={B.amount.pas}
                value={r.amount} oninput={(e) => regler('amount', e)} aria-label={$t('v2.cfp.amount' as any)} />
              <span class="val">{r.amount.toFixed(2)}</span>
            </div>
          </div>

          <div class="row" class:off={eteint || r.experimental_itd}>
            <div class="lbl">
              <span>{$t('v2.cfp.delay' as any)}</span>
              <span class="hint">{$t((r.experimental_itd ? 'v2.cfp.delayItdHint' : 'v2.cfp.delayHint') as any)}</span>
            </div>
            <div class="sl">
              <input type="range" data-cfp="delay_ms" min={B.delay_ms.min} max={B.delay_ms.max} step={B.delay_ms.pas}
                value={r.delay_ms} oninput={(e) => regler('delay_ms', e)} aria-label={$t('v2.cfp.delay' as any)} />
              <span class="val">{r.delay_ms.toFixed(2)} ms</span>
            </div>
          </div>

          <div class="row" class:off={eteint}>
            <div class="lbl">
              <span>{$t('v2.cfp.headShadow' as any)}</span>
              <span class="hint">{$t('v2.cfp.headShadowHint' as any)}</span>
            </div>
            <label class="sw">
              <input type="checkbox" data-cfp="head_shadow" checked={r.head_shadow} onchange={() => basculer('head_shadow')}
                aria-label={$t('v2.cfp.headShadow' as any)} />
              <span class="slider"></span>
            </label>
          </div>
          {#if r.head_shadow}
            <div class="row sub" class:off={eteint}>
              <div class="lbl"><span>{$t('v2.cfp.cutoff' as any)}</span></div>
              <div class="sl">
                <input type="range" data-cfp="head_shadow_hz" min="0" max={POSITIONS_COUPURE} step="1"
                  value={positionCoupure(r.head_shadow_hz)} oninput={reglerCoupure}
                  aria-label={$t('v2.cfp.cutoff' as any)} aria-valuetext={libelleCoupure(r.head_shadow_hz)} />
                <span class="val">{libelleCoupure(r.head_shadow_hz)}</span>
              </div>
            </div>
            <div class="row sub" class:off={eteint}>
              <div class="lbl"><span>{$t('v2.cfp.slope' as any)}</span></div>
              <div class="sl">
                <input type="range" data-cfp="head_shadow_slope_db_oct" min={B.head_shadow_slope_db_oct.min}
                  max={B.head_shadow_slope_db_oct.max} step={B.head_shadow_slope_db_oct.pas}
                  value={r.head_shadow_slope_db_oct} oninput={(e) => regler('head_shadow_slope_db_oct', e)}
                  aria-label={$t('v2.cfp.slope' as any)} />
                <span class="val">{r.head_shadow_slope_db_oct.toFixed(1)} dB</span>
              </div>
            </div>
          {/if}

          <div class="row" class:off={eteint}>
            <div class="lbl">
              <span>{$t('v2.cfp.lowCut' as any)}</span>
              <span class="hint">{$t('v2.cfp.lowCutHint' as any)}</span>
            </div>
            <label class="sw">
              <input type="checkbox" data-cfp="low_cut" checked={r.low_cut} onchange={() => basculer('low_cut')}
                aria-label={$t('v2.cfp.lowCut' as any)} />
              <span class="slider"></span>
            </label>
          </div>

          <div class="row" class:off={eteint}>
            <div class="lbl">
              <span>{$t('v2.cfp.phaseGuard' as any)}</span>
              <span class="hint">{$t('v2.cfp.phaseGuardHint' as any)}</span>
            </div>
            <label class="sw">
              <input type="checkbox" data-cfp="phase_guard" checked={r.phase_guard} onchange={() => basculer('phase_guard')}
                aria-label={$t('v2.cfp.phaseGuard' as any)} />
              <span class="slider"></span>
            </label>
          </div>
          {#if r.phase_guard}
            <div class="row sub" class:off={eteint}>
              <div class="lbl"><span>{$t('v2.cfp.phaseGuardMs' as any)}</span></div>
              <div class="sl">
                <input type="range" data-cfp="phase_guard_ms" min={B.phase_guard_ms.min} max={B.phase_guard_ms.max}
                  step={B.phase_guard_ms.pas} value={r.phase_guard_ms} oninput={(e) => regler('phase_guard_ms', e)}
                  aria-label={$t('v2.cfp.phaseGuardMs' as any)} />
                <span class="val">{Math.round(r.phase_guard_ms)} ms</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Le mode ITD est EXPÉRIMENTAL : bloc à part, marqué, éteint par défaut. -->
        <div class="card exp" data-cfp="experimental">
          <div class="row">
            <div class="lbl">
              <span>{$t('v2.cfp.itd' as any)} <span class="badge">{$t('v2.cfp.experimental' as any)}</span></span>
              <span class="hint">{$t('v2.cfp.itdHint' as any)}</span>
            </div>
            <label class="sw">
              <input type="checkbox" data-cfp="experimental_itd" checked={r.experimental_itd}
                onchange={() => basculer('experimental_itd')} aria-label={$t('v2.cfp.itd' as any)} />
              <span class="slider"></span>
            </label>
          </div>
          {#if r.experimental_itd}
            <div class="row sub" class:off={eteint}>
              <div class="lbl"><span>{$t('v2.cfp.itdTauMax' as any)}</span></div>
              <div class="sl">
                <input type="range" data-cfp="itd_tau_max_us" min={B.itd_tau_max_us.min} max={B.itd_tau_max_us.max}
                  step={B.itd_tau_max_us.pas} value={r.itd_tau_max_us} oninput={(e) => regler('itd_tau_max_us', e)}
                  aria-label={$t('v2.cfp.itdTauMax' as any)} />
                <span class="val">{Math.round(r.itd_tau_max_us)} µs</span>
              </div>
            </div>
            <div class="row sub" class:off={eteint}>
              <div class="lbl"><span>{$t('v2.cfp.itdSmoothing' as any)}</span></div>
              <div class="sl">
                <input type="range" data-cfp="itd_smoothing_ms" min={B.itd_smoothing_ms.min} max={B.itd_smoothing_ms.max}
                  step={B.itd_smoothing_ms.pas} value={r.itd_smoothing_ms} oninput={(e) => regler('itd_smoothing_ms', e)}
                  aria-label={$t('v2.cfp.itdSmoothing' as any)} />
                <span class="val">{Math.round(r.itd_smoothing_ms)} ms</span>
              </div>
            </div>
          {/if}
        </div>
      </fieldset>
    {/if}
  </div>
</section>

<style>
  .v2-cfp{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; max-width:820px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .lead{font-size:14px; line-height:1.6; color:var(--v2-txt2); padding:6px 0 18px; max-width:62ch}
  .state{padding:24px 0; color:var(--v2-txt3)}
  .err,.warn{padding:11px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; margin-bottom:16px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .warn b{color:var(--v2-acc-tint)}

  .reglages{border:0; margin:0; padding:0; min-width:0}
  .reglages.voile{opacity:.45; pointer-events:none; user-select:none}
  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:6px 20px 18px}
  .card.exp{margin-top:16px}
  .row{display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0;
    border-bottom:1px solid var(--v2-line)}
  .row:last-child{border-bottom:0}
  .row.sub{padding:10px 0 10px 18px}
  .row.off{opacity:.45}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:14px; font-weight:600}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:46ch}
  .hint.sous{margin:6px 0 0; max-width:none}
  .badge{display:inline-block; margin-left:8px; font:700 10px var(--v2-mono); letter-spacing:.08em; color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); border-radius:var(--v2-r-pill); padding:2px 8px; vertical-align:middle}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}

  .presets{display:flex; gap:7px; padding:14px 0 2px; flex-wrap:wrap; align-items:center}
  .presets button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:8px 15px; border-radius:var(--v2-r-pill); transition:.15s}
  .presets button:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-acc2)}
  .presets button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .presets button:disabled{cursor:default}
  .presets.mes{padding-top:10px; padding-bottom:10px; border-bottom:1px solid var(--v2-line)}
  .mesl{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .mien{display:inline-flex}
  .mien .x{padding:0 7px}

  .sl{display:flex; align-items:center; gap:14px; flex:0 0 auto}
  .sl input{width:220px; accent-color:var(--v2-acc1)}
  .val{font:12px var(--v2-mono); color:var(--v2-txt2); width:76px; text-align:right}
</style>
