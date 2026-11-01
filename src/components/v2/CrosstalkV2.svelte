<script lang="ts">
  /**
   * Crosstalk — écran de réglage du greffon audio natif PREMIUM `crosstalk`,
   * traitement pour ENCEINTES, jamais au casque (web#2580). Calqué sur
   * `CrossfeedProV2` : mêmes routes génériques des greffons natifs tiers,
   * même garde Premium, même voile PURE.
   *
   *   GET|PUT  /audio-plugins/crosstalk/zones/{zone}   réglage de la zone
   *   GET|POST /audio-plugins/crosstalk/profiles        profils nommés
   *   DELETE   /audio-plugins/crosstalk/profiles/{id}
   *
   * Le `PUT` porte le JSON de réglages ENTIER. Choisir un profil = envoyer ses
   * réglages au `PUT` de la zone.
   *
   * EXCLUSION (tune-server-rust#7616) : activer Crosstalk éteint le crossfeed
   * de la zone (intégré et Crossfeed Pro) ; l'écran le dit sous l'interrupteur.
   *
   * Aucun détail du traitement ici : seuls les textes publiés par le greffon.
   */
  import * as api from '../../lib/api';
  import { atteintLeSon } from '../../lib/porteeReglage';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { licenseState, isPremium } from '../../lib/stores/license';
  import { audiophileEnabled } from '../../lib/stores/audiophile';
  import { presenceCrosstalk } from '../../lib/stores/crosstalk';
  import { dialogs } from '../../lib/stores/dialogs';
  import { t } from '../../lib/i18n';
  import { presenceDepuis, type PresenceCrossfeedPro } from '../../lib/crossfeedPro';
  import {
    CROSSTALK_ID,
    BORNES_CROSSTALK as B,
    CURSEURS_CROSSTALK,
    DEFAUTS_CROSSTALK,
    LIBELLES_CROSSTALK,
    reglagesCrosstalk,
    profilCrosstalkActif,
    libelleProfilCrosstalk,
    valeurCrosstalk,
    type CurseurCrosstalk,
    type ReglagesCrosstalk,
  } from '../../lib/crosstalk';
  import VoilePur from './VoilePur.svelte';
  import '../../styles/tune-v2.css';

  let r = $state<ReglagesCrosstalk>({ ...DEFAUTS_CROSSTALK });
  let presence = $state<PresenceCrossfeedPro>('inconnue');
  let loading = $state(true);
  let error = $state<string | null>(null);
  /** Un 402 reçu à l'écriture : le serveur a tranché, quoi que dise la licence lue. */
  let refusPremium = $state(false);
  let profils = $state<api.ProfilGreffonNatif[]>([]);

  const zoneName = $derived($currentZone?.name ?? null);
  const pur = $derived($audiophileEnabled);
  const sansPremium = $derived(refusPremium || ($licenseState.loaded && !$isPremium));
  /** Tout ce qui rend le réglage impossible ou sans effet grise l'écran. */
  const verrouille = $derived(pur || sansPremium || presence !== 'actif');
  const profilActif = $derived(profilCrosstalkActif(r, profils));
  const eteint = $derived(!r.enabled);

  function publierPresence(p: PresenceCrossfeedPro) {
    presence = p;
    if (p !== 'inconnue') presenceCrosstalk.set(p);
  }

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    loading = true;
    api.getReglageGreffonNatif(CROSSTALK_ID, zid)
      .then((d) => {
        publierPresence(presenceDepuis(d));
        r = reglagesCrosstalk(d?.settings);
        error = null;
      })
      .catch((e) => {
        const p = presenceDepuis(null, e);
        publierPresence(p);
        error = p === 'inconnue' ? $t('v2.xtc.errLoad' as any) : null;
      })
      .finally(() => { loading = false; });
  });

  async function chargerProfils() {
    try { profils = await api.listProfilsGreffonNatif(CROSSTALK_ID); } catch { profils = []; }
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
    const envoi = reglagesCrosstalk(r);
    r = envoi;
    try {
      const res = await api.setReglageGreffonNatif(CROSSTALK_ID, zid, envoi);
      reportReach(atteintLeSon(res?.applied_live, null));
      error = null;
    } catch (e: any) {
      if (!lireRefus(e)) error = $t('v2.cfp.errSave' as any);
    }
  }

  function basculer() {
    r = { ...r, enabled: !r.enabled };
    void save();
  }
  function regler(cle: CurseurCrosstalk, e: Event) {
    r = { ...r, [cle]: Number((e.currentTarget as HTMLInputElement).value) };
    queueSave();
  }

  async function enregistrerProfil() {
    const nom = (await dialogs.prompt($t('v2.cfp.profileNamePrompt' as any)))?.trim();
    if (!nom) return;
    try {
      const p = await api.saveProfilGreffonNatif(CROSSTALK_ID, { name: nom, settings: reglagesCrosstalk(r) });
      profils = [...profils.filter((x) => x.id !== p.id), p];
      notifications.success($t('v2.cfp.profileSaved' as any).replace('{name}', p.name));
    } catch (e: any) {
      if (!lireRefus(e)) notifications.error($t('v2.cfp.profileSaveFailed' as any));
    }
  }
  function appliquerProfil(p: api.ProfilGreffonNatif) {
    // Choisir un profil, c'est vouloir l'entendre : il allume le greffon.
    r = { ...reglagesCrosstalk(p.settings), enabled: true };
    void save();
  }
  async function supprimerProfil(p: api.ProfilGreffonNatif) {
    const avant = profils;
    profils = profils.filter((x) => x.id !== p.id);
    try {
      await api.deleteProfilGreffonNatif(CROSSTALK_ID, p.id);
    } catch (e: any) {
      profils = avant;
      if (!lireRefus(e)) notifications.error($t('common.error' as any));
    }
  }
