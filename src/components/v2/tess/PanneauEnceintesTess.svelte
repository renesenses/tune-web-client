<script lang="ts">
  /**
   * rc14 (GO du 25/11, demande de Rémi) — le panneau du greffon « Réglage des
   * enceintes » (`speaker-setup`), sur le modèle de l'écran de réglage des
   * enceintes des lecteurs audiophiles.
   *
   * Une ligne par voie QUI ARRIVE au greffon (`voies` : celles que le serveur
   * a résolues, après repli mono ou réaffectation) : nom de la voie, distance
   * en cm avec le délai qui en découle, gain en dB, interrupteur de phase ;
   * puis l'inversion globale et le texte d'aide (distances d'abord, niveaux
   * ensuite au sonomètre ou au micro calibré).
   *
   * Le délai affiché est celui du serveur : écart avec l'enceinte la plus
   * lointaine, à 343 m/s. Chaque geste remonte des réglages COMPLETS
   * (`onChange`), envoyés avec la chaîne entière par `PUT /zones/{id}/tess`.
   */
  import { t } from '../../../lib/i18n';
  import {
    reglagesEnceintes, retardsMs, reserveEnceintesDb, avecVoieEnceinte, avecInversionGlobale,
    cleNomDeVoie, BORNES_ENCEINTES_DEFAUT, type BornesEnceintes,
  } from '../../../lib/tessPanneaux';
  import InterrupteurTess from './InterrupteurTess.svelte';

  let {
    reglages,
    voies = 2,
    bornes = BORNES_ENCEINTES_DEFAUT,
    bloque = false,
    onChange,
  }: {
    reglages: Record<string, unknown> | null;
    /** Le nombre de voies qui arrivent au greffon. */
    voies?: number;
    bornes?: BornesEnceintes;
    bloque?: boolean;
    onChange: (r: Record<string, unknown>) => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const n = $derived(Math.max(1, Math.min(bornes.voiesMax, Math.round(voies))));
  const r = $derived(reglagesEnceintes(reglages, n, bornes));
  const retards = $derived(retardsMs(r, n));
  const latence = $derived(retards.length ? Math.max(...retards) : 0);
  const reserve = $derived(reserveEnceintesDb(r, n));
  const nom = (i: number) => {
    const cle = cleNomDeVoie(i, n);
    return cle ? tr(cle) : tr('tess.spk.ch.other').replace('{n}', String(i + 1));
  };
  const ms = (x: number) => `${x.toFixed(2)} ms`;
  const db = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)} dB`;
  const lire = (e: Event) => Number((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
</script>

<div class="enceintes" data-tess-enceintes data-tess-voies={n}>
  <p class="aide" data-tess-enceintes-aide>{tr('tess.spk.help')}</p>
  <p class="note" data-tess-enceintes-voies>{tr('tess.spk.channelsNote').replace('{n}', String(n))}</p>

  <div class="defile">
    <table class="voies">
      <thead>
        <tr>
          <th scope="col">{tr('tess.spk.channel')}</th>
          <th scope="col">{tr('tess.spk.distance')}</th>
          <th scope="col">{tr('tess.spk.delay')}</th>
          <th scope="col">{tr('tess.spk.gain')}</th>
          <th scope="col">{tr('tess.spk.phase')}</th>
        </tr>
      </thead>
      <tbody>
        {#each r.channels.slice(0, n) as v, i (i)}
          <tr data-tess-voie={i}>
            <th scope="row" class="nom">{nom(i)}</th>
            <td>
              <span class="saisie">
                <input type="number" inputmode="decimal" min={bornes.distance.min} max={bornes.distance.max} step="0.5"
                       value={v.distance_cm} disabled={bloque} data-tess-spk-distance={i}
                       aria-label={`${tr('tess.spk.distance')} — ${nom(i)}`}
                       onchange={(e) => onChange(avecVoieEnceinte(reglages, n, i, 'distance_cm', lire(e), bornes))} />
                <span class="unite">{tr('tess.spk.cm')}</span>
              </span>
            </td>
            <td class="delai" data-tess-spk-delai={i}>{ms(retards[i] ?? 0)}</td>
            <td>
              <span class="saisie">
                <input type="number" inputmode="decimal" min={bornes.gain.min} max={bornes.gain.max} step="0.5"
                       value={v.gain_db} disabled={bloque} data-tess-spk-gain={i}
                       aria-label={`${tr('tess.spk.gain')} — ${nom(i)}`}
                       onchange={(e) => onChange(avecVoieEnceinte(reglages, n, i, 'gain_db', lire(e), bornes))} />
                <span class="unite">dB</span>
              </span>
            </td>
            <td>
              <InterrupteurTess data-tess-spk-phase={i} checked={v.invert} disabled={bloque}
                                label={`${tr('tess.spk.invert')} — ${nom(i)}`}
                                onToggle={(x) => onChange(avecVoieEnceinte(reglages, n, i, 'invert', x, bornes))} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <InterrupteurTess data-tess-spk-inversion-globale checked={r.invert_all} disabled={bloque}
                    texte={tr('tess.spk.invertAll')} label={tr('tess.spk.invertAll')}
                    onToggle={(x) => onChange(avecInversionGlobale(reglages, n, x, bornes))} />

  <p class="note" data-tess-spk-latence>{tr('tess.spk.latency').replace('{ms}', ms(latence))}</p>
  {#if reserve < 0}
    <p class="note" data-tess-spk-reserve>{tr('tess.spk.reserve').replace('{db}', db(reserve))}</p>
  {/if}
</div>

<style>
  .enceintes{display:flex; flex-direction:column; gap:12px; min-width:0}
  .aide{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt2); line-height:1.5; font-size:calc(13px * var(--v2-txt-echelle, 1)); max-width:70ch}
  .note{margin:0; color:var(--v2-txt2); line-height:1.5; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .defile{overflow-x:auto}
  .voies{border-collapse:collapse; width:100%; min-width:460px}
  .voies th,.voies td{padding:6px 8px; text-align:left; white-space:nowrap}
  .voies thead th{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); text-transform:uppercase;
    letter-spacing:.04em; border-bottom:1px solid var(--v2-line)}
  .voies tbody tr + tr td,.voies tbody tr + tr th{border-top:1px solid var(--v2-line)}
  .nom{font-weight:600; color:var(--v2-txt)}
  .saisie{display:inline-flex; align-items:center; gap:6px}
  .saisie input{background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:8px; color:var(--v2-txt);
    font:inherit; padding:6px 8px; width:84px}
  .unite,.delai{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
</style>
