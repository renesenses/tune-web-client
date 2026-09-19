<script lang="ts">
  /**
   * Import depuis un autre lecteur — Réglages › Système › Import.
   *
   * Phase 5 (web#1257) : l'assistant n'existait que dans `SettingsView`. Le
   * nouveau client affichait à sa place « l'import reste dans le client
   * actuel » — une porte qui disparaît avec `?v2=0`.
   *
   * Il marche désormais côté serveur (tune-server-rust #3914, R4) : le fichier
   * téléversé est lu (CSV Roon, XML Plex, M3U/PLS), et `?preview=true` CALCULE
   * le rapport sans rien écrire. D'où les deux temps : aperçu, puis
   * confirmation — la confirmation n'est offerte que si l'aperçu a trouvé des
   * lignes (`canConfirmImport`, partagé avec l'ancien écran).
   *
   * Les listes Linn `.dpl` passent par une autre route (`importLinnPlaylist`,
   * domaine « Autres » de l'inventaire) : elles ne sont pas proposées ici.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { get } from 'svelte/store';
  import { canConfirmImport } from '../../lib/importReport';

  type Source = 'roon' | 'plex' | 'playlists';
  type Etape = 'choix' | 'apercu' | 'fait';

  /** Même borne que l'ancien écran : au-delà, le serveur coupe (413) ou traîne. */
  const MAX_MO = 25;

  const SOURCES: { id: Source; titre: string; desc: string; accept: string }[] = [
    { id: 'roon', titre: 'import.roon', desc: 'import.roonDesc', accept: '.csv,.CSV,.txt' },
    { id: 'plex', titre: 'import.plex', desc: 'import.plexDesc', accept: '.xml,.XML' },
    { id: 'playlists', titre: 'import.playlists', desc: 'import.playlistDesc', accept: '.m3u,.m3u8,.pls,.M3U,.M3U8,.PLS' },
  ];

  let etape = $state<Etape>('choix');
  let source = $state<Source | null>(null);
  let fichier = $state<File | null>(null);
  let rapport = $state<any>(null);
  let erreur = $state<string | null>(null);
  let analyse = $state(false);
  let enCours = $state(false);

  function appel(s: Source, f: File, apercu: boolean) {
    if (s === 'roon') return api.importRoon(f, apercu);
    if (s === 'plex') return api.importPlex(f, apercu);
    return api.importPlaylists(f, apercu);
  }

  async function choisir(s: Source, e: Event) {
    const tr = get(t);
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > MAX_MO * 1024 * 1024) {
      erreur = tr('v2.import.tooBig' as any)
        .replace('{size}', String(Math.round(f.size / 1048576)))
        .replace('{max}', String(MAX_MO));
      return;
    }
    source = s;
    fichier = f;
    rapport = null;
    erreur = null;
    etape = 'apercu';
    analyse = true;
    try {
      const r = await appel(s, f, true);
      rapport = r;
      if (!r || r.total_rows === 0) erreur = tr('import.noData' as any);
    } catch (err: any) {
      erreur = err?.message ?? tr('import.error' as any);
    } finally {
      analyse = false;
    }
  }

  async function confirmer() {
    if (!source || !fichier) return;
    enCours = true;
    erreur = null;
    try {
      rapport = await appel(source, fichier, false);
      etape = 'fait';
    } catch (err: any) {
      erreur = err?.message ?? get(t)('import.error' as any);
    } finally {
      enCours = false;
    }
  }

  function recommencer() {
    etape = 'choix';
    source = null;
    fichier = null;
    rapport = null;
    erreur = null;
    analyse = false;
    enCours = false;
  }

  /** Le serveur lance l'import réel en tâche de fond (202 + `task_id`) : pas de compteurs à montrer. */
  const enFond = $derived(etape === 'fait' && rapport && rapport.task_id && rapport.matched == null);
</script>

