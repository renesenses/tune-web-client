<script lang="ts">
  /**
   * Compensation de niveau — l'interrupteur de tune-server-rust#4685, partagé
   * par les écrans Égaliseur et Crossfeed.
   *
   * L'égaliseur réserve de la marge contre l'écrêtage, le crossfeed mélange
   * les canaux : tous deux changent le niveau MOYEN, et un réglage plus fort
   * « sonne mieux » sans l'être. Le serveur calcule UNE fois, depuis chaque
   * filtre, ce qu'il retire, et la sortie locale le rend par le volume.
   * Cet écran ne calcule rien : il affiche ce que `GET /zones/{id}/dsp` publie
   * (`level_compensation`) et écrit l'interrupteur par `PUT`.
   *
   * Un seul composant pour les deux écrans : c'est UN réglage de zone, qui
   * porte sur les deux traitements à la fois — deux copies finiraient par ne
   * plus dire la même chose.
   *
   * Serveur antérieur (champ absent) : on ne montre rien, plutôt qu'un
   * interrupteur qui n'aurait aucun effet.
   */
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZoneId } from '../../lib/stores/zones';
  import { t } from '../../lib/i18n';
  import { estCompensation, libelleCompensation } from '../../lib/compensationNiveau';

  /** À incrémenter par l'écran parent après chaque réglage enregistré : la
   *  compensation dépend de la courbe et du dosage, elle doit se relire. */
  let { revision = 0 }: { revision?: number } = $props();

  let etat = $state<api.LevelCompensation | null>(null);
  let erreur = $state(false);

  $effect(() => {
    const zid = $currentZoneId;
    void revision;
    if (zid == null) { etat = null; return; }
    api.getDsp(zid)
      .then((d) => {
        const lc = d?.level_compensation;
        etat = estCompensation(lc) ? lc : null;
      })
      .catch(() => { etat = null; });
  });

  const libelle = $derived(etat ? libelleCompensation(etat) : null);

  async function basculer() {
    const zid = zoneRequise();
    if (zid == null || !etat) return;
    const avant = etat;
    const voulu = !etat.enabled;
    etat = { ...etat, enabled: voulu };
    try {
      const res = await api.setDsp(zid, { level_compensation: { enabled: voulu } });
      const lc = res?.level_compensation;
      if (estCompensation(lc)) etat = lc;
      erreur = false;
    } catch {
      etat = avant;
      erreur = true;
    }
  }
</script>

{#if etat && libelle}
  <div class="lc" data-testid="compensation-niveau">
    <div class="lbl">
      <span>{$t('v2.lc.title' as any)}</span>
      <span class="hint">{$t('v2.lc.hint' as any)}</span>
      <span class="val">
        {$t(libelle.cle as any)
          .replace('{eq}', libelle.eq)
          .replace('{cf}', libelle.cf)
          .replace('{comp}', libelle.comp)}
      </span>
      {#if erreur}<span class="err">{$t('v2.lc.errSave' as any)}</span>{/if}
    </div>
    <label class="sw">
      <input type="checkbox" checked={etat.enabled} onchange={basculer}
        aria-label={$t('v2.lc.title' as any)} />
      <span class="slider"></span>
    </label>
  </div>
{/if}

<style>
  .lc{display:flex; align-items:center; justify-content:space-between; gap:24px; margin-top:18px;
    padding:16px 20px; border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2)}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:14px; font-weight:600}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:52ch}
  .val{font:12px var(--v2-mono); color:var(--v2-txt2)}
  .err{font-size:12px; color:var(--v2-danger)}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}
</style>
