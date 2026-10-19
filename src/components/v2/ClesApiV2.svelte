<script lang="ts">
  /**
   * Réglages ▸ Clés d'API (#4805 lot 1, go de Bertrand du 12/10/2026 : « le
   * max, plus l'usage avec clé d'API perso »).
   *
   * L'utilisateur saisit sa PROPRE clé d'application AcoustID et son PROPRE
   * jeton Discogs. Sans clé personnelle, le serveur garde sa clé intégrée.
   * Côté serveur, la clé est chiffrée au repos (`tune_core::coffre`, le même
   * coffre que la clé de l'Assistant IA) ; elle n'est JAMAIS renvoyée : on
   * n'affiche que ses quatre derniers caractères. Le champ se vide après
   * l'enregistrement — rien ne la garde dans la page.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { cleMasquee, type EtatCleApi } from '../../lib/enrichissementAlbum';

  const SERVICES: { id: 'acoustid' | 'discogs'; nom: string; lien: string; aideKey: string }[] = [
    { id: 'acoustid', nom: 'AcoustID', lien: 'https://acoustid.org/new-application', aideKey: 'v2.apiKeys.acoustidHelp' },
    { id: 'discogs', nom: 'Discogs', lien: 'https://www.discogs.com/settings/developers', aideKey: 'v2.apiKeys.discogsHelp' },
  ];

  let etats = $state<Record<string, EtatCleApi>>({});
  let saisies = $state<Record<string, string>>({ acoustid: '', discogs: '' });
  let verdicts = $state<Record<string, string>>({});
  let occupe = $state<string | null>(null);
  let indisponible = $state(false);

  async function relire() {
    try {
      const r = await api.getApiKeys();
      etats = Object.fromEntries((r.keys ?? []).map((k) => [k.service, k]));
    } catch {
      indisponible = true;
    }
  }
  $effect(() => { void relire(); });

  function phraseEtat(e: EtatCleApi | undefined): string {
    if (!e) return '';
    if (e.illisible) return $t('v2.apiKeys.unreadable');
    if (e.utilisee === 'personnelle') return $t('v2.apiKeys.personal').replace('{key}', cleMasquee(e));
    if (e.utilisee === 'integree') return $t('v2.apiKeys.builtIn');
    return $t('v2.apiKeys.none');
  }

  async function enregistrer(id: string) {
    const v = saisies[id]?.trim();
    if (!v) return;
    occupe = id;
    verdicts = { ...verdicts, [id]: '' };
    try {
      const e = await api.setApiKey(id, v);
      etats = { ...etats, [id]: e };
      saisies = { ...saisies, [id]: '' };
      verdicts = { ...verdicts, [id]: $t('v2.apiKeys.saved') };
    } catch {
      verdicts = { ...verdicts, [id]: $t('v2.apiKeys.saveFailed') };
    } finally {
      occupe = null;
    }
  }

  async function retirer(id: string) {
    occupe = id;
    try {
      const e = await api.deleteApiKey(id);
      etats = { ...etats, [id]: e };
      verdicts = { ...verdicts, [id]: $t('v2.apiKeys.removed') };
    } catch {
      verdicts = { ...verdicts, [id]: $t('v2.apiKeys.saveFailed') };
    } finally {
      occupe = null;
    }
  }

  async function tester(id: string) {
    occupe = id;
    verdicts = { ...verdicts, [id]: '' };
    try {
      const r = await api.testApiKey(id, saisies[id]?.trim() || undefined);
      const cle = r.verdict === 'valide' ? 'v2.apiKeys.testOk'
        : r.verdict === 'refusee' ? 'v2.apiKeys.testRefused' : 'v2.apiKeys.testUnknown';
      verdicts = { ...verdicts, [id]: $t(cle) };
    } catch (e) {
      const statut = (e as { status?: number } | null)?.status;
      verdicts = { ...verdicts, [id]: $t(statut === 412 ? 'v2.apiKeys.none' : 'v2.apiKeys.testUnknown') };
    } finally {
      occupe = null;
    }
  }
</script>

<div class="cles" data-cles-api>
  <p class="hint">{$t('v2.apiKeys.intro')}</p>
  {#if indisponible}
    <p class="hint">{$t('v2.apiKeys.unavailable')}</p>
  {:else}
    {#each SERVICES as s (s.id)}
      <div class="cle" data-cle-api={s.id}>
        <div class="tete">
          <strong>{s.nom}</strong>
          <span class="etat" class:alerte={etats[s.id]?.illisible}>{phraseEtat(etats[s.id])}</span>
        </div>
        <p class="hint">{$t(s.aideKey)} <a href={s.lien} target="_blank" rel="noopener noreferrer">{s.lien.replace('https://', '')}</a></p>
        <div class="ligne">
          <input type="password" autocomplete="off" spellcheck="false"
            aria-label={$t('v2.apiKeys.inputLabel').replace('{service}', s.nom)}
            placeholder={$t('v2.apiKeys.placeholder')}
            bind:value={saisies[s.id]} />
          <button class="lnk" disabled={occupe !== null || !saisies[s.id]?.trim()} onclick={() => enregistrer(s.id)}>{$t('v2.apiKeys.save')}</button>
          <button class="lnk" disabled={occupe !== null} onclick={() => tester(s.id)}>{$t('v2.apiKeys.test')}</button>
          {#if etats[s.id]?.personnelle}
            <button class="lnk" disabled={occupe !== null} onclick={() => retirer(s.id)}>{$t('v2.apiKeys.remove')}</button>
          {/if}
        </div>
        {#if verdicts[s.id]}<p class="verdict" role="status">{verdicts[s.id]}</p>{/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .cles { display: flex; flex-direction: column; gap: 14px; }
  .cle { display: flex; flex-direction: column; gap: 6px; }
  .tete { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .etat { font-size: 12px; color: var(--tune-text-muted); }
  .etat.alerte { color: var(--tune-warning, #d97706); }
  .hint, .verdict { margin: 0; font-size: 12px; color: var(--tune-text-muted); }
  .hint a { color: var(--tune-accent); }
  .ligne { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  input {
    flex: 1 1 220px; min-width: 0; padding: 6px 8px; border-radius: 6px;
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3));
    background: transparent; color: var(--tune-text); font-family: monospace;
  }
  .lnk {
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    background: transparent; color: var(--tune-text);
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3));
  }
  .lnk:disabled { opacity: 0.5; cursor: default; }
</style>
