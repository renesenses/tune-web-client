<script lang="ts">
  /**
   * tune-server-rust#7478 — exclure des sous-dossiers ou des motifs du scan,
   * emplacement par emplacement (décisions de Bertrand du 13/11/2026).
   *
   * Un motif glob par ligne, lu depuis la racine de l'emplacement (un nom
   * à toute profondeur, ou un chemin relatif). Avant
   * d'enregistrer, le serveur dit combien de pistes de la bibliothèque
   * seraient MASQUÉES ; rien n'est écrit sans confirmation de CE nombre.
   * Décision de Bertrand du 13/11 : masquées, jamais supprimées — retirer le
   * motif les fait revenir intactes (notes, favoris, historique).
   *
   * Les exclusions GLOBALES (`scan_exclude_paths`) restent ce qu'elles sont :
   * affichées ici, en lecture.
   */
  import { t } from '../../lib/i18n';
  import {
    getScanExclusions, previewScanExclusions, saveScanExclusions,
    type EtatExclusionsDuScan, type ExclusionsDEmplacement,
  } from '../../lib/api';

  let etat = $state<EtatExclusionsDuScan | null>(null);
  /** Par racine : le texte saisi (un motif par ligne) et la casse. */
  let saisie = $state<Record<string, { texte: string; casse: boolean }>>({});
  let enCours = $state(false);
  let erreur = $state<string | null>(null);
  let aConfirmer = $state<{ n: number; exemples: string[]; regles: ExclusionsDEmplacement[] } | null>(null);
  let enregistre = $state(false);

  /** `/m/` et `/m` désignent le même emplacement. */
  const memeRacine = (a: string, b: string) =>
    a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '');

  function remplir(e: EtatExclusionsDuScan) {
    etat = e;
    const s: Record<string, { texte: string; casse: boolean }> = {};
    for (const r of e.roots) {
      const l = e.locations.find((x) => memeRacine(x.root, r));
      s[r] = { texte: (l?.patterns ?? []).join('\n'), casse: !!l?.case_sensitive };
    }
    saisie = s;
  }

  async function charger() {
    try {
      const e = await getScanExclusions();
      if (e && Array.isArray(e.roots)) remplir(e); else etat = null;
    } catch {
      etat = null;
    }
  }

  $effect(() => { void charger(); });

  function regles(): ExclusionsDEmplacement[] {
    return Object.entries(saisie)
      .map(([root, v]) => ({
        root,
        patterns: v.texte.split('\n').map((m) => m.trim()).filter(Boolean),
        case_sensitive: v.casse,
      }))
      .filter((r) => r.patterns.length > 0);
  }

  function messageDe(e: unknown): string {
    const err = e as { message?: string; status?: number };
    // 409 : le nombre a changé entre l'aperçu et l'enregistrement.
    if (err?.status === 409 || /confirmation_required/.test(err?.message ?? '')) {
      return $t('v2.scanExcl.conflict' as any);
    }
    const m = err?.message;
    return m && m.length < 300 && !m.trimStart().startsWith('{') ? m : $t('v2.scanExcl.error' as any);
  }

  function texteDeConfirmation(n: number): string {
    return n === 1
      ? $t('v2.scanExcl.confirmTextOne' as any)
      : $t('v2.scanExcl.confirmText' as any).replace('{n}', String(n));
  }

  async function enregistrer(r: ExclusionsDEmplacement[], n: number) {
    const e = await saveScanExclusions(r, n);
    aConfirmer = null;
    enregistre = true;
    if (e) remplir(e);
  }

  async function verifier() {
    enCours = true;
    erreur = null;
    enregistre = false;
    try {
      const r = regles();
      const apercu = await previewScanExclusions(r);
      if (apercu.tracks_to_remove > 0) {
        aConfirmer = { n: apercu.tracks_to_remove, exemples: apercu.examples ?? [], regles: r };
      } else {
        await enregistrer(r, 0);
      }
    } catch (e) {
      erreur = messageDe(e);
    } finally {
      enCours = false;
    }
  }

  async function confirmer() {
    if (!aConfirmer) return;
    enCours = true;
    erreur = null;
    try {
      await enregistrer(aConfirmer.regles, aConfirmer.n);
    } catch (e) {
      // Le nombre a changé entre l'aperçu et l'enregistrement : on revérifie.
      erreur = messageDe(e);
      aConfirmer = null;
    } finally {
      enCours = false;
    }
  }
</script>

{#if etat}
  <div class="clap-genres exclusions-scan" data-reglage="exclusions-scan">
    <span class="clap-genres-titre">{$t('v2.scanExcl.title' as any)}</span>
    <p class="hint">{$t('v2.scanExcl.hint' as any)}</p>

    {#each etat.roots as racine (racine)}
      {#if saisie[racine]}
        <label class="emplacement" data-exclusions-racine={racine}>
          <span class="racine">{racine}</span>
          <textarea rows="2" bind:value={saisie[racine].texte} disabled={enCours || !!aConfirmer}
            placeholder={$t('v2.scanExcl.placeholder' as any)}
            aria-label={$t('v2.scanExcl.patternsFor' as any).replace('{path}', racine)}></textarea>
        </label>
        <label class="casse">
          <input type="checkbox" bind:checked={saisie[racine].casse} disabled={enCours || !!aConfirmer} />
          <span>{$t('v2.scanExcl.caseSensitive' as any)}</span>
        </label>
      {/if}
    {/each}

    {#if etat.global.length}
      <div class="globales" data-exclusions-globales>
        <span>{$t('v2.scanExcl.global' as any)}</span>
        <ul>{#each etat.global as g (g)}<li><code>{g}</code></li>{/each}</ul>
        <p class="hint">{$t('v2.scanExcl.globalHint' as any)}</p>
      </div>
    {/if}

    {#if aConfirmer}
      <div class="confirmer" role="alert" data-exclusions-confirmer>
        <p>{texteDeConfirmation(aConfirmer.n)}</p>
        {#if aConfirmer.exemples.length}
          <ul class="exemples">{#each aConfirmer.exemples as ex (ex)}<li><code>{ex}</code></li>{/each}</ul>
        {/if}
        <div class="inline">
          <button class="lnk danger" data-exclusions-ok disabled={enCours} onclick={confirmer}>{$t('v2.scanExcl.confirm' as any)}</button>
          <button class="lnk" disabled={enCours} onclick={() => (aConfirmer = null)}>{$t('common.cancel' as any)}</button>
        </div>
      </div>
    {:else}
      <div class="inline">
        <button class="lnk" data-exclusions-verifier disabled={enCours} onclick={verifier}>{enCours ? '…' : $t('v2.scanExcl.check' as any)}</button>
        {#if enregistre}<span class="hint">{$t('v2.scanExcl.saved' as any)}</span>{/if}
      </div>
    {/if}
    {#if erreur}<p class="hint err">{erreur}</p>{/if}
  </div>
{/if}

<style>
  .exclusions-scan .emplacement { display: flex; flex-direction: column; gap: 4px; }
  .exclusions-scan .racine { font-family: var(--font-mono, monospace); font-size: 0.85em; overflow-wrap: anywhere; }
  .exclusions-scan textarea { width: 100%; box-sizing: border-box; }
  .exclusions-scan .casse { display: flex; gap: 6px; align-items: center; }
  .exclusions-scan .globales ul, .exclusions-scan .exemples { margin: 4px 0; padding-left: 18px; max-height: 12em; overflow: auto; }
  .exclusions-scan .exemples code, .exclusions-scan .globales code { overflow-wrap: anywhere; }
</style>
