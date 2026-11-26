<script lang="ts">
  /**
   * Refonte TESS rc14 (Rémi, demande 8) — le panneau de l'étage Headroom.
   *
   * UNE seule marge pour toute la chaîne (décision de Bertrand du 25/11) : la
   * réserve de l'ancien écran Égaliseur (Sûre / Réaliste) y est fondue, et ne
   * se règle plus à part. Automatique (tune-server-rust#9520) : la marge est
   * la réserve des égaliseurs, calculée sur toute leur série — aucun −3 dB.
   * Manuel (rc14, Rémi) : de −12 à 0 dB par pas de 0,5 dB (le serveur
   * accepte jusqu'à −24 dB ; une valeur plus basse déjà enregistrée élargit
   * le curseur). Elle REMPLACE cette réserve ; sans égaliseur coché, c'est un
   * gain fixe, sur la sortie locale seulement (`fixed.headroom` ; hors
   * bornes, 409 `headroom_out_of_range`). PURE et « Bypass all » la
   * contournent : le panneau dit la valeur RÉELLEMENT appliquée, ou pourquoi
   * elle ne l'est pas (l'étape `headroom` du chemin résolu). Le réglage part avec la chaîne
   * entière par `PUT /zones/{id}/tess`, comme tout geste de TESS.
   *
   * La garde de préampli (gain que l'égaliseur a dû retenir pour ne pas
   * écrêter) et la compensation de niveau viennent de l'ancien écran
   * Égaliseur : elles se lisent ici, relues à chaque chaîne reçue
   * (`revision`). La zone est la zone courante, celle de TESS.
   */
  import { t } from '../../../lib/i18n';
  import { dbLisible, libelleOuRepli, type EtapeTess } from '../../../lib/tess';
  import {
    HEADROOM_MANUEL_MAX, HEADROOM_AUTO_DB, HEADROOM_PAS_DB, minimumDuCurseur, type HeadroomTess,
  } from '../../../lib/tessPanneaux';
  import { audiophileEnabled } from '../../../lib/stores/audiophile';
  import InterrupteurTess from './InterrupteurTess.svelte';
  import PreampliGardeV2 from '../PreampliGardeV2.svelte';
  import CompensationNiveauV2 from '../CompensationNiveauV2.svelte';

  let {
    headroom,
    effectifDb = null,
    zoneId = null,
    occupe = false,
    egaliseurActif = false,
    nonApplique = false,
    revision = 0,
    etape = null,
    onChange,
  }: {
    headroom: HeadroomTess;
    /** Le headroom que le serveur applique en ce moment (`headroom_db`). */
    effectifDb?: number | null;
    zoneId?: number | null;
    occupe?: boolean;
    /** Au moins un égaliseur coché dans la chaîne (sinon le manuel n'agit pas). */
    egaliseurActif?: boolean;
    /**
     * rc14 (retours de Rémi) — sortie réseau : le serveur n'applique pas la
     * marge (étape `headroom`, `reason: "not_applied_on_transport"`). Le
     * panneau est grisé et le dit ; le réglage reste enregistré dans la
     * chaîne et reprend sur une sortie locale.
     */
    nonApplique?: boolean;
    /** Incrémentée à chaque chaîne reçue du serveur : la garde et la compensation se relisent. */
    revision?: number;
    /** rc14 — l'étape `headroom` du chemin résolu : appliquée, ou son motif. */
    etape?: EtapeTess | null;
    onChange: (h: HeadroomTess) => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  /** Valeur montrée pendant le geste, recalée sur le serveur à la réponse. */
  let brouillon = $state<number | null>(null);
  $effect(() => { void headroom.db; void headroom.auto; brouillon = null; });
  const db = $derived(brouillon ?? headroom.db);
  const lisible = (v: number) => (v === 0 ? '0 dB' : dbLisible(v));
  const minimum = $derived(minimumDuCurseur(headroom.db));
  /** Ce que le serveur applique vraiment (manuel), ou pourquoi il ne l'applique pas. */
  const etat = $derived.by(() => {
    // Sortie réseau : la note `notAppliedNetwork` le dit déjà, plus
    // explicitement ; un seul message pour cet état.
    if (nonApplique || headroom.auto || !etape || !etape.requested) return null;
    if (etape.effective) return { applique: true, texte: tr('tess.headroom.applied').replace('{db}', lisible(effectifDb ?? headroom.db)) };
    const r = etape.reason ?? 'unknown';
    const motif = libelleOuRepli(tr(`tess.reason.${r}`), `tess.reason.${r}`, etape.detail ?? r);
    return { applique: false, texte: tr('tess.headroom.notApplied').replace('{reason}', motif) };
  });
</script>

<section class="reglages" class:inactif={nonApplique} aria-labelledby="tess-headroom-titre" data-tess-reglages="headroom"
         data-tess-panneau-headroom data-tess-headroom-non-applique={nonApplique ? '' : undefined}>
  <header class="tete">
    <h2 id="tess-headroom-titre">{tr('tess.step.headroom')}</h2>
    <InterrupteurTess data-tess-headroom-auto checked={headroom.auto} disabled={occupe || nonApplique}
                      texte={tr('tess.headroom.auto')} label={tr('tess.headroom.auto')}
                      onToggle={(v) => onChange({ auto: v, db: v ? HEADROOM_AUTO_DB : headroom.db })} />
  </header>
  <p class="desc">{tr('tess.headroom.help')}</p>
  {#if nonApplique}
    <p class="note reseau" role="note" data-tess-headroom-reseau>{tr('tess.headroom.notAppliedNetwork')}</p>
  {/if}
  {#if headroom.auto}
    <p class="note" data-tess-headroom-resume>
      {tr('tess.headroom.autoHelp')}{#if typeof effectifDb === 'number'} · {lisible(effectifDb)}{/if}
    </p>
  {:else}
    <label class="champ">
      <span class="lbl">{tr('tess.headroom.manual')} <b data-tess-headroom-valeur>{lisible(db)}</b></span>
      <input type="range" min={minimum} max={HEADROOM_MANUEL_MAX} step={HEADROOM_PAS_DB} value={db}
             disabled={occupe || nonApplique} data-tess-headroom-db
             oninput={(e) => (brouillon = Number((e.currentTarget as HTMLInputElement).value))}
             onchange={(e) => onChange({ auto: false, db: Number((e.currentTarget as HTMLInputElement).value) })} />
    </label>
    {#if etat}
      <p class="note" class:alerte={!etat.applique} data-tess-headroom-applique={etat.applique ? 'oui' : 'non'}>{etat.texte}</p>
    {/if}
    <p class="note" data-tess-headroom-note-manuel>{tr(egaliseurActif ? 'tess.headroom.manualNoteEq' : 'tess.headroom.manualNoteNoEq')}</p>
  {/if}
  <PreampliGardeV2 {zoneId} {revision} pur={$audiophileEnabled} />
  <div data-tess-compensation-niveau><CompensationNiveauV2 {revision} /></div>
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
  /* Sortie réseau : les réglages restent lisibles, mais grisés. */
  .reglages.inactif .champ,.reglages.inactif [data-tess-headroom-resume]{opacity:.5}
  .note.reseau{padding:8px 10px; border-radius:var(--rayon-2); border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt)}
</style>
