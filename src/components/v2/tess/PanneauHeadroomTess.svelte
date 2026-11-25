<script lang="ts">
  /**
   * Refonte TESS rc14 (Rémi, demande 8) — le panneau de l'étage Headroom.
   *
   * UNE seule marge pour toute la chaîne (décision de Bertrand du 25/11) : la
   * réserve de l'ancien écran Égaliseur (Sûre / Réaliste) y est fondue, et ne
   * se règle plus à part. Automatique (tune-server-rust#9520) : la marge est
   * la réserve des égaliseurs, calculée sur toute leur série — aucun −3 dB.
   * Manuel : de −24 à 0 dB, qui REMPLACE cette réserve et ne s'applique que
   * si au moins un égaliseur est coché (`fixed.headroom`, bornes du serveur ; hors
   * bornes, 409 `headroom_out_of_range`). Le réglage part avec la chaîne
   * entière par `PUT /zones/{id}/tess`, comme tout geste de TESS.
   *
   * La garde de préampli (gain que l'égaliseur a dû retenir pour ne pas
   * écrêter) vient de l'ancien écran : elle se lit et se rend ici.
   */
  import { t } from '../../../lib/i18n';
  import { dbLisible } from '../../../lib/tess';
  import {
    HEADROOM_MANUEL_MIN, HEADROOM_MANUEL_MAX, HEADROOM_AUTO_DB, type HeadroomTess,
  } from '../../../lib/tessPanneaux';
  import { audiophileEnabled } from '../../../lib/stores/audiophile';
  import InterrupteurTess from './InterrupteurTess.svelte';
  import PreampliGardeV2 from '../PreampliGardeV2.svelte';

  let {
    headroom,
    effectifDb = null,
    zoneId = null,
    occupe = false,
    egaliseurActif = false,
    onChange,
  }: {
    headroom: HeadroomTess;
    /** Le headroom que le serveur applique en ce moment (`headroom_db`). */
    effectifDb?: number | null;
    zoneId?: number | null;
    occupe?: boolean;
    /** Au moins un égaliseur coché dans la chaîne (sinon le manuel n'agit pas). */
    egaliseurActif?: boolean;
    onChange: (h: HeadroomTess) => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  /** Valeur montrée pendant le geste, recalée sur le serveur à la réponse. */
  let brouillon = $state<number | null>(null);
  $effect(() => { void headroom.db; void headroom.auto; brouillon = null; });
  const db = $derived(brouillon ?? headroom.db);
  const lisible = (v: number) => (v === 0 ? '0 dB' : dbLisible(v));
</script>

<section class="reglages" aria-labelledby="tess-headroom-titre" data-tess-reglages="headroom" data-tess-panneau-headroom>
  <header class="tete">
    <h2 id="tess-headroom-titre">{tr('tess.step.headroom')}</h2>
    <InterrupteurTess data-tess-headroom-auto checked={headroom.auto} disabled={occupe}
                      texte={tr('tess.headroom.auto')} label={tr('tess.headroom.auto')}
                      onToggle={(v) => onChange({ auto: v, db: v ? HEADROOM_AUTO_DB : headroom.db })} />
  </header>
  <p class="desc">{tr('tess.headroom.help')}</p>
  {#if headroom.auto}
    <p class="note" data-tess-headroom-resume>
      {tr('tess.headroom.autoHelp')}{#if typeof effectifDb === 'number'} · {lisible(effectifDb)}{/if}
    </p>
  {:else}
    <label class="champ">
      <span class="lbl">{tr('tess.headroom.manual')} <b data-tess-headroom-valeur>{lisible(db)}</b></span>
      <input type="range" min={HEADROOM_MANUEL_MIN} max={HEADROOM_MANUEL_MAX} step="0.5" value={db}
             disabled={occupe} data-tess-headroom-db
             oninput={(e) => (brouillon = Number((e.currentTarget as HTMLInputElement).value))}
             onchange={(e) => onChange({ auto: false, db: Number((e.currentTarget as HTMLInputElement).value) })} />
    </label>
    <p class="note" class:alerte={!egaliseurActif} data-tess-headroom-note-manuel>{tr('tess.headroom.manualNote')}</p>
  {/if}
  <PreampliGardeV2 {zoneId} pur={$audiophileEnabled} />
</section>

<style>
  .reglages{border:1px solid var(--v2-line); border-radius:16px; background:var(--v2-surface); padding:22px 26px;
    display:flex; flex-direction:column; gap:14px; min-width:0}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:12px}
  .tete h2{font-size:calc(24px * var(--v2-txt-echelle, 1)); font-weight:700; margin:0}
  .desc,.note{margin:0; color:var(--v2-txt2); line-height:1.5; max-width:70ch; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .champ{display:flex; flex-direction:column; gap:6px; max-width:460px}
  .champ input{accent-color:var(--v2-acc1)}
  .lbl{color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .note.alerte{padding:8px 10px; border-radius:8px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .lbl b{color:var(--v2-txt); font-weight:600; margin-left:4px}
</style>
