<script lang="ts">
  /**
   * tune-server-rust#8481 — le pays du catalogue d'un service de streaming
   * (TIDAL), comme le réglage « PL » de LMS : le service se comporte alors
   * comme depuis ce pays. Vide : le pays du compte.
   *
   * Le champ ne s'affiche que si le serveur dit le réglage possible : Qobuz
   * répond 422 (il sert toujours le magasin du compte), un serveur plus
   * ancien 404. Dans les deux cas, rien à proposer.
   */
  import { t } from '../../lib/i18n';
  import { getCatalogCountry, setCatalogCountry, type PaysDuCatalogue } from '../../lib/api';

  let { service }: { service: string } = $props();

  let pays = $state<PaysDuCatalogue | null>(null);
  let saisie = $state('');
  let enCours = $state(false);
  let erreur = $state(false);

  /** Deux lettres, ou rien (= le pays du compte). */
  const valide = (v: string) => v === '' || /^[A-Za-z]{2}$/.test(v);

  async function charger() {
    try {
      const r = await getCatalogCountry(service);
      pays = r?.supported ? r : null;
      saisie = pays?.chosen_country ?? '';
    } catch {
      pays = null;
    }
  }

  $effect(() => {
    void service;
    void charger();
  });

  async function enregistrer(valeur: string) {
    const v = valeur.trim().toUpperCase();
    if (!valide(v)) { erreur = true; return; }
    enCours = true;
    erreur = false;
    try {
      pays = await setCatalogCountry(service, v || null);
      saisie = pays?.chosen_country ?? '';
    } catch {
      erreur = true;
    } finally {
      enCours = false;
    }
  }

  let compte = $derived(pays?.account_country ?? '—');
</script>

{#if pays}
  <div class="pays-catalogue" data-pays-catalogue={service}>
    <label class="lbl" for="pays-catalogue-{service}">{$t('v2.set.catalogCountry' as any)}</label>
    <div class="inline">
      <input id="pays-catalogue-{service}" class="txt pays" type="text" maxlength="2"
        autocomplete="off" spellcheck="false" placeholder={pays.account_country ?? ''}
        bind:value={saisie} disabled={enCours}
        onkeydown={(e) => { if (e.key === 'Enter') enregistrer(saisie); }} />
      <button class="lnk" data-pays-enregistrer disabled={enCours || !valide(saisie.trim())
        || saisie.trim().toUpperCase() === (pays.chosen_country ?? '')}
        onclick={() => enregistrer(saisie)}>{$t('v2.set.catalogCountrySave' as any)}</button>
      {#if pays.chosen_country}
        <button class="lnk" data-pays-compte disabled={enCours}
          onclick={() => enregistrer('')}>{$t('v2.set.catalogCountryReset' as any)}</button>
      {/if}
    </div>
    <p class="hint">{$t('v2.set.catalogCountryHint' as any).replace('{account}', compte)}</p>
    {#if erreur}<p class="hint err">{$t('v2.set.catalogCountryInvalid' as any)}</p>{/if}
  </div>
{/if}

<style>
  .pays-catalogue { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .pays-catalogue .inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pays-catalogue .pays { width: 4em; text-transform: uppercase; }
  .pays-catalogue .hint { margin: 0; }
</style>