</script>

<section class="v2-xtc tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.xtc.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.crosstalk' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    <!-- En tête, toujours : traitement pour enceintes, jamais au casque. -->
    <div class="warn enceintes" role="note" data-xtc="enceintes">
      <b>{$t('v2.xtc.speakersOnly' as any)}</b>
      <span>{$t('v2.xtc.speakersOnlyNote' as any)}</span>
      <span data-xtc="mono">{$t('v2.xtc.monoNote' as any)}</span>
    </div>

    {#if error}<div class="err">{error}</div>{/if}

    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if $currentZoneId == null}
      <div class="state">{$t('v2.xtc.noZone' as any)}</div>
    {:else if presence === 'absent'}
      <div class="warn" data-xtc-motif="absent">{$t('v2.xtc.absent' as any)}</div>
    {:else}
      {#if presence === 'inactif'}
        <div class="warn" data-xtc-motif="inactif">{$t('v2.xtc.inactive' as any)}</div>
      {/if}
      {#if sansPremium}
        <div class="warn" data-xtc-motif="premium">{$t('v2.xtc.premium' as any)}</div>
      {/if}
      {#if pur}<VoilePur cle="v2.pure.veilCrosstalk" />{/if}

      <fieldset class="reglages" class:voile={verrouille} disabled={verrouille} aria-disabled={verrouille}>
        <div class="card">
          <div class="row">
            <div class="lbl">
              <span>{$t('v2.xtc.enable' as any)}</span>
              {#if zoneName}<span class="hint">{$t('v2.cfp.perZone' as any).replace('{zone}', zoneName)}</span>{/if}
              <span class="hint" data-xtc="exclusion">{$t('v2.xtc.excludesCrossfeed' as any)}</span>
            </div>
            <label class="sw">
              <input type="checkbox" data-xtc="enabled" checked={r.enabled} onchange={basculer}
                aria-label={$t('v2.xtc.enable' as any)} />
              <span class="slider"></span>
            </label>
          </div>

          <div class="presets mes" data-xtc="profils">
            <span class="mesl">{$t('v2.xtc.profiles' as any)}</span>
            {#each profils as p (p.id)}
              {@const l = libelleProfilCrosstalk(p)}
              <span class="mien">
                <button class:on={profilActif === p.id} data-profil={p.id} onclick={() => appliquerProfil(p)}>
                  {l.cle ? $t(l.cle as any) : l.nom}
                </button>
                {#if !l.cle}
                  <button class="x" data-supprimer={p.id} onclick={() => supprimerProfil(p)}
                    title={$t('v2.cfp.deleteProfile' as any)} aria-label={$t('v2.cfp.deleteProfile' as any)}>×</button>
                {/if}
              </span>
            {/each}
            <button data-xtc="save-profile" onclick={enregistrerProfil}>+ {$t('v2.cfp.saveProfile' as any)}</button>
          </div>

          {#each CURSEURS_CROSSTALK as cle (cle)}
            {@const lib = LIBELLES_CROSSTALK[cle]}
            <div class="row" class:off={eteint}>
              <div class="lbl">
                <span>{$t(lib.cle as any)}</span>
                <span class="hint">{$t(lib.note as any)}</span>
              </div>
              <div class="sl">
                <input type="range" data-xtc={cle} min={B[cle].min} max={B[cle].max} step={B[cle].pas}
                  value={r[cle]} oninput={(e) => regler(cle, e)} aria-label={$t(lib.cle as any)}
                  aria-valuetext={valeurCrosstalk(cle, r[cle])} />
                <span class="val">{valeurCrosstalk(cle, r[cle])}</span>
              </div>
            </div>
          {/each}
        </div>
      </fieldset>
    {/if}
  </div>
</section>

<style>
  .v2-xtc{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; max-width:820px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:24px 0; color:var(--v2-txt3)}
  .err,.warn{padding:11px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; margin-bottom:16px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .warn b{color:var(--v2-acc-tint)}
  .warn.enceintes{display:flex; flex-direction:column; gap:6px}

  .reglages{border:0; margin:0; padding:0; min-width:0}
  .reglages.voile{opacity:.45; pointer-events:none; user-select:none}
  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:6px 20px 18px}
  .row{display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0;
    border-bottom:1px solid var(--v2-line)}
  .row:last-child{border-bottom:0}
  .row.off{opacity:.45}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:14px; font-weight:600}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:46ch}

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
