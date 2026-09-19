<script lang="ts">
  /**
   * Partages réseau (SMB) — portage de `SmbWizard` et de la liste des montages
   * de `SettingsView` (#2069), que la phase 5 supprime.
   *
   * Un assistant EN PLACE plutôt qu'une modale : trouver l'hôte, choisir le
   * partage, s'identifier, tester, monter, puis ajouter le point de montage à
   * la bibliothèque. Les pièges déjà payés par l'ancien assistant sont repris
   * tels quels :
   *
   *  - un hôte DÉCOUVERT (`GET /network/shares`) n'annonce jamais ses
   *    partages : on les demande à `GET /network/scan-host` avec l'HÔTE
   *    (#3637) ;
   *  - `scan-host` rend des OBJETS `{name, …}`, pas des chaînes — on ne garde
   *    que le nom, sinon « [object Object] » ;
   *  - l'adresse saisie est souvent un chemin Windows complet : on en extrait
   *    l'hôte, et le partage cité est présélectionné (#1846).
   *
   * La liste des montages montre l'état RÉEL (`mounted`), jamais l'intention
   * (`active`) : c'est la distinction qui a coûté #1916 — voir `smbMountState`.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { parseSmbAddress } from '../../lib/smbAddress';
  import { etatPartage } from '../../lib/smbMountState';
  import { notifications } from '../../lib/stores/notifications';

  let { onDossiersChanges }: { onDossiersChanges?: (dirs: string[]) => void } = $props();

  interface Hote { host: string; name: string; protocol: string; partages?: string[] }

  let montages = $state<api.SmbMount[]>([]);
  async function chargerMontages() {
    // Un serveur antérieur à la 0.9.91 rend 404 : liste masquée, sans alarme.
    try { montages = await api.listSmbMounts(); } catch { montages = []; }
  }
  $effect(() => { void chargerMontages(); });

  let ouvert = $state(false);
  let hotes = $state<Hote[]>([]);
  let balayage = $state(false);
  let erreurBalayage = $state<string | null>(null);
  let adresse = $state('');
  let identifiantsVisibles = $state(false);
  let hoteChoisi = $state<Hote | null>(null);
  let partages = $state<string[]>([]);
  let chargementPartages = $state(false);
  let partageChoisi = $state<string | null>(null);

  let utilisateur = $state('guest');
  let motDePasse = $state('');
  let test = $state<{ ok: boolean; message: string } | null>(null);
  let occupe = $state(false);
  let monte = $state<{ mount_path: string; id: number } | null>(null);
  let erreurMontage = $state<string | null>(null);
  let ajoute = $state(false);
  let analyseLancee = $state(false);

  function reinitialiser() {
    hotes = []; erreurBalayage = null; adresse = ''; identifiantsVisibles = false;
    hoteChoisi = null; partages = []; partageChoisi = null;
    utilisateur = 'guest'; motDePasse = ''; test = null;
    monte = null; erreurMontage = null; ajoute = false; analyseLancee = false;
  }
  function basculer() { ouvert = !ouvert; if (!ouvert) reinitialiser(); }

  /** `scan-host` rend un tableau d'objets `{name, …}` ; on tolère des chaînes. */
  function nomsDePartages(brut: unknown): string[] {
    const liste = Array.isArray(brut) ? brut : (brut as any)?.shares;
    if (!Array.isArray(liste)) return [];
    return liste
      .map((s: any) => (typeof s === 'string' ? s : s?.name))
      .filter((n: any): n is string => typeof n === 'string' && n.length > 0);
  }
  const avecIdentifiants = () => ({
    u: identifiantsVisibles && utilisateur !== 'guest' ? utilisateur : undefined,
    p: identifiantsVisibles && motDePasse ? motDePasse : undefined,
  });

  async function balayerLeReseau() {
    balayage = true; erreurBalayage = null; hotes = [];
    try {
      const r = await api.discoverSmbShares();
      hotes = (r ?? []).map((h: any) => ({ host: h.host, name: h.name || h.host, protocol: h.protocol || 'smb' }));
      if (!hotes.length) erreurBalayage = $t('smb.noSharesFound' as any);
    } catch (e: any) {
      erreurBalayage = e?.message || $t('smb.scanNetworkError' as any);
    }
    balayage = false;
  }

  async function sonderAdresse() {
    const a = parseSmbAddress(adresse);
    if (!a) return;
    balayage = true; erreurBalayage = null;
    try {
      const { u, p } = avecIdentifiants();
      const r = await api.scanHost(a.host, 'smb', u, p);
      const noms = nomsDePartages(r);
      if (!noms.length) {
        erreurBalayage = (!Array.isArray(r) && r?.error) || $t('smb.noSharesOnHost' as any).replace('{host}', a.host);
        if (/refus|auth|ACCESS_DENIED/i.test(erreurBalayage ?? '')) identifiantsVisibles = true;
      } else {
        const h: Hote = { host: a.host, name: a.host, protocol: 'smb', partages: noms };
        if (!hotes.some((x) => x.host === h.host)) hotes = [...hotes, h];
        hoteChoisi = h; partages = noms; partageChoisi = null;
        const cite = a.share?.toLowerCase();
        if (cite) partageChoisi = noms.find((n) => n.toLowerCase() === cite) ?? null;
      }
    } catch (e: any) {
      erreurBalayage = e?.message || $t('smb.cannotScanHost' as any);
      if (/500|auth/i.test(erreurBalayage ?? '')) identifiantsVisibles = true;
    }
    balayage = false;
  }

  async function choisirHote(h: Hote) {
    hoteChoisi = h; partageChoisi = null; test = null; monte = null;
    if (h.partages?.length) { partages = h.partages; return; }
    chargementPartages = true;
    try {
      const { u, p } = avecIdentifiants();
      partages = nomsDePartages(await api.scanHost(h.host, h.protocol || 'smb', u, p));
    } catch { partages = []; }
    chargementPartages = false;
  }

  async function tester() {
    if (!hoteChoisi || !partageChoisi) return;
    occupe = true; test = null;
    try {
      const r = await api.testSmbConnection(hoteChoisi.host, partageChoisi, utilisateur || undefined, motDePasse || undefined);
      test = r.ok
        ? { ok: true, message: r.message || $t('smb.connectionSuccess' as any) }
        : { ok: false, message: r.error || $t('smb.connectionFailed' as any) };
    } catch (e: any) {
      test = { ok: false, message: e?.message || $t('smb.connectionError' as any) };
    }
    occupe = false;
  }

  async function monter() {
    if (!hoteChoisi || !partageChoisi) return;
    occupe = true; erreurMontage = null;
    try {
      const r = await api.mountSmbShare(hoteChoisi.host, partageChoisi, utilisateur || undefined, motDePasse || undefined);
      monte = { mount_path: r.mount_path, id: r.id };
      await chargerMontages();
    } catch (e: any) {
      erreurMontage = e?.message || $t('smb.mountError' as any);
    }
    occupe = false;
  }

  async function ajouterALaBibliotheque() {
    if (!monte) return;
    occupe = true;
    try {
      const r = await api.addMusicDir(monte.mount_path);
      ajoute = true;
      if (r?.music_dirs) onDossiersChanges?.(r.music_dirs);
    } catch (e: any) {
      notifications.error(e?.message || $t('smb.addDirError' as any));
    }
    occupe = false;
  }

  async function lancerAnalyse() {
    if (!monte) return;
    occupe = true;
    try {
      await api.triggerScan(monte.mount_path);
      analyseLancee = true;
    } catch (e: any) {
      // Une analyse déjà en cours n'est pas un échec : elle couvrira le partage.
      if (/409|already/.test(e?.message ?? '')) analyseLancee = true;
      else notifications.error(e?.message || $t('smb.scanError' as any));
    }
    occupe = false;
  }
