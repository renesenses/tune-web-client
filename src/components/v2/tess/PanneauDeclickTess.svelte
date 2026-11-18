<script lang="ts">
  /**
   * TESS W3 — panneau « Declick » temps réel (greffon `declick-live`, T13),
   * PREMIUM (décision P1).
   *
   * Réglages du greffon (sdk/tune-plugin-declick-live) : seuil de détection
   * de 4 à 30 (8 par défaut), anticipation de 10 à 20 ms (15 par défaut),
   * annoncée à l'hôte comme latence. Le statut vient du chemin du signal
   * publié par le serveur : actif, ou éteint avec son motif.
   */
  import { t } from '../../../lib/i18n';
  import { isPremium } from '../../../lib/stores/license';
  import { ecrireChaineTess, greffonPremium, type ZoneTess } from '../../../lib/tess/contrat';
  import { avecActivation, avecReglages, maillon, sansGreffon } from '../../../lib/tess/chaineTess';
  import { motifEtape, remplir } from '../../../lib/tess/libelles';

  const ID = 'declick-live';
  const SEUIL = { min: 4, max: 30, pas: 0.5, defaut: 8 } as const;
  const ANTICIPATION = { min: 10, max: 20, pas: 1, defaut: 15 } as const;

  let { zone, onZone = () => {} }: { zone: ZoneTess; onZone?: (z: ZoneTess) => void } = $props();

  let enCours = $state(false);
  let refus = $state<string | null>(null);

  const m = $derived(maillon(zone.chain, ID));
  const actif = $derived(m?.enabled === true);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const seuil = $derived(num(m?.settings?.threshold, SEUIL.defaut));
  const anticipation = $derived(num(m?.settings?.lookahead_ms, ANTICIPATION.defaut));
  const verrouPremium = $derived(greffonPremium(zone, ID) && !$isPremium);
  const etape = $derived(zone.signal_path.find((e) => e.code === 'plugin' && e.plugin_id === ID) ?? null);
  const cadence = $derived.by(() => {
    const s = zone.signal_path.find((e) => e.code === 'source')?.params?.sample_rate_hz;
    return typeof s === 'number' && s > 0 ? s : null;
  });

  const statut = $derived.by(() => {
    if (!etape || !etape.requested) return $t('tess.value.off');
    if (!etape.effective) return motifEtape(etape, zone, $t) ?? $t('tess.value.off');
    const morceaux = [$t('tess.declick.active')];
    if (etape.latency_frames !== null && cadence) {
      morceaux.push(remplir($t('tess.declick.latency'), { ms: Math.round((etape.latency_frames / cadence) * 1000) }));
    }
    const repares = etape.params?.clicks_repaired;
    if (typeof repares === 'number') morceaux.push(remplir($t('tess.declick.repaired'), { n: repares }));
    return morceaux.join(' · ');
  });

  async function ecrire(chaine: ZoneTess['chain']) {
    enCours = true;
    refus = null;
    try {
      const r = await ecrireChaineTess(zone.zone_id, chaine);
      if (r.ok) onZone(r.zone);
      else refus = r.refus.code === 'premium_required' ? $t('tess.reason.premiumRequired') : `${$t('tess.refusChaine')} ${r.refus.detail ?? ''}`.trim();
    } catch {
      refus = $t('tess.refusChaine');
    } finally {
      enCours = false;
    }
  }

  /** Le greffon lit aussi `enabled` dans ses réglages : on garde les deux d'accord. */
  function basculer(on: boolean) {
    void ecrire(avecReglages(avecActivation(zone.chain, ID, on), ID, { enabled: on }));
  }

  function regler(cle: 'threshold' | 'lookahead_ms', valeur: number) {
    void ecrire(avecReglages(zone.chain, ID, { [cle]: valeur }));
  }
</script>

