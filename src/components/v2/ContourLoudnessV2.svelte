<script lang="ts">
  /**
   * tune-server-rust#8554 — contour de loudness qui suit le volume (ISO 226).
   *
   * Le préréglage « Loudness » de l'égaliseur est une courbe fixe ; ce
   * réglage-ci compense les courbes d'égale sonie AU NIVEAU JOUÉ : nul au
   * volume de référence, il relève le grave quand le volume baisse. Le serveur
   * calcule tout ; cet écran affiche ce que `GET /zones/{id}/eq/loudness`
   * publie (réglage, état, contour au volume courant) et écrit les seuls
   * champs touchés.
   *
   * L'état se DIT : contourné par PURE ou le bit-perfect strict, niveau
   * inconnu sur une zone en volume fixe (le niveau se règle en aval : niveau
   * manuel), pas encore appliqué sur une sortie réseau.
   *
   * Serveur antérieur (404) : rien n'est montré.
   */
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZone, currentZoneId } from '../../lib/stores/zones';
  import { t } from '../../lib/i18n';

  let etat = $state<api.LoudnessState | null>(null);
  let erreur = $state(false);
  let enCours = $state(false);

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { etat = null; return; }
    lire(zid).then((e) => { etat = e; });
  });

  /** `null` sur toute erreur, y compris un client de test qui ne fournit pas
   *  la route : l'écran de l'égaliseur ne doit jamais tomber à cause d'elle. */
  async function lire(zid: number): Promise<api.LoudnessState | null> {
    try {
      const e = await api.getLoudness(zid);
      return e?.settings ? e : null;
    } catch {
      return null;
    }
  }

  // Le contour dépend du VOLUME : se relire quand il bouge, une demi-seconde
  // après le dernier cran (comme la compensation de niveau).
  let volumeVu: number | undefined;
  $effect(() => {
    const vol = $currentZone?.volume;
    const zid = $currentZoneId;
    if (volumeVu === undefined || vol === volumeVu || zid == null || !etat) { volumeVu = vol; return; }
    volumeVu = vol;
    const h = setTimeout(() => {
      lire(zid).then((e) => { if (e) etat = e; });
    }, 500);
    return () => clearTimeout(h);
  });

  async function ecrire(patch: Partial<api.LoudnessSettings>) {
    const zid = zoneRequise();
    if (zid == null || !etat || enCours) return;
    const avant = etat;
    etat = { ...etat, settings: { ...etat.settings, ...patch } };
    enCours = true;
    try {
      const res = await api.setLoudness(zid, patch);
      if (res?.settings) etat = res;
      erreur = false;
    } catch {
      etat = avant;
      erreur = true;
    } finally {
      enCours = false;
    }
  }

  const s = $derived(etat?.settings ?? null);

  function db(v: number): string {
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  }

  const ligneEtat = $derived.by(() => {
    if (!etat) return '';
    switch (etat.status) {
      case 'active': {
        const p = etat.contour_db ?? [];
        const bas = p.find((x) => x.hz === 63)?.db ?? 0;
        const haut = p.find((x) => x.hz === 10000)?.db ?? 0;
        if (Math.abs(bas) < 0.05 && Math.abs(haut) < 0.05) return $t('v2.loud.statusFlat' as any);
        return $t('v2.loud.statusActive' as any).replace('{low}', db(bas)).replace('{high}', db(haut));
      }
      case 'bypassed_pure': return $t('v2.loud.statusPure' as any);
      case 'bypassed_strict_bitperfect': return $t('v2.loud.statusStrict' as any);
      case 'level_unknown_fixed_volume': return $t('v2.loud.statusUnknown' as any);
      case 'output_not_supported': return $t('v2.loud.statusUnsupported' as any);
      default: return '';
    }
  });

  const valeur = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
</script>

{#if etat && s}
  <div class="ld" data-testid="contour-loudness">
    <div class="tete">
      <div class="lbl">
        <span>{$t('v2.loud.title' as any)}</span>
        <span class="hint">{$t('v2.loud.hint' as any)}</span>
      </div>
      <label class="sw">
        <input type="checkbox" checked={s.enabled} disabled={enCours}
          onchange={() => ecrire({ enabled: !s.enabled })}
          aria-label={$t('v2.loud.title' as any)} />
        <span class="slider"></span>
      </label>
    </div>

    {#if s.enabled}
      <p class="etat" data-testid="contour-loudness-etat" data-status={etat.status}>{ligneEtat}</p>

      <label class="ligne">
        <input type="checkbox" checked={s.bass_only} disabled={enCours}
          onchange={() => ecrire({ bass_only: !s.bass_only })} />
        <span>{$t('v2.loud.bassOnly' as any)}</span>
      </label>

      <label class="curseur">
        <span>{$t('v2.loud.intensity' as any)} <b>{Math.round(s.intensity_pct)} %</b></span>
        <input type="range" min="0" max="100" step="5" value={s.intensity_pct} disabled={enCours}
          onchange={(e) => ecrire({ intensity_pct: valeur(e) })} data-testid="contour-loudness-intensite" />
      </label>

      <div class="seg" role="radiogroup" aria-label={$t('v2.loud.source' as any)}>
        <button role="radio" aria-checked={s.level_source === 'volume'} class:on={s.level_source === 'volume'}
          disabled={enCours} onclick={() => ecrire({ level_source: 'volume' })}>{$t('v2.loud.sourceVolume' as any)}</button>
        <button role="radio" aria-checked={s.level_source === 'manual'} class:on={s.level_source === 'manual'}
          disabled={enCours} onclick={() => ecrire({ level_source: 'manual' })}>{$t('v2.loud.sourceManual' as any)}</button>
      </div>

      {#if s.level_source === 'manual'}
        <label class="curseur">
          <span>{$t('v2.loud.manualLevel' as any)} <b>{db(s.manual_level_db)} dB</b></span>
          <input type="range" min="-60" max="0" step="1" value={s.manual_level_db} disabled={enCours}
            onchange={(e) => ecrire({ manual_level_db: valeur(e) })} />
        </label>
      {:else}
        <label class="curseur">
          <span>{$t('v2.loud.reference' as any)} <b>{db(s.reference_volume_db)} dB</b></span>
          <input type="range" min="-40" max="0" step="1" value={s.reference_volume_db} disabled={enCours}
            onchange={(e) => ecrire({ reference_volume_db: valeur(e) })} />
        </label>
      {/if}
      <span class="note">{$t('v2.loud.referenceHelp' as any)}</span>
    {/if}
    {#if erreur}<span class="err">{$t('v2.loud.errSave' as any)}</span>{/if}
  </div>
{/if}

<style>
  .ld{display:flex; flex-direction:column; gap:12px; margin-top:18px;
    padding:16px 20px; border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2)}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:24px}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:600}
  .hint, .note{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3); max-width:60ch}
  .etat{margin:0; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .ligne{display:flex; align-items:center; gap:8px; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .curseur{display:flex; flex-direction:column; gap:6px; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .curseur input{width:100%; max-width:360px}
  .seg{display:inline-flex; gap:4px; flex-wrap:wrap}
  .seg button{padding:6px 12px; border-radius:999px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .seg button.on{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); color:var(--v2-on-acc, #fff); border-color:transparent}
  .err{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-danger)}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}
</style>
