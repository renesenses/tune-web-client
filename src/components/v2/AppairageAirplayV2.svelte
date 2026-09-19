<script lang="ts">
  /**
   * Appairage AirPlay 2 par code PIN (#1135) — portage d'`AirplayPairingModal`,
   * que la phase 5 supprime avec `ZoneManagerView`.
   *
   * Pour les récepteurs qui exigent un appairage HomeKit (TV Samsung et LG en
   * AirPlay 2 seul, Apple TV) : on démarre, le récepteur affiche un code, on
   * interroge le statut jusqu'à ce qu'il le réclame, on renvoie le code, puis
   * on attend `connected` ou `failed:<cause>`. Flux serveur :
   * `routes/airplay_pairing.rs`, monté sous `/outputs`.
   *
   * ⚠️ Ce n'est PAS le même flux que le bouton « Appairer » de Réglages →
   * Audio → Appareils réseau (`POST /devices/{id}/pair`, qui parle au port
   * 7000 du récepteur). Les deux coexistaient dans l'ancienne interface ;
   * celui-ci passe par le démon AirPlay 2 de Tune.
   *
   * Le sondage s'arrête quand le panneau se ferme ou disparaît : une boucle
   * orpheline continuerait d'interroger le serveur toutes les 1,5 s.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  let { deviceId, deviceName = '', onClose, intervalle = 1500 }: {
    deviceId: string;
    deviceName?: string;
    onClose: () => void;
    /** Délai entre deux lectures du statut, en ms. */
    intervalle?: number;
  } = $props();

  type Phase = 'idle' | 'starting' | 'waiting_pin' | 'pin_entry' | 'submitting' | 'connected' | 'failed';
  let phase = $state<Phase>('idle');
  let pin = $state('');
  let erreur = $state('');
  let sondage = false;

  $effect(() => () => { sondage = false; });

  async function sonder() {
    if (sondage) return;
    sondage = true;
    while (sondage) {
      let statut: string;
      try {
        statut = (await api.getAirplayPairStatus(deviceId)).status || 'idle';
      } catch (e: any) {
        erreur = e?.message || $t('common.error' as any);
        phase = 'failed'; sondage = false;
        return;
      }
      if (!sondage) return;
      if (statut === 'pin_requested') {
        if (phase !== 'pin_entry' && phase !== 'submitting') phase = 'pin_entry';
      } else if (statut === 'connected') {
        phase = 'connected'; sondage = false;
        setTimeout(() => onClose(), 1200);
        return;
      } else if (statut.startsWith('failed:')) {
        erreur = statut.slice('failed:'.length) || $t('common.error' as any);
        phase = 'failed'; sondage = false;
        return;
      }
      await new Promise((r) => setTimeout(r, intervalle));
    }
  }

  async function demarrer() {
    erreur = ''; pin = ''; phase = 'starting';
    try {
      await api.startAirplayPairing(deviceId);
      phase = 'waiting_pin';
      void sonder();
    } catch (e: any) {
      erreur = e?.message || $t('common.error' as any);
      phase = 'failed';
    }
  }

  async function envoyer() {
    const code = pin.trim();
    if (!code) return;
    phase = 'submitting'; erreur = '';
    try {
      await api.submitAirplayPairPin(deviceId, code);
      // Le démon dit connected/failed par pair-status : on continue d'écouter.
      void sonder();
    } catch (e: any) {
      erreur = e?.message || $t('common.error' as any);
      phase = 'failed';
    }
  }

  function fermer() { sondage = false; onClose(); }
</script>

<section class="appairage" aria-label={$t('airplay.pairTitle' as any)}>
  <div class="tete">
    <span class="titre">{$t('airplay.pairTitle' as any)}{#if deviceName} — {deviceName}{/if}</span>
    <button class="v2-btn fermer" onclick={fermer}>{$t('common.close' as any)}</button>
  </div>
  {#if erreur}<div class="errline">{erreur}</div>{/if}

  {#if phase === 'idle'}
    <p class="hint">{$t('airplay.pairIntro' as any)}</p>
    <button class="v2-btn primaire demarrer" onclick={demarrer}>{$t('airplay.pairStart' as any)}</button>
  {:else if phase === 'starting' || phase === 'waiting_pin'}
    <p class="hint attente">{$t('airplay.pairWaiting' as any)}</p>
  {:else if phase === 'pin_entry' || phase === 'submitting'}
    <p class="hint">{$t('airplay.pairEnterCode' as any)}</p>
    <div class="ligne">
      <input class="pin" type="text" inputmode="numeric" maxlength="8" bind:value={pin}
        aria-label={$t('airplay.pairEnterCode' as any)} disabled={phase === 'submitting'}
        onkeydown={(e) => { if (e.key === 'Enter') envoyer(); }} />
      <button class="v2-btn primaire envoyer" onclick={envoyer} disabled={phase === 'submitting' || !pin.trim()}>
        {$t('airplay.pairSubmit' as any)}
      </button>
    </div>
  {:else if phase === 'connected'}
    <p class="okline">✓ {$t('airplay.pairConnected' as any)}</p>
  {:else}
    <button class="v2-btn reessayer" onclick={demarrer}>{$t('airplay.pairRetry' as any)}</button>
  {/if}
</section>

<style>
  .appairage{margin-top:14px; padding:12px 14px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface2)}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:10px}
  .titre{font-size:13px; font-weight:600; color:var(--v2-txt)}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); margin:8px 0}
  .ligne{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .pin{width:120px; height:34px; border-radius:9px; border:1px solid var(--v2-acc2); background:var(--v2-surface);
    color:var(--v2-txt); font:15px var(--v2-mono); letter-spacing:.3em; padding:0 11px; outline:none}
  .errline{margin-top:8px; font-size:12px; color:var(--v2-danger)}
  .okline{margin-top:8px; font-size:12.5px; color:var(--v2-acc-tint)}
</style>