{#if m}
  <section class="pan" data-tess-panneau="declick-live" aria-busy={enCours}>
    <header>
      <div class="titre">
        <h2>{$t('tess.plugin.declickLive')}</h2>
        {#if greffonPremium(zone, ID)}<span class="prem">{$t('v2.plug.premium')}</span>{/if}
      </div>
      <label class="on">
        <span>{$t('tess.value.on')}</span>
        <input type="checkbox" checked={actif} disabled={enCours || (verrouPremium && !actif)} data-tess="actif"
          onchange={(e) => basculer((e.currentTarget as HTMLInputElement).checked)} />
      </label>
    </header>
    <p class="lead">{$t('tess.declick.lead')}</p>

    {#if verrouPremium}
      <p class="note" data-tess="premium">{$t('tess.declick.premiumNote')}</p>
    {/if}

    <div class="statut" data-tess="statut" class:eteint={!etape?.effective}>
      <span class="lbl">{$t('tess.declick.status')}</span>
      <span>{statut}</span>
    </div>

    <label class="reglage">
      <span class="txt">
        <span class="nom">{$t('tess.declick.threshold')} <b data-tess="valeur-seuil">{seuil}</b></span>
        <span class="hint">{$t('tess.declick.thresholdHint')}</span>
      </span>
      <input type="range" min={SEUIL.min} max={SEUIL.max} step={SEUIL.pas} value={seuil} data-tess="seuil"
        disabled={enCours || verrouPremium} onchange={(e) => regler('threshold', Number((e.currentTarget as HTMLInputElement).value))} />
    </label>

    <label class="reglage">
      <span class="txt">
        <span class="nom">{$t('tess.declick.lookahead')} <b data-tess="valeur-anticipation">{anticipation} ms</b></span>
        <span class="hint">{$t('tess.declick.lookaheadHint')}</span>
      </span>
      <input type="range" min={ANTICIPATION.min} max={ANTICIPATION.max} step={ANTICIPATION.pas} value={anticipation} data-tess="anticipation"
        disabled={enCours || verrouPremium} onchange={(e) => regler('lookahead_ms', Number((e.currentTarget as HTMLInputElement).value))} />
    </label>

    {#if refus}
      <p class="err" role="alert" data-tess="refus-chaine">{refus}</p>
    {/if}

    <div class="pied">
      <button type="button" class="retirer" disabled={enCours} data-tess="retirer" onclick={() => ecrire(sansGreffon(zone.chain, ID))}>
        × {$t('tess.removePlugin')}
      </button>
    </div>
  </section>
{/if}

<style>
  .pan{display:flex; flex-direction:column; gap:14px; padding:24px 28px; border:1px solid var(--v2-line);
    border-radius:var(--v2-r-card); background:var(--v2-surface); color:var(--v2-txt); font-family:var(--v2-sans)}
  header{display:flex; align-items:center; justify-content:space-between; gap:16px}
  .titre{display:flex; align-items:center; gap:10px}
  h2{margin:0; font-size:calc(26px * var(--v2-txt-echelle, 1)); font-weight:700}
  .prem{text-transform:uppercase; font:700 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); padding:2px 6px; border-radius:4px; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .on{display:flex; align-items:center; gap:10px; color:var(--v2-txt2)}
  .on input{width:20px; height:20px; accent-color:var(--v2-acc1)}
  .lead{margin:0; color:var(--v2-txt2); line-height:1.5; max-width:70ch}
  .note{margin:0; padding:10px 14px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2)}
  .statut{display:flex; gap:12px; padding:12px 18px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface2)}
  .statut.eteint{color:var(--v2-txt3)}
  .lbl{color:var(--v2-txt3)}
  .reglage{display:flex; align-items:center; justify-content:space-between; gap:20px; padding:10px 0; border-bottom:1px solid var(--v2-line)}
  .reglage input{flex:0 0 220px; accent-color:var(--v2-acc1)}
  .txt{display:flex; flex-direction:column; gap:3px; min-width:0}
  .nom{font-weight:600}
  .nom b{font-family:var(--v2-mono); color:var(--v2-acc1); margin-left:6px}
  .hint{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); line-height:1.5}
  .err{margin:0; padding:11px 14px; border-radius:10px; color:var(--v2-danger); border:1px solid var(--v2-danger-bd); background:var(--v2-danger-soft)}
  .pied{display:flex; justify-content:flex-end}
  .retirer{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); cursor:pointer;
    font:500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:10px 18px; border-radius:var(--v2-r-pill)}
  .retirer:disabled{opacity:.45; cursor:default}
</style>
