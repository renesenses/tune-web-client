<script lang="ts">
  import { t } from '../lib/i18n';
  import type { EqBand } from '../lib/api';

  const PRESETS = [
    { value: 'flat', label: 'Flat' },
    { value: 'bass_boost', label: 'Bass Boost' },
    { value: 'treble_boost', label: 'Treble Boost' },
    { value: 'vocal', label: 'Vocal' },
    { value: 'rock', label: 'Rock' },
    { value: 'jazz', label: 'Jazz' },
    { value: 'classical', label: 'Classical' },
  ];

  interface Props {
    /** Préréglage actif, ou '' quand aucun nom ne peut être affirmé. */
    current: string;
    onSelect: (preset: string) => void;
    /** Mode PURE actif sur la zone : l'égaliseur n'est jamais appliqué. */
    pureMode?: boolean;
    /** Les bandes RÉELLES de la zone, lues sur le serveur. */
    bands?: EqBand[];
    /** L'égaliseur est-il activé sur la zone ? */
    enabled?: boolean;
    /**
     * L'égaliseur est hors de l'offre en cours. `POST /zones/{id}/eq` est
     * gardée côté serveur par `require_premium(…, Feature::DspEq)` et répond
     * 402 : laisser cliquer sept préréglages qui seront tous refusés, c'était
     * le signalement de Daniel POUCHON (fil 1364, #2419).
     */
    locked?: boolean;
  }
  let {
    current,
    onSelect,
    pureMode = false,
    bands = [],
    enabled = true,
    locked = false,
  }: Props = $props();

  // Échelle d'affichage. Le serveur accepte ±12 dB (EqualizerView : MIN_GAIN /
  // MAX_GAIN) ; on borne ici pour qu'une valeur aberrante ne fasse pas sortir
  // une barre du cadre plutôt que de mentir sur sa hauteur.
  const MAX_DB = 12;

  let hasCurve = $derived(bands.length > 0);
  let isFlat = $derived(hasCurve && bands.every((b) => (b.gain ?? 0) === 0));

  /** Hauteur en % de la demi-hauteur du cadre, signe conservé. */
  function barPct(gain: number): number {
    const clamped = Math.max(-MAX_DB, Math.min(MAX_DB, gain ?? 0));
    return (Math.abs(clamped) / MAX_DB) * 100;
  }
</script>

<div class="np-eq">
  {#if locked}
    <!-- Une limite d'offre n'est pas une panne, et doit se lire comme telle.
         Le refus du serveur (402) ne vivait que dans un `console.error` et
         dans une notification fugace en anglais : à l'écran, le bouton se
         cliquait et il ne se passait rien. -->
    <p class="eq-premium-notice">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>{$t('nowplaying.eqPremium')}</span>
    </p>
  {/if}

  {#if pureMode}
    <!-- En mode PURE, load_eq_processor n'est jamais construit : le PCM atteint
         la sortie intact. Laisser cliquer un préréglage qui ne fera rien, sans
         rien dire, c'était le signalement de Bilou. -->
    <p class="eq-pure-notice">
      Mode PURE actif sur cette zone : le signal est transmis intact, sans aucun
      traitement. Les préréglages ci-dessous resteront donc sans effet tant que
      le mode PURE est activé.
    </p>
  {/if}

  {#if hasCurve}
    <!-- La COURBE RÉELLE de la zone. Le panneau n'affichait que des boutons de
         préréglage, et supposait « Flat » à chaque ouverture : un Bass Boost
         posé la veille s'affichait comme Flat (#2037). Ces barres sont lues sur
         le serveur, elles ne supposent rien. -->
    <div class="eq-curve" aria-hidden="true">
      {#each bands as band}
        <div class="eq-band" title="{Math.round(band.freq)} Hz · {(band.gain ?? 0) > 0 ? '+' : ''}{(band.gain ?? 0).toFixed(1)} dB">
          <div class="eq-half up">
            {#if (band.gain ?? 0) > 0}
              <div class="eq-fill up" style="height: {barPct(band.gain)}%"></div>
            {/if}
          </div>
          <div class="eq-zero"></div>
          <div class="eq-half down">
            {#if (band.gain ?? 0) < 0}
              <div class="eq-fill down" style="height: {barPct(band.gain)}%"></div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <p class="eq-state">
      {#if !enabled}
        {$t('nowplaying.eqDisabled')}
      {:else if isFlat}
        {$t('nowplaying.eqFlat')}
      {:else if current}
        {PRESETS.find((p) => p.value === current)?.label ?? current}
      {:else}
        <!-- Le serveur ne mémorise pas QUEL préréglage a produit cette courbe.
             Nommer au hasard serait retomber exactement dans le défaut qu'on
             corrige : on dit « personnalisé », et la courbe parle d'elle-même. -->
        {$t('nowplaying.eqCustom')}
      {/if}
    </p>
  {/if}

  <div class="eq-presets">
    {#each PRESETS as preset}
      <button
        class="eq-preset"
        class:active={current === preset.value}
        disabled={locked}
        title={locked ? $t('nowplaying.eqPremium') : undefined}
        onclick={() => onSelect(preset.value)}
      >
        {preset.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .np-eq {
    background: rgba(255,255,255,0.04);
    padding: 10px;
    border-radius: 8px;
    margin-top: 8px;
  }
  .eq-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .eq-pure-notice {
    margin: 0 0 0.6rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--tune-text-muted, #a0a0a8);
    max-width: 48ch;
  }
  .eq-curve {
    display: flex;
    align-items: stretch;
    gap: 3px;
    height: 54px;
    margin-bottom: 6px;
  }
  .eq-band {
    flex: 1;
    min-width: 4px;
    display: flex;
    flex-direction: column;
  }
  .eq-half {
    flex: 1;
    display: flex;
  }
  .eq-half.up { align-items: flex-end; }
  .eq-half.down { align-items: flex-start; }
  .eq-fill {
    width: 100%;
    background: var(--tune-accent, #f0b429);
    border-radius: 2px;
  }
  /* La ligne du zéro : sans elle, une courbe entièrement négative ressemble à
     une courbe positive retournée. */
  .eq-zero {
    height: 1px;
    background: rgba(255,255,255,0.18);
  }
  .eq-state {
    margin: 0 0 0.6rem;
    font-size: 0.78rem;
    color: var(--tune-text-secondary, #c0c0c8);
  }
  .eq-preset {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: var(--tune-text, #e8e8ea);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .eq-preset:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
  /* Un bouton refusé doit se VOIR refusé : sans ça, on garde le clic muet en
     n'ayant fait que déplacer le silence. */
  .eq-preset:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .eq-premium-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 0.6rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--tune-accent, #f0b429);
    max-width: 48ch;
  }
  .eq-premium-notice svg { flex: none; }
  .eq-preset.active {
    background: var(--tune-accent, #f0b429);
    color: #1a1a1a;
    border-color: transparent;
  }
</style>
