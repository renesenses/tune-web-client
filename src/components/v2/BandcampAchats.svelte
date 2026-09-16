<script lang="ts">
  /**
   * La session d'achat Bandcamp et les téléchargements FLAC — le volet qui
   * coiffe « Ma collection » (lot 3, Yves 16/09/2026).
   *
   * Logique dans `lib/bandcampAchats.ts` ; ici, l'écran : la bannière de
   * session, la liste des téléchargements, et le passage à l'assistant
   * d'import pour ce qui est terminé.
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { BandcampTelechargement } from '../../lib/api';
  import { enMo, etatSession, fautSuivre, pretsALImport } from '../../lib/bandcampAchats';
  import ImportWizard from '../partages/ImportWizard.svelte';

  interface Props {
    /** `downloads_available` de la dernière page de collection. */
    downloadsAvailable: boolean;
    collectionVide: boolean;
    /** La liste des téléchargements, partagée avec la grille (bouton par achat). */
    telechargements: BandcampTelechargement[];
    /** Appelé quand la session change : la collection doit être relue. */
    onSessionChangee: () => void;
  }
  let { downloadsAvailable, collectionVide, telechargements = $bindable(), onSessionChangee }: Props = $props();

  let session = $state<boolean | null>(null);
  let identite = $state('');
  let enCours = $state(false);
  let erreur = $state<string | null>(null);
  let aImporter = $state<string | null>(null);
  let minuteur: ReturnType<typeof setTimeout> | null = null;

  const etat = $derived(session == null ? null : etatSession(session, downloadsAvailable, collectionVide));

  async function lireSession() {
    try { session = (await api.bandcampSession()).session; } catch { session = false; }
  }
  async function poser() {
    const v = identite.trim();
    if (!v || enCours) return;
    enCours = true; erreur = null;
    try {
      await api.bandcampPoserSession(v);
      identite = '';
      session = true;
      onSessionChangee();
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    } finally { enCours = false; }
  }
  async function oublier() {
    if (enCours) return;
    enCours = true; erreur = null;
    try {
      await api.bandcampOublierSession();
      session = false;
      onSessionChangee();
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    } finally { enCours = false; }
  }

  /** Suivre les téléchargements tant qu'un seul avance ; s'arrêter sinon. */
  export async function suivre() {
    if (minuteur) { clearTimeout(minuteur); minuteur = null; }
    try { telechargements = (await api.bandcampTelechargements()).downloads ?? []; } catch { /* le prochain tour réessaie */ }
    if (fautSuivre(telechargements)) minuteur = setTimeout(suivre, 2000);
  }

  $effect(() => { void lireSession(); void suivre(); });
  onDestroy(() => { if (minuteur) clearTimeout(minuteur); });
</script>

{#if etat === 'aucune' || etat === 'perimee'}
  <div class="bandeau" class:perimee={etat === 'perimee'}>
    <p>{$t(etat === 'aucune' ? 'v2.stream.bcSessionNone' : 'v2.stream.bcSessionExpired')}</p>
    <p class="sub">{$t('v2.stream.bcSessionHowTo')}</p>
    <div class="inline">
      <input class="txt" type="password" autocomplete="off" placeholder="identity" bind:value={identite} disabled={enCours}
        onkeydown={(e) => { if (e.key === 'Enter') poser(); }} />
      <button class="lnk" disabled={enCours || !identite.trim()} onclick={poser}>{$t('v2.stream.bcSessionSet')}</button>
    </div>
    {#if erreur}<p class="err">{erreur}</p>{/if}
  </div>
{:else if etat === 'valide'}
  <div class="ligne">
    <span class="ok">{$t('v2.stream.bcSessionOk')}</span>
    <button class="lnk petit" disabled={enCours} onclick={oublier}>{$t('v2.stream.bcSessionForget')}</button>
  </div>
{/if}

{#if telechargements.length}
  <section class="dl">
    <h3>{$t('v2.stream.bcDownloads')}</h3>
    <ul>
      {#each telechargements as d (d.sale_item)}
        <li>
          <span class="qui"><b>{d.artist}</b> — {d.title}</span>
          {#if d.state === 'page'}<span class="et">{$t('v2.stream.bcDlPage')}</span>
          {:else if d.state === 'telechargement'}<span class="et">{$t('v2.stream.bcDlProgress').replace('{n}', enMo(d.octets))}</span>
          {:else if d.state === 'extraction'}<span class="et">{$t('v2.stream.bcDlUnzip')}</span>
          {:else if d.state === 'termine'}
            <span class="et ok">{$t('v2.stream.bcDlDone').replace('{n}', String(d.fichiers))}</span>
            <button class="lnk petit" onclick={() => (aImporter = d.dossier)}>{$t('v2.stream.bcDlImport')}</button>
          {:else if d.state === 'echec'}<span class="et err" title={d.erreur}>{$t('v2.stream.bcDlFailed')} — {d.erreur}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if aImporter}
  <ImportWizard initialSource={aImporter} onClose={() => (aImporter = null)} onImported={() => (aImporter = null)} />
{/if}

<style>
  .bandeau{display:flex; flex-direction:column; align-items:flex-start; gap:10px; margin:14px 0; padding:16px 18px;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); background:var(--v2-bg2)}
  .bandeau.perimee{border-color:var(--v2-warn, #c9a227)}
  .bandeau p{margin:0; font-size:14px; color:var(--v2-txt)}
  .bandeau .sub{font-size:12.5px; line-height:1.6; color:var(--v2-txt2)}
  .inline{display:flex; align-items:center; gap:9px; flex-wrap:wrap}
  .txt{height:36px; min-width:260px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); padding:0 14px; font:13px var(--v2-mono)}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus); outline:0}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:0 14px; height:36px; font:13px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.petit{height:28px; padding:0 10px; font-size:12px}
  .ligne{display:flex; align-items:center; gap:12px; margin:10px 0}
  .ok{color:var(--v2-ok, #4caf7d); font-size:12.5px}
  .err{color:var(--v2-danger, #d9534f); font-size:12.5px}
  .dl{margin:10px 0 18px}
  .dl h3{margin:0 0 8px; font:600 13px var(--v2-sans); color:var(--v2-txt2); text-transform:uppercase; letter-spacing:.04em}
  .dl ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px}
  .dl li{display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:13px; color:var(--v2-txt)}
  .qui{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .et{color:var(--v2-txt2); font-size:12.5px}
</style>
