<script lang="ts">
  /**
   * tune-server-rust#6709 (Tades, fil 2364) — « Modes de la pièce ».
   *
   * On décrit la pièce (longueur, largeur, hauteur), la place des oreilles et
   * celle des enceintes ; le SERVEUR calcule les ondes stationnaires
   * (`POST /eq/room-modes`) et propose 5 à 10 filtres en cloche entre 20 et
   * 250 Hz. Les corrections restent modifiables avant d'être appliquées,
   * comme les autres courbes.
   *
   * Ce composant n'écrit RIEN vers le son. « Appliquer » rend les bandes au
   * parent (`onappliquer`), qui les envoie par `setEq` : le chemin de
   * l'égaliseur paramétrique, son préampli, son fondu.
   *
   * ZONE SENSIBLE : des atténuations seulement. Chaque gain saisi repasse par
   * `borneGain` (−20 à −3 dB) — voir `lib/eqModesPiece`.
   */
  import * as api from '../../lib/api';
  import type { EqBand } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import {
    bandesAAppliquer, borneFrequence, borneGain, borneQ, CHAMP_DE_L_API, corpsDeLaPiece, filtresEditables,
    FILTRES_MAX, FILTRES_MIN, GAIN_MAX_DB, GAIN_MIN_DB, indices, Q_MAX, Q_MIN, SAISIE_VIDE,
    type FiltreEdite, type SaisiePiece,
  } from '../../lib/eqModesPiece';
  import '../../styles/tune-v2.css';

  let { onappliquer }: { onappliquer: (bandes: EqBand[]) => void } = $props();

  /** Les dimensions saisies restent d'une visite à l'autre, dans CE navigateur. */
  const CLE = 'tune-eq-room-modes';
  function lireSaisie(): SaisiePiece {
    try {
      const brut = localStorage.getItem(CLE);
      if (!brut) return { ...SAISIE_VIDE };
      const lu = JSON.parse(brut);
      if (!lu || typeof lu !== 'object') return { ...SAISIE_VIDE };
      const s = { ...SAISIE_VIDE };
      for (const k of ['longueur', 'largeur', 'hauteur', 'auditeur', 'enceintes', 'rt60'] as const) {
        if (typeof lu[k] === 'string') s[k] = lu[k];
      }
      if (typeof lu.nombre === 'number') s.nombre = lu.nombre;
      return s;
    } catch {
      return { ...SAISIE_VIDE };
    }
  }
  function ecrireSaisie() {
    try { localStorage.setItem(CLE, JSON.stringify($state.snapshot(saisie))); } catch { /* sans filet */ }
  }

  let saisie = $state<SaisiePiece>(lireSaisie());
  let calcul = $state(false);
  let erreur = $state<string | null>(null);
  let filtres = $state<FiltreEdite[] | null>(null);
  let modes = $state<api.RoomMode[]>([]);
  let rt60 = $state<number | null>(null);

  const CHAMPS: { cle: keyof SaisiePiece; libelle: string }[] = [
    { cle: 'longueur', libelle: 'v2.eq.room.length' },
    { cle: 'largeur', libelle: 'v2.eq.room.width' },
    { cle: 'hauteur', libelle: 'v2.eq.room.height' },
    { cle: 'auditeur', libelle: 'v2.eq.room.listener' },
    { cle: 'enceintes', libelle: 'v2.eq.room.speaker' },
    { cle: 'rt60', libelle: 'v2.eq.room.rt60' },
  ];
  function libelleDe(cle: keyof SaisiePiece | undefined): string {
    if (cle === 'nombre') return $t('v2.eq.room.count' as any);
    const c = CHAMPS.find((x) => x.cle === cle);
    return c ? $t(c.libelle as any) : '';
  }

  async function calculer(e?: Event) {
    e?.preventDefault();
    // Résolus AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const msgIllisible = $t('v2.eq.room.errNumber' as any);
    const msgBornes = $t('v2.eq.room.errBounds' as any);
    const msgPositions = $t('v2.eq.room.errPositions' as any);
    const msgKo = $t('v2.eq.room.errFailed' as any);
    ecrireSaisie();
    const lu = corpsDeLaPiece(saisie);
    if ('illisible' in lu) {
      erreur = msgIllisible.replace('{field}', libelleDe(lu.illisible));
      return;
    }
    calcul = true;
    erreur = null;
    try {
      const r = await api.computeRoomModes(lu.corps);
      filtres = filtresEditables(r.filters ?? []);
      modes = r.modes ?? [];
      rt60 = typeof r.assumptions?.rt60_s === 'number' ? r.assumptions.rt60_s : null;
    } catch (err) {
      filtres = null;
      modes = [];
      const e2 = err as api.ApiError & { corps?: { field?: string } };
      const champ = e2?.corps?.field ? CHAMP_DE_L_API[e2.corps.field] : undefined;
      if (e2?.code === 'room_positions_incompatible') erreur = msgPositions;
      else if (e2?.status === 400 && (e2.code === 'room_value_out_of_bounds' || e2.code === 'room_value_not_finite')) {
        erreur = msgBornes.replace('{field}', libelleDe(champ));
      } else {
        erreur = msgKo.replace('{detail}', err instanceof Error ? err.message : String(err));
      }
    } finally {
      calcul = false;
    }
  }

  function changerGain(i: number, v: number) {
    if (!filtres) return;
    filtres[i].gain = borneGain(v);
  }
  function changerQ(i: number, v: number) {
    if (!filtres) return;
    filtres[i].q = borneQ(v);
  }
  function changerFrequence(i: number, v: number) {
    if (!filtres) return;
    filtres[i].freq = borneFrequence(v);
  }

  const aAppliquer = $derived(filtres ? bandesAAppliquer(filtres) : []);
  function appliquer() {
    if (!aAppliquer.length) return;
    onappliquer(aAppliquer);
  }
  function nature(k: api.RoomMode['kind']): string {
    return $t(`v2.eq.room.kind.${k}` as any);
  }
