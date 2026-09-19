<script lang="ts">
  /**
   * Latence de commande des sorties — portage du bouton « RTT » de
   * `ZoneManagerView`, que la phase 5 supprime.
   *
   * `POST /zone-manager/measure-latency` sonde TOUTES les zones d'un coup
   * (cinq allers-retours de commande par sortie) ; l'ancien écran lançait la
   * mesure globale pour n'en garder qu'une ligne. On montre ici tout ce que
   * le serveur rend : la médiane quand la sortie a répondu, sinon la raison.
   *
   * Ce que la mesure N'EST PAS : la latence audio. Le serveur la rend `null`
   * (`audio_latency_ms`) — c'est le temps de réponse de la commande, utile
   * pour repérer une sortie lente ou injoignable, pas pour caler un délai.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  interface Mesure {
    zone_id: number;
    zone_name: string;
    status: string;
    control_rtt: { p50_ms: number; p95_ms?: number } | null;
  }

  let mesures = $state<Mesure[] | null>(null);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  const RAISONS: Record<string, string> = {
    probe_failed: 'v2.zone.latencyProbeFailed',
    output_not_registered: 'v2.zone.latencyNotRegistered',
    no_output_assigned: 'v2.zone.latencyNoOutput',
  };

  async function mesurer() {
    occupe = true; erreur = null;
    try {
      const r = await api.measureLatency();
      mesures = r?.latencies ?? [];
    } catch (e: any) {
      erreur = e?.message || $t('common.error' as any);
    }
    occupe = false;
  }

  function valeur(m: Mesure): string {
    if (typeof m.control_rtt?.p50_ms === 'number') return `${Math.round(m.control_rtt.p50_ms * 10) / 10} ms`;
    return $t((RAISONS[m.status] ?? 'v2.zone.latencyProbeFailed') as any);
  }
</script>

<section class="latence">
  <div class="ph">
    <span class="cl">{$t('zone.latency' as any)}</span>
    <button class="v2-btn mesurer" disabled={occupe} onclick={mesurer}>
      {occupe ? $t('common.loading' as any) : $t('v2.zone.latencyMeasure' as any)}
    </button>
  </div>
  <p class="phint">{$t('v2.zone.latencyHint' as any)}</p>
  {#if erreur}<div class="errline">{erreur}</div>{/if}
  {#if mesures}
    <div class="lignes">
      {#each mesures as m (m.zone_id)}
        <div class="ligne" class:ko={typeof m.control_rtt?.p50_ms !== 'number'}>
          <span class="zn">{m.zone_name}</span>
          <span class="val">{valeur(m)}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .latence{margin-top:22px}
  .ph{display:flex; align-items:center; justify-content:space-between; gap:10px}
  .cl{font:700 11px var(--v2-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .phint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); margin:8px 0 0}
  .errline{margin-top:8px; font-size:12px; color:var(--v2-danger)}
  .lignes{display:flex; flex-direction:column; gap:1px; margin-top:10px}
  .ligne{display:flex; justify-content:space-between; gap:12px; padding:7px 10px; border-radius:9px; font-size:13px; color:var(--v2-txt2)}
  .ligne:hover{background:var(--v2-hover)}
  .val{font:12px var(--v2-mono); color:var(--v2-acc-tint)}
  .ligne.ko .val{color:var(--v2-txt3)}
  .v2-btn{height:30px; padding:0 13px; font-size:11.5px}
</style>
