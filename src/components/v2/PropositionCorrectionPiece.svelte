<script lang="ts">
  /**
   * web#2706 — la correction proposée par le greffon `calibration` (sur une
   * simulation ou sur une mesure) et son bouton « Appliquer ». Les bandes
   * sont des COUPES seulement : le greffon ne relève jamais un creux.
   */
  import { t } from '../../lib/i18n';
  import { CIBLES, LIBELLES_CIBLES, type Proposition, type TypeCible } from '../../lib/correctionPiece';
  import CourbeCorrectionPiece from './CourbeCorrectionPiece.svelte';

  let {
    proposition, cible, verrouille, application, onCible, onAppliquer,
  }: {
    proposition: Proposition;
    cible: TypeCible;
    verrouille: boolean;
    application: 'repos' | 'en_cours' | 'faite';
    onCible: (c: TypeCible) => void;
    onAppliquer: () => void;
  } = $props();

  const series = $derived([
    { cle: 'mesure' as const, freqs: proposition.courbes.freqs_hz, db: proposition.courbes.mesure_db },
    { cle: 'cible' as const, freqs: proposition.courbes.freqs_hz, db: proposition.courbes.cible_db },
    { cle: 'corrigee' as const, freqs: proposition.courbes.freqs_hz, db: proposition.courbes.corrigee_db },
  ]);
  const vide = $derived(proposition.bandes.length === 0);
  const f0 = (v: number) => Math.round(v).toString();
  const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
</script>

<div class="prop" data-room="proposition">
  <div class="cibles" role="group" aria-label={$t('v2.room.target' as any)}>
    <span class="mesl">{$t('v2.room.target' as any)}</span>
    {#each CIBLES as c (c)}
      <button class:on={cible === c} data-cible={c} disabled={verrouille} onclick={() => onCible(c)}>{$t(LIBELLES_CIBLES[c] as any)}</button>
    {/each}
  </div>

  <CourbeCorrectionPiece titre={$t('v2.room.proposalTitle' as any)} {series} />

  <div class="resume" data-room="resume">
    {$t('v2.room.proposalSummary' as any)
      .replace('{lo}', f0(proposition.zone_hz[0]))
      .replace('{hi}', f0(proposition.zone_hz[1]))
      .replace('{before}', f1(proposition.pic_avant_db))
      .replace('{after}', f1(proposition.pic_apres_db))}
  </div>

  {#if vide}
    <div class="state" data-room="rien">{$t('v2.room.nothingToCorrect' as any)}</div>
  {:else}
    <table class="bandes" data-room="bandes">
      <thead><tr><th>{$t('v2.room.colFreq' as any)}</th><th>{$t('v2.room.colGain' as any)}</th><th>Q</th></tr></thead>
      <tbody>
        {#each proposition.bandes as b, i (i)}
          <tr><td>{f0(b.freq)} Hz</td><td>{f1(b.gain)} dB</td><td>{f1(b.q)}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if proposition.avertissements.length}
    <ul class="avert" data-room="avertissements">
      {#each proposition.avertissements as a, i (i)}<li>{a}</li>{/each}
    </ul>
  {/if}

  <div class="actions">
    <button class="v2-btn primaire" data-room="appliquer" disabled={verrouille || vide || application === 'en_cours'}
      onclick={onAppliquer}>
      {application === 'en_cours' ? $t('v2.room.applying' as any) : $t('v2.room.apply' as any)}
    </button>
    <span class="hint">{$t('v2.room.applyNote' as any)}</span>
  </div>
</div>

<style>
  .prop{display:flex; flex-direction:column; gap:10px; padding-top:6px}
  .cibles{display:flex; gap:7px; flex-wrap:wrap; align-items:center}
  .cibles button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:7px 14px; border-radius:var(--v2-r-pill)}
  .cibles button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .mesl{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .resume{font:12px var(--v2-mono); color:var(--v2-txt2)}
  .state{color:var(--v2-txt3); font-size:12.5px}
  .bandes{border-collapse:collapse; font:12px var(--v2-mono); color:var(--v2-txt2)}
  .bandes th{font:10px var(--v2-mono); text-transform:uppercase; letter-spacing:.06em; color:var(--v2-txt3); text-align:left; padding:4px 18px 4px 0}
  .bandes td{padding:4px 18px 4px 0; border-top:1px solid var(--v2-line)}
  .avert{margin:0; padding-left:18px; font-size:11.5px; line-height:1.5; color:var(--v2-txt3)}
  .actions{display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-top:4px}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:52ch}
</style>
