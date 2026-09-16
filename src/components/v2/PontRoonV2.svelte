<script lang="ts">
  /**
   * « Pont Roon » (PREMIUM) — importer l'archive du moissonneur : crédits par
   * piste, images d'artistes, pochettes. Logique dans `lib/pontRoon.ts`.
   *
   * Toujours un APERÇU avant l'import : l'utilisateur voit ce qui va changer.
   * Tune ne remplace jamais une image ni un crédit qu'il a déjà.
   */
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import * as api from '../../lib/api';
  import type { RapportPontRoon } from '../../lib/api';
  import { aucunAppariement, etatPontRoon, lignesDuRapport, remplir, type EtatPontRoon } from '../../lib/pontRoon';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';

  let etat = $state<EtatPontRoon>('chargement');
  let dernier = $state<RapportPontRoon | null>(null);
  let fichier = $state<File | null>(null);
  let rapport = $state<RapportPontRoon | null>(null);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  async function charger() {
    try {
      const r = await api.pontRoonEtat();
      const c: any = r.corps;
      etat = etatPontRoon(r.status, c?.premium);
      dernier = c?.dernier_rapport ?? null;
    } catch {
      etat = 'erreur';
    }
  }
  $effect(() => { void charger(); });

  async function envoyer(apercu: boolean) {
    if (!fichier || occupe) return;
    occupe = true; erreur = null;
    try {
      const r = await api.pontRoonImporter(fichier, apercu);
      const c: any = r.corps;
      if (r.status === 402) { etat = 'no-premium'; return; }
      if (r.status < 200 || r.status >= 300) { erreur = c?.detail ?? c?.error ?? `HTTP ${r.status}`; return; }
      rapport = c as RapportPontRoon;
      if (!apercu) dernier = rapport;
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    } finally {
      occupe = false;
    }
  }

  function choisir(e: Event) {
    fichier = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    rapport = null; erreur = null;
  }
</script>

<p class="hint">{$t('v2.roon.hint' as any)}</p>

{#if etat === 'chargement'}
  <p class="hint">{$t('v2.tool.loading' as any)}</p>
{:else if etat === 'absent'}
  <div class="bandeau">
    <p>{$t('v2.roon.notInstalled' as any)}</p>
    <button class="lnk" onclick={() => v2SettingsTarget.set({ tab: 'extensions', section: 'plugins' })}>{$t('v2.roon.openExtensions' as any)}</button>
  </div>
{:else if etat === 'no-premium'}
  <div class="bandeau premium"><p>{$t('v2.roon.premiumRequired' as any)}</p></div>
{:else if etat === 'erreur'}
  <div class="bandeau"><p>{$t('v2.roon.unavailable' as any)}</p></div>
{:else}
  <div class="rangee">
    <input type="file" accept=".zip,.json,application/zip,application/json" onchange={choisir} disabled={occupe} />
    <button class="lnk" disabled={!fichier || occupe} onclick={() => envoyer(true)}>{$t('v2.roon.preview' as any)}</button>
    <button class="lnk prim" disabled={!fichier || occupe || !rapport?.preview} onclick={() => envoyer(false)}
      title={$t('v2.roon.importHint' as any)}>{$t('v2.roon.import' as any)}</button>
  </div>
  {#if occupe}<p class="hint">{$t('v2.roon.working' as any)}</p>{/if}
  {#if erreur}<p class="err">{erreur}</p>{/if}
{/if}

{#each [rapport ?? dernier].filter(Boolean) as r (r)}
  {@const rr = r as RapportPontRoon}
  <div class="rapport">
    <h4>{$t((rr.preview ? 'v2.roon.reportPreview' : 'v2.roon.reportDone') as any)}{#if rr.core} — {rr.core}{/if}</h4>
    <ul>
      {#each lignesDuRapport(rr) as l (l.cle)}
        <li>{remplir($t(l.cle as any), l.valeurs, (n) => $formatNombre(n))}</li>
      {/each}
    </ul>
    {#if aucunAppariement(rr)}<p class="err">{$t('v2.roon.noMatch' as any)}</p>{/if}
  </div>
{/each}

<style>
  .hint{margin:4px 0 10px; font-size:12.5px; line-height:1.5; color:var(--v2-txt3)}
  .bandeau{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 14px; border-radius:11px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2)}
  .bandeau p{margin:0; font-size:13px; color:var(--v2-txt2)}
  .bandeau.premium{border-color:rgba(245,158,11,.35); background:rgba(245,158,11,.08)}
  .rangee{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .rangee input{font:12.5px var(--v2-sans); color:var(--v2-txt2); max-width:100%}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.45; cursor:default}
  .lnk.prim{background:var(--v2-acc2); border-color:transparent; color:#fff}
  .err{margin:8px 0 0; font-size:12.5px; color:var(--v2-danger, #ef4444)}
  .rapport{margin-top:14px; padding-top:12px; border-top:1px solid var(--v2-line2)}
  .rapport h4{margin:0 0 8px; font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .rapport ul{margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--v2-txt2)}
</style>