</script>

<div class="modes-piece">
  <p class="intro">{$t('v2.eq.room.intro' as any)}</p>
  <form class="saisie" onsubmit={calculer}>
    {#each CHAMPS as c (c.cle)}
      <label>
        <span>{$t(c.libelle as any)}</span>
        <input type="text" inputmode="decimal" name={c.cle} bind:value={saisie[c.cle]}
          placeholder={c.cle === 'rt60' ? '0,4' : ''} />
      </label>
    {/each}
    <label>
      <span>{$t('v2.eq.room.count' as any)}</span>
      <input type="number" name="nombre" min={FILTRES_MIN} max={FILTRES_MAX} step="1" bind:value={saisie.nombre} />
    </label>
    <button type="submit" class="v2-btn calculer" disabled={calcul}>
      {calcul ? $t('v2.eq.room.computing' as any) : $t('v2.eq.room.compute' as any)}
    </button>
  </form>

  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}

  {#if filtres}
    {#if filtres.length === 0}
      <p class="vide">{$t('v2.eq.room.none' as any)}</p>
    {:else}
      <h3>{$t('v2.eq.room.filters' as any)}</h3>
      <table class="filtres">
        <thead>
          <tr>
            <th>{$t('v2.eq.room.colUse' as any)}</th>
            <th>{$t('v2.eq.room.colFreq' as any)}</th>
            <th>{$t('v2.eq.room.colGain' as any)}</th>
            <th>{$t('v2.eq.room.colQ' as any)}</th>
            <th>{$t('v2.eq.room.colModes' as any)}</th>
          </tr>
        </thead>
        <tbody>
          {#each filtres as f, i (i)}
            <tr class:off={!f.utiliser}>
              <td><input type="checkbox" bind:checked={f.utiliser} aria-label={$t('v2.eq.room.colUse' as any)} /></td>
              <td><input class="freq" type="number" min="20" max="250" step="0.1" value={f.freq}
                aria-label={$t('v2.eq.room.colFreq' as any)}
                onchange={(e) => changerFrequence(i, Number((e.currentTarget as HTMLInputElement).value))} /></td>
              <td><input class="gain" type="number" min={GAIN_MIN_DB} max={GAIN_MAX_DB} step="0.5" value={f.gain}
                aria-label={$t('v2.eq.room.colGain' as any)}
                onchange={(e) => { changerGain(i, Number((e.currentTarget as HTMLInputElement).value)); (e.currentTarget as HTMLInputElement).value = String(filtres?.[i].gain); }} /></td>
              <td><input class="q" type="number" min={Q_MIN} max={Q_MAX} step="0.1" value={f.q}
                aria-label={$t('v2.eq.room.colQ' as any)}
                onchange={(e) => changerQ(i, Number((e.currentTarget as HTMLInputElement).value))} /></td>
              <td class="indices">{f.modes.map(indices).join(', ')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="note">{$t('v2.eq.room.applyNote' as any)}</p>
      <button class="v2-btn appliquer" disabled={!aAppliquer.length} onclick={appliquer}>
        {$t('v2.eq.room.apply' as any)}
      </button>
    {/if}
    {#if modes.length}
      <details class="liste-modes">
        <summary>{$t('v2.eq.room.modes' as any)}</summary>
        <ul>
          {#each modes as m (indices(m.n))}
            <li><span class="mf">{m.freq.toFixed(1)} Hz</span> <span class="mi">{indices(m.n)}</span>
              <span class="mk">{nature(m.kind)}</span> <span class="mc">{Math.round(m.coupling * 100)} %</span></li>
          {/each}
        </ul>
      </details>
    {/if}
    {#if rt60 !== null}
      <p class="modele">{$t('v2.eq.room.model' as any).replace('{rt60}', String(rt60))}</p>
    {/if}
  {/if}
</div>

<style>
  .modes-piece{display:flex; flex-direction:column; gap:12px; max-width:760px}
  .intro, .note, .modele, .vide{margin:0; font-size:12.5px; line-height:1.5; color:var(--v2-txt2)}
  .modele{color:var(--v2-txt3)}
  .saisie{display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px 14px; align-items:end}
  .saisie label{display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--v2-txt2)}
  .saisie input{min-width:0}
  .erreur{margin:0; padding:9px 14px; border-radius:10px; font-size:12.5px; color:var(--v2-danger);
    border:1px solid var(--v2-danger-bd)}
  h3{margin:6px 0 0; font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .filtres{border-collapse:collapse; font-size:12.5px; width:100%}
  .filtres th{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3);
    text-align:left; padding:4px 6px}
  .filtres td{padding:4px 6px; border-top:1px solid var(--v2-line)}
  .filtres input[type="number"]{width:7ch}
  .filtres tr.off{opacity:.5}
  .indices, .mi{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .appliquer{align-self:flex-start}
  .liste-modes{font-size:12px; color:var(--v2-txt2)}
  .liste-modes ul{list-style:none; margin:6px 0 0; padding:0; columns:2; column-gap:20px}
  .mf{font:11px var(--v2-mono); color:var(--v2-txt)}
  .mk, .mc{color:var(--v2-txt3)}
</style>