</script>

{#if montages.length}
  <div class="montages">
    {#each montages as m (m.id)}
      {@const e = etatPartage(m)}
      <div class="montage" class:ko={e.enEchec}>
        <span class="nom">\\{m.server}\{m.share}</span>
        <span class="badge" class:ok={!e.enEchec}>{e.enEchec ? $t('settings.smbNotMounted' as any) : $t('settings.smbMounted' as any)}</span>
        {#if e.signalerSmb1}<span class="badge" title={$t('settings.smb1Hint' as any)}>SMB 1.0</span>{/if}
        {#if m.mount_path}<span class="chemin">{m.mount_path}</span>{/if}
        {#if e.cause}<span class="cause">{e.cause}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

<div class="acts">
  <button class="v2-btn ouvrir" onclick={basculer} aria-expanded={ouvert}>
    {ouvert ? $t('common.cancel' as any) : $t('settings.addSmbShare' as any)}
  </button>
</div>

{#if ouvert}
  <div class="assistant">
    <p class="hint">{$t('smb.step1Desc' as any)}</p>
    <div class="ligne">
      <button class="v2-btn balayer" onclick={balayerLeReseau} disabled={balayage}>
        {balayage ? $t('smb.scanning' as any) : $t('smb.scanNetwork' as any)}
      </button>
      <input class="txt" type="text" bind:value={adresse} placeholder={$t('smb.hostPlaceholder' as any)}
        aria-label={$t('smb.orEnterAddress' as any)}
        onkeydown={(e) => { if (e.key === 'Enter') sonderAdresse(); }} />
      <button class="v2-btn sonder" onclick={sonderAdresse} disabled={balayage || !adresse.trim()}>{$t('smb.scan' as any)}</button>
    </div>
    {#if identifiantsVisibles}
      <p class="hint">{$t('smb.credentialsIfProtected' as any)}</p>
    {/if}
    {#if erreurBalayage}<div class="errline">{erreurBalayage}</div>{/if}

    {#if hotes.length}
      <p class="sous">{$t('smb.serversFound' as any)}</p>
      <div class="choix">
        {#each hotes as h (h.host)}
          <button class="puce hote" class:on={hoteChoisi?.host === h.host} onclick={() => choisirHote(h)}>
            {h.name}{#if h.name !== h.host}<span class="mono"> {h.host}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if hoteChoisi}
      <p class="sous">{$t('smb.sharesOnHost' as any).replace('{host}', hoteChoisi.name)}</p>
      {#if chargementPartages}
        <p class="hint">{$t('smb.scanning' as any)}</p>
      {:else if !partages.length}
        <p class="hint">{$t('smb.noSharesAvailable' as any)}</p>
      {:else}
        <div class="choix">
          {#each partages as p (p)}
            <button class="puce partage" class:on={partageChoisi === p} onclick={() => { partageChoisi = p; test = null; monte = null; }}>{p}</button>
          {/each}
        </div>
      {/if}
    {/if}

    {#if identifiantsVisibles || partageChoisi}
      <p class="sous">{$t('smb.credentials' as any)}</p>
      <div class="ligne">
        <input class="txt" type="text" bind:value={utilisateur} placeholder={$t('smb.username' as any)} aria-label={$t('smb.username' as any)} autocomplete="username" />
        <input class="txt" type="password" bind:value={motDePasse} placeholder={$t('smb.password' as any)} aria-label={$t('smb.password' as any)} autocomplete="current-password" />
        {#if identifiantsVisibles && !partageChoisi}
          <button class="v2-btn" onclick={sonderAdresse} disabled={balayage || !adresse.trim()}>{$t('smb.retryWithCredentials' as any)}</button>
        {/if}
      </div>
    {/if}

    {#if hoteChoisi && partageChoisi}
      <div class="ligne">
        <button class="v2-btn tester" onclick={tester} disabled={occupe}>{$t('smb.testConnection' as any)}</button>
        <button class="v2-btn primaire monter" onclick={monter} disabled={occupe || !!monte}>
          {occupe && !monte ? $t('smb.mounting' as any) : $t('smb.mountShare' as any)}
        </button>
      </div>
      {#if test}<div class={test.ok ? 'okline' : 'errline'}>{test.message}</div>{/if}
      {#if erreurMontage}<div class="errline">{erreurMontage}</div>{/if}
    {/if}

    {#if monte}
      <div class="okline">{$t('smb.mountSuccess' as any)} — {$t('smb.mountPoint' as any)} : <span class="mono">{monte.mount_path}</span></div>
      <div class="ligne">
        <button class="v2-btn ajouter" onclick={ajouterALaBibliotheque} disabled={occupe || ajoute}>
          {ajoute ? $t('smb.folderAdded' as any) : $t('smb.addToLibrary' as any)}
        </button>
        {#if ajoute}
          <button class="v2-btn analyser" onclick={lancerAnalyse} disabled={occupe || analyseLancee}>
            {analyseLancee ? $t('smb.scanLaunched' as any) : $t('smb.scanLibrary' as any)}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); margin:8px 0 0}
  .sous{font-size:12px; font-weight:600; color:var(--v2-txt2); margin:14px 0 0}
  .acts{display:flex; gap:8px; flex-wrap:wrap; margin-top:12px}
  .assistant{margin-top:10px; padding:12px 14px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface2)}
  .ligne{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:10px}
  .txt{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 11px; outline:none; width:210px}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .choix{display:flex; gap:6px; flex-wrap:wrap; margin-top:8px}
  .puce{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .puce:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .puce.on{border-color:var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .mono{font-family:var(--v2-mono); font-size:10.5px; color:var(--v2-txt3)}
  .errline{margin-top:10px; font-size:12px; color:var(--v2-danger)}
  .okline{margin-top:10px; font-size:12px; color:var(--v2-acc-tint)}
  .montages{display:flex; flex-direction:column; gap:6px; margin-top:12px}
  .montage{display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 10px; border-radius:9px;
    border:1px solid var(--v2-line); color:var(--v2-txt2)}
  .montage.ko{border-color:var(--v2-danger-bd)}
  .nom{font:12px var(--v2-mono); color:var(--v2-txt)}
  .badge{font:600 10px var(--v2-sans); padding:2px 8px; border-radius:999px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .badge.ok{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .chemin{font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .cause{flex-basis:100%; font-size:11.5px; color:var(--v2-danger)}
</style>