<div class="imp">
  {#if etape === 'choix'}
    <div class="sources">
      {#each SOURCES as s (s.id)}
        <label class="source fichier">
          <strong>{$t(s.titre as any)}</strong>
          <span class="hint">{$t(s.desc as any)}</span>
          <input class="choix-{s.id}" type="file" accept={s.accept} onchange={(e) => choisir(s.id, e)} />
        </label>
      {/each}
    </div>
    {#if erreur}<div class="errline">{erreur}</div>{/if}

  {:else if etape === 'apercu'}
    {#if analyse}
      <p class="hint">{$t('import.previewing' as any)}</p>
    {:else if erreur}
      <div class="errline">{erreur}</div>
      <div class="inline"><button class="lnk" onclick={recommencer}>{$t('import.back' as any)}</button></div>
    {:else if rapport}
      <p class="titre">{$t('import.preview' as any)} — <span class="mono">{fichier?.name}</span></p>
      <div class="chiffres">
        <div class="chiffre"><b>{rapport.total_rows}</b><span>{$t('import.totalRows' as any)}</span></div>
        <div class="chiffre ok"><b>{rapport.matched}</b><span>{$t('import.matched' as any)}</span></div>
        <div class="chiffre manque"><b>{rapport.unmatched}</b><span>{$t('import.unmatched' as any)}</span></div>
      </div>
      {#if rapport.details?.length}
        <details class="details">
          <summary>{$t('import.matchDetails' as any)}</summary>
          <table>
            <thead>
              <tr>
                <th>{$t('settings.columnTitle' as any)}</th>
                <th>{$t('settings.columnArtist' as any)}</th>
                <th>{$t('settings.columnStatus' as any)}</th>
              </tr>
            </thead>
            <tbody>
              {#each rapport.details.slice(0, 100) as d, i (i)}
                <tr class:manque={!d.matched}>
                  <td>{d.title}</td>
                  <td>{d.artist ?? ''}</td>
                  <td>{d.matched ? (d.match_method ?? '✓') : '—'}</td>
                </tr>
              {/each}
              {#if rapport.details.length > 100}
                <tr><td colspan="3" class="hint">+ {rapport.details.length - 100} {$t('settings.rowsWord' as any)}…</td></tr>
              {/if}
            </tbody>
          </table>
        </details>
      {/if}
      <div class="inline">
        <button class="lnk" onclick={recommencer}>{$t('import.cancel' as any)}</button>
        <button class="lnk primaire confirmer" disabled={!canConfirmImport(rapport, enCours)} onclick={confirmer}>
          {enCours ? $t('import.importing' as any) : $t('import.confirm' as any)}
        </button>
      </div>
    {/if}

  {:else}
    <p class="titre okline">{$t('import.done' as any)}</p>
    {#if enFond}
      <p class="hint">{$t('v2.import.background' as any)}</p>
    {:else if rapport}
      <div class="chiffres">
        <div class="chiffre ok"><b>{rapport.matched ?? 0}</b><span>{$t('import.matched' as any)}</span></div>
        {#if rapport.play_counts_updated > 0}
          <div class="chiffre"><b>{rapport.play_counts_updated}</b><span>{$t('import.playCounts' as any)}</span></div>
        {/if}
        {#if rapport.ratings_updated > 0}
          <div class="chiffre"><b>{rapport.ratings_updated}</b><span>{$t('import.ratings' as any)}</span></div>
        {/if}
        {#if rapport.playlists_created > 0}
          <div class="chiffre"><b>{rapport.playlists_created}</b><span>{$t('import.playlistsCreated' as any)}</span></div>
        {/if}
      </div>
    {/if}
    {#if erreur}<div class="errline">{erreur}</div>{/if}
    <div class="inline"><button class="lnk" onclick={recommencer}>{$t('import.back' as any)}</button></div>
  {/if}
</div>

<style>
  .imp { display: flex; flex-direction: column; gap: 10px; }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .titre { margin: 0; font-size: 13px; font-weight: 600; }
  .okline { color: var(--v2-acc1); }
  .errline { font-size: 13px; color: var(--v2-danger); }
  .mono { font-family: var(--v2-mono); }

  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }
  .lnk.primaire { border-color: var(--v2-acc1); color: var(--v2-acc1); }

  .sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
  .source {
    display: flex; flex-direction: column; gap: 4px; cursor: pointer;
    border: 1px solid var(--v2-line); border-radius: 8px; padding: 10px 12px;
  }
  .source:hover { border-color: var(--v2-acc1); }
  .source strong { font-size: 13px; color: var(--v2-txt); }
  /* Le sélecteur de fichier natif est masqué : c'est la carte qui porte le geste. */
  .fichier { position: relative; overflow: hidden; }
  .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  .chiffres { display: flex; flex-wrap: wrap; gap: 16px; }
  .chiffre { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--v2-txt3); }
  .chiffre b { font-size: 18px; color: var(--v2-txt); }
  .chiffre.ok b { color: var(--v2-acc1); }
  .chiffre.manque b { color: var(--v2-acc2); }

  .details { font-size: 12px; }
  .details summary { cursor: pointer; color: var(--v2-txt2); }
  .details table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .details th, .details td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--v2-line); }
  .details tr.manque td { color: var(--v2-txt3); }
</style>
