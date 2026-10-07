<script lang="ts">
  /**
   * tune-server-rust#2264 — la règle qui choisit la VERSION jouée, réglée
   * pour le profil ACTIF (décision 3 du 07/10/2026 : par profil, avec un
   * repli sur le défaut du serveur).
   *
   * La requête porte l'`X-Profile-Id` du profil actif (`fetchJSON`) : le
   * serveur lit et range la règle dans les réglages de CE profil. « Défaut du
   * serveur » la retire, et le profil suit alors le défaut global.
   */
  import { t } from '../../lib/i18n';
  import { currentProfileId } from '../../lib/stores/profile';
  import { REGLES_VERSION, getVersionRule, libelleRegle, regleLisible, setVersionRule, type RegleVersion } from '../../lib/groupesVersions';

  const HERITEE = '';

  let regle = $state<RegleVersion | null>(null);
  let erreur = $state(false);
  let enCours = $state(false);
  /** Le défaut que suit le profil quand il n'a pas de règle à lui. */
  let defautServeur = $state<string>('local');

  async function charger() {
    erreur = false;
    try {
      // Un serveur antérieur (404) ou une réponse d'une autre forme : le
      // réglage ne s'affiche pas, plutôt que de proposer une règle inconnue.
      const r = await getVersionRule();
      if (!regleLisible(r)) { regle = null; return; }
      const globale = r.origin === 'profile' ? await getVersionRule('global').catch(() => null) : r;
      defautServeur = regleLisible(globale) ? globale.rule : 'local';
      regle = r;
    } catch {
      regle = null;
    }
  }

  $effect(() => {
    // Relu à chaque bascule de profil.
    void $currentProfileId;
    void charger();
  });

  async function choisir(valeur: string) {
    enCours = true;
    erreur = false;
    try {
      const r = await setVersionRule(valeur === HERITEE ? null : valeur);
      if (!regleLisible(r)) { erreur = true; await charger(); return; }
      regle = r;
    } catch {
      erreur = true;
      await charger();
    } finally {
      enCours = false;
    }
  }

  let valeur = $derived(regle?.origin === 'profile' ? regle.rule : HERITEE);
  const tr = (k: string) => $t(k as any);
</script>

{#if regle}
  <div class="reglage-version" data-reglage="version-jouee">
    <div class="lbl">
      <span>{$t('profiles.versionRule.title' as any)}</span>
      <span class="hint">{$t('profiles.versionRule.hint' as any)}</span>
    </div>
    <select class="sel" value={valeur} disabled={enCours}
      onchange={(e) => choisir((e.currentTarget as HTMLSelectElement).value)}>
      <option value={HERITEE}>{tr('profiles.versionRule.inherit').replace('{rule}', libelleRegle(defautServeur, tr))}</option>
      {#each REGLES_VERSION as r (r)}
        <option value={r}>{libelleRegle(r, tr)}</option>
      {/each}
    </select>
    {#if erreur}<p class="err">{$t('profiles.versionRule.error' as any)}</p>{/if}
  </div>
{/if}

<style>
  .reglage-version{margin-top:16px; padding-top:14px; border-top:1px solid var(--v2-line2);
    display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .lbl{display:flex; flex-direction:column; gap:3px; flex:1; min-width:220px}
  .lbl > span:first-child{font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .hint{font-size:12.5px; line-height:1.5; color:var(--v2-txt3)}
  .sel{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px}
  .err{flex-basis:100%; margin:4px 0 0; font-size:12px; color:var(--v2-danger, #ef4444)}
</style>
