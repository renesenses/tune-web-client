<script lang="ts">
  /**
   * TESS — panneau du greffon « Convolution » (lot W3, maquette A1, colonne
   * de droite). Monté par `ReglagesGreffonTess` sous l'en-tête commun (nom,
   * case « On », description, « × Remove plugin ») : ce panneau ne porte que
   * le jeu de filtres de la ZONE de l'écran, sans sélecteur de zone.
   *
   * Contrat serveur (`/room-correction/ir/*`) :
   *  - `GET status/{zone}` : `files` (une ligne du tableau par fichier),
   *    `in_use` (le fichier RÉELLEMENT employé par le dernier flux, et s'il a
   *    été rééchantillonné), `resample` (l'option de repli), `set_name` (nom
   *    du dernier .zip ou .wav déposé, T09a ; à défaut, le nom du principal).
   *  - « Browse… » : un `.zip` ou un `.wav` seul part en
   *    `upload/{zone}?archive=1&name=…` et REMPLACE tout le jeu d'un coup
   *    (T09a). Un 400 sans `code` sur un .zip (extension ou signature
   *    `PK\x03\x04`) = serveur d'avant T09a.
   *  - Refus d'archive : `code: "archive_refused"` + `reason` → une phrase
   *    traduite par raison, jamais le corps brut.
   *  - 402 : la phrase unique du client (`messageRefusPremium`).
   */
  import { t, locale } from '../../../lib/i18n';
  import * as api from '../../../lib/api';
  import { libelleOuRepli } from '../../../lib/tess';
  import { estRefusPremium, messageRefusPremium } from '../../../lib/premiumRefus';

  interface FichierFiltre { path: string; sample_rate?: number; channels?: number; taps?: number; main?: boolean; error?: string }
  interface FiltreEnUsage {
    stream_sample_rate: number; file_sample_rate: number; path?: string; resampled: boolean;
    reason?: string; description?: string;
  }
  interface StatutFiltres {
    active?: boolean; zone_id?: number; ir_path?: string | null; files?: FichierFiltre[];
    resample?: boolean; in_use?: FiltreEnUsage | null; set_name?: string | null;
  }

  let {
    zoneId,
    verrou = null,
  }: {
    zoneId: number;
    /**
     * Motif du verrou décidé par l'écran depuis les droits que le SERVEUR
     * publie (`plugins[]` : `entitled` / `available` / `reason`, lot W2,
     * `motifDuVerrou`), ou `null`. Verrouillé : tout est en lecture seule,
     * aucun geste ne part — et le serveur, qui fait foi, refuserait (402).
     */
    verrou?: string | null;
  } = $props();
  const bloque = $derived(verrou != null);

  const tr = (k: string) => $t(k as any);

  let statut = $state<StatutFiltres | null>(null);
  let chargement = $state(true);
  let occupe = $state(false);
  let message = $state<string | null>(null);
  let erreur = $state(false);

  const base = (p: string | null | undefined) => (p ? p.split('/').pop() ?? p : '');
  function khz(hz: number): string {
    return new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }).format(hz / 1000);
  }
  function canaux(n: number | undefined): string {
    if (n === 1) return tr('tess.conv.mono');
    if (n === 2) return tr('tess.conv.stereo');
    return n ? tr('tess.conv.channels').replace('{n}', String(n)) : '—';
  }

  const fichiers = $derived(statut?.files ?? []);
  const enUsage = $derived(statut?.in_use ?? null);
  const nomDuJeu = $derived.by(() => {
    if (!statut?.active) return null;
    if (statut.set_name) return statut.set_name;
    const principal = fichiers.find((f) => f.main) ?? fichiers[0];
    return base(principal?.path ?? statut.ir_path) || null;
  });
  /** La ligne employée : par chemin quand le serveur le donne, sinon par cadence. */
  function estEnUsage(f: FichierFiltre): boolean {
    if (!enUsage) return false;
    if (enUsage.path) return enUsage.path === f.path;
    return f.sample_rate === enUsage.file_sample_rate;
  }
  function etat(f: FichierFiltre): string {
    if (f.error) return tr('tess.conv.fileError');
    if (!estEnUsage(f) || !enUsage) return '—';
    return enUsage.resampled
      ? tr('tess.conv.inUseResampled').replace('{from}', khz(enUsage.file_sample_rate)).replace('{to}', khz(enUsage.stream_sample_rate))
      : tr('tess.conv.inUseMatches');
  }

  async function lire(id: number): Promise<StatutFiltres> {
    return api.fetchJSON<StatutFiltres>(`${api.BASE}/room-correction/ir/status/${id}`, undefined, undefined, true);
  }

  // L'état suit la ZONE de l'écran : relu à chaque changement.
  $effect(() => {
    const id = zoneId;
    let vivant = true;
    chargement = true;
    message = null;
    erreur = false;
    lire(id)
      .then((s) => { if (vivant) statut = s; })
      .catch((e) => {
        if (!vivant) return;
        statut = null;
        // Verrouillé : le motif est déjà affiché, un 402 n'ajoute rien.
        if (bloque && estRefusPremium(e)) return;
        erreur = true;
        message = estRefusPremium(e) ? messageRefusPremium((e as any)?.corps) : tr('tess.conv.loadError');
      })
      .finally(() => { if (vivant) chargement = false; });
    return () => { vivant = false; };
  });

  /**
   * Relit le statut de `zone` et ne le pose QUE si l'écran montre encore
   * cette zone : une relecture tardive n'écrase jamais celui d'une autre.
   */
  async function relire(zone: number) {
    try {
      const s = await lire(zone);
      if (zoneId === zone) statut = s;
    } catch { /* l'écran garde l'état précédent */ }
  }

  /** La phrase d'un refus : jamais le JSON du serveur. */
  function texteRefus(status: number, corps: any, archive: boolean): string {
    if (status === 402) return messageRefusPremium(corps);
    // Échec APRÈS que l'ancien jeu a été mis de côté, et remise en place
    // incomplète (T09a) : le dire, l'état relu montre ce qui reste.
    if (Array.isArray(corps?.restore_incomplete) && corps.restore_incomplete.length > 0) return tr('tess.conv.restoreIncomplete');
    // 413 d'un mandataire (corps HTML ou vide) : trop gros, comme `too_large`.
    if (status === 413) return tr('tess.conv.archive.too_large');
    if (corps?.code === 'archive_refused') {
      const cle = `tess.conv.archive.${corps.reason}`;
      return libelleOuRepli(tr(cle), cle, tr('tess.conv.archive.generic'));
    }
    // Un serveur d'avant l'import d'archives lit le .zip comme un WAV et le refuse.
    if (archive && status === 400) return tr('tess.conv.archiveUnsupported');
    return tr('tess.conv.uploadError');
  }

  function estUneArchive(fichier: File, octets: Uint8Array<ArrayBuffer>): boolean {
    if (/\.zip$/i.test(fichier.name)) return true;
    return octets.length >= 4 && octets[0] === 0x50 && octets[1] === 0x4b && octets[2] === 0x03 && octets[3] === 0x04;
  }

  /** Taille au-delà de laquelle le dépôt n'est même pas lu (limite du serveur). */
  const TAILLE_MAX = 50 * 1024 * 1024;

  async function poster(chemin: string, octets: Uint8Array<ArrayBuffer>): Promise<{ status: number; corps: any }> {
    const res = await fetch(`${api.BASE}/room-correction/ir/${chemin}`, {
      method: 'POST',
      headers: api.authHeaders({ 'Content-Type': 'application/octet-stream' }),
      body: octets,
    });
    const corps = await res.json().catch(() => null);
    return { status: res.status, corps };
  }

  async function deposer(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier || occupe || bloque) return;
    // Trop gros : refusé AVANT de lire le fichier en mémoire.
    if (fichier.size > TAILLE_MAX) {
      message = tr('tess.conv.archive.too_large');
      erreur = true;
      return;
    }
    // 🔴 La zone est FIGÉE au geste : si l'écran change de zone pendant le
    // dépôt, rien n'est envoyé, relu ni affiché pour l'autre zone.
    const zone = zoneId;
    const toujoursLa = () => zoneId === zone;
    occupe = true;
    message = null;
    erreur = false;
    try {
      const octets = new Uint8Array(await fichier.arrayBuffer());
      if (!toujoursLa()) return;
      const archive = estUneArchive(fichier, octets);
      // .zip comme .wav seul : `?archive=1` remplace le jeu ENTIER d'un coup
      // (T09a, #9451) et garde le nom déposé dans `set_name`. Un serveur
      // d'avant T09a ignore le paramètre : un .wav y remplace le principal.
      const { status, corps } = await poster(`upload/${zone}?archive=1&name=${encodeURIComponent(fichier.name)}`, octets);
      if (!toujoursLa()) return;
      if (status < 200 || status >= 300 || !corps?.ok) {
        message = texteRefus(status, corps, archive);
        erreur = true;
        // Après tout échec, l'état est RELU : le tableau ne montre jamais un
        // jeu que le serveur n'a plus.
        await relire(zone);
        return;
      }
      const s = await lire(zone).catch(() => null);
      if (!toujoursLa()) return;
      if (s) statut = s;
      const ignores = Array.isArray(corps.ignored) ? corps.ignored.map((x: any) => x?.name).filter(Boolean) : [];
      message = tr('tess.conv.loaded').replace('{name}', corps.set_name ?? fichier.name)
        + (ignores.length ? ' ' + tr('tess.conv.ignored').replace('{names}', ignores.join(', ')) : '')
        // `warning` : jeu enregistré mais pas installé sur la sortie. Le
        // texte du serveur est interne : la phrase est celle du client.
        + (corps.warning ? ' ' + tr('tess.conv.notInstalled') : '');
    } catch {
      if (!toujoursLa()) return;
      message = tr('tess.conv.uploadError');
      erreur = true;
      await relire(zone);
    } finally {
      occupe = false;
    }
  }

  async function changerRepli(e: Event) {
    const c = e.currentTarget as HTMLInputElement;
    const voulu = c.checked;
    c.checked = statut?.resample ?? true;
    if (occupe || bloque) return;
    const zone = zoneId;
    occupe = true;
    message = null;
    erreur = false;
    try {
      const r = await api.fetchJSON<{ ok?: boolean; resample?: boolean }>(
        `${api.BASE}/room-correction/ir/options/${zone}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resample: voulu }) },
        undefined,
        true,
      );
      if (zoneId !== zone) return;
      if (statut) statut = { ...statut, resample: r?.resample ?? voulu };
      await relire(zone);
    } catch (err) {
      if (zoneId !== zone) return;
      message = estRefusPremium(err) ? messageRefusPremium((err as any)?.corps) : tr('tess.conv.optionError');
      erreur = true;
    } finally {
      occupe = false;
    }
  }
</script>

<div class="conv" data-tess-panneau="convolution" aria-busy={chargement || occupe}>
  {#if verrou}
    <p class="verrou" role="note" data-tess-verrou="convolution">{verrou}</p>
  {/if}
  <fieldset class="champs" disabled={bloque}>
  <div class="jeu">
    <span class="etiquette">{$t('tess.conv.filterSet' as any)}</span>
    <span class="nom-jeu" data-conv-jeu>{nomDuJeu ?? $t('tess.conv.noFilterSet' as any)}</span>
    <label class="parcourir" class:inactif={occupe}>
      {$t('tess.conv.browse' as any)}
      <input type="file" accept=".wav,.zip" class="fichier" disabled={occupe} data-conv-parcourir onchange={deposer} />
    </label>
  </div>
  <p class="accepte">{$t('tess.conv.accepted' as any)}</p>

  {#if message}
    <p class="message" class:erreur role={erreur ? 'alert' : 'status'} data-conv-message>{message}</p>
  {/if}

  {#if chargement}
    <p class="discret">{$t('tess.loading' as any)}</p>
  {:else if fichiers.length > 0}
    <h3 class="section">{$t('tess.conv.filtersInSet' as any)}</h3>
    <div class="tableau-cadre">
      <table class="tableau" data-conv-filtres>
        <thead>
          <tr>
            <th scope="col">{$t('tess.conv.colFile' as any)}</th>
            <th scope="col">{$t('tess.conv.colRate' as any)}</th>
            <th scope="col">{$t('tess.conv.colChannels' as any)}</th>
            <th scope="col">{$t('tess.conv.colStatus' as any)}</th>
          </tr>
        </thead>
        <tbody>
          {#each fichiers as f (f.path)}
            <tr class:usage={estEnUsage(f)} data-conv-usage={estEnUsage(f) ? 'oui' : 'non'}>
              <td class="fic">{base(f.path)}</td>
              <td>{f.sample_rate ? `${khz(f.sample_rate)} kHz` : '—'}</td>
              <td>{canaux(f.channels)}</td>
              <td class="statut" data-conv-statut>{etat(f)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if statut}
    <h3 class="section">{$t('tess.conv.noMatchTitle' as any)}</h3>
    <label class="repli">
      <span class="repli-txt">
        <span class="repli-nom">{$t('tess.conv.resampleNearest' as any)}</span>
        <span class="repli-aide">{$t('tess.conv.resampleHint' as any)}</span>
      </span>
      <input type="checkbox" checked={statut.resample ?? true} disabled={occupe} data-conv-repli onchange={changerRepli} />
    </label>
  {/if}
</fieldset>
</div>

<style>
  .conv{display:flex; flex-direction:column; gap:14px; min-width:0}
  .champs{border:0; margin:0; padding:0; min-width:0; display:flex; flex-direction:column; gap:14px}
  .verrou{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2)}
  .jeu{display:flex; align-items:center; gap:12px; flex-wrap:wrap; border:1px solid var(--v2-line); border-radius:12px;
    background:var(--v2-surface2); padding:12px 14px 12px 20px}
  .etiquette{color:var(--v2-txt2)}
  .nom-jeu{font-weight:600; flex:1; min-width:0; overflow-wrap:anywhere}
  .parcourir{position:relative; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:9px 18px; cursor:pointer;
    color:var(--v2-txt); white-space:nowrap}
  .parcourir.inactif,.champs:disabled .parcourir{opacity:.5; cursor:default}
  .fichier{position:absolute; inset:0; opacity:0; cursor:inherit; width:100%}
  .accepte{margin:0; color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5}
  .message{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft);
    color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .message.erreur{color:var(--v2-danger); border-color:var(--v2-danger-bd); background:transparent}
  .discret{margin:0; color:var(--v2-txt3)}
  .section{margin:6px 0 0; font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.12em; text-transform:uppercase;
    color:var(--v2-txt3); font-weight:400}
  .tableau-cadre{border:1px solid var(--v2-line); border-radius:12px; overflow-x:auto}
  .tableau{width:100%; border-collapse:collapse; font-size:calc(13.5px * var(--v2-txt-echelle, 1))}
  .tableau th{text-align:left; font-weight:500; color:var(--v2-txt2); padding:10px 14px; border-bottom:1px solid var(--v2-line)}
  .tableau td{padding:10px 14px; border-top:1px solid var(--v2-line)}
  .tableau tbody tr:first-child td{border-top:0}
  .tableau tr.usage{background:var(--v2-surface2)}
  .tableau tr.usage .fic{font-weight:600}
  .tableau tr.usage .statut{color:var(--v2-acc1); font-weight:600}
  .fic{overflow-wrap:anywhere}
  .repli{display:flex; align-items:center; justify-content:space-between; gap:16px; cursor:pointer}
  .repli-txt{display:flex; flex-direction:column; gap:3px}
  .repli-nom{font-weight:600}
  .repli-aide{color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .repli input{width:20px; height:20px; accent-color:var(--v2-acc1); flex:none}
</style>
