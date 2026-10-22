<script lang="ts">
  /**
   * Accès à distance par compte mozaiklabs (rc8) : connexion, refus, coupure.
   *
   * Monté par `ShellV2` seulement quand la page vient du relais. Écran
   * plein quand l'application ne peut rien faire sans lui (aucun lien
   * d'accès, écoute reprise ailleurs) ; bandeau quand l'ancien lien d'accès
   * fait encore tourner l'application.
   */
  import { t } from '../../lib/i18n';
  import { jetonHeriteConnu } from '../../lib/bridge';
  import {
    accesParCompte,
    connecterCompte,
    etatAccesParCompte,
    lienAccesObsolete,
    nomAppareilPropose,
  } from '../../lib/laissezPasser/accesParCompte';
  import { presentation, remplir } from '../../lib/laissezPasser/messages';

  const heritage = jetonHeriteConnu();
  let nom = $state(nomAppareilPropose());
  let masque = $state(false);
  let occupe = $state(false);

  const vue = $derived(presentation($etatAccesParCompte, heritage, $lienAccesObsolete));
  const appareils = $derived($etatAccesParCompte.type === 'refuse' ? ($etatAccesParCompte.appareils ?? []) : []);

  async function agir(action: string | undefined, deviceId?: string) {
    const m = accesParCompte();
    occupe = true;
    try {
      if (action === 'connecter') await connecterCompte(nom);
      else if (action === 'remplacer' && deviceId) await m?.remplacerAppareil(deviceId);
      else await m?.reprendre();
    } finally {
      occupe = false;
    }
  }
</script>

{#if vue.forme === 'ecran'}
  <div class="apc-voile" role="dialog" aria-modal="true" aria-labelledby="apc-titre">
    <div class="apc-carte">
      <h2 id="apc-titre">{$t('accesCompte.titre')}</h2>
      <p>{remplir($t(vue.cle), vue.params)}</p>
      {#if vue.action === 'connecter'}
        <label class="apc-champ">
          <span>{$t('accesCompte.nomAppareil')}</span>
          <input type="text" maxlength="80" bind:value={nom} />
        </label>
        <button class="apc-principal" disabled={occupe} onclick={() => agir('connecter')}>
          {$t('accesCompte.connecter')}
        </button>
      {:else if vue.action === 'remplacer'}
        <ul class="apc-appareils">
          {#each appareils as a (a.device_id)}
            <li>
              <span class="apc-nom">{a.name}</span>
              <span class="apc-plateforme">{a.platform}</span>
              <button disabled={occupe} onclick={() => agir('remplacer', a.device_id)}>{$t('accesCompte.remplacer')}</button>
            </li>
          {/each}
        </ul>
      {:else if vue.action === 'reprendre'}
        <button class="apc-principal" disabled={occupe} onclick={() => agir('reprendre')}>
          {$t('accesCompte.reprendre')}
        </button>
      {:else if vue.action === 'reessayer'}
        <button class="apc-principal" disabled={occupe} onclick={() => agir('reessayer')}>
          {$t('accesCompte.reessayer')}
        </button>
      {/if}
    </div>
  </div>
{:else if vue.forme === 'bandeau' && !masque}
  <div class="apc-bandeau" role="status">
    <span>{remplir($t(vue.cle), vue.params)}</span>
    {#if vue.action === 'connecter'}
      <button disabled={occupe} onclick={() => agir('connecter')}>{$t('accesCompte.connecter')}</button>
    {:else if vue.action}
      <button disabled={occupe} onclick={() => agir(vue.action)}>{$t('accesCompte.reessayer')}</button>
    {/if}
    <button class="apc-fermer" onclick={() => (masque = true)}>{$t('accesCompte.fermer')}</button>
  </div>
{/if}

<style>
  .apc-voile {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: var(--v2-scrim);
  }
  .apc-carte {
    width: min(440px, 100%);
    padding: 24px;
    border-radius: var(--v2-r-card);
    background: var(--v2-surface);
    color: var(--v2-txt);
    box-shadow: var(--v2-sh-lg);
    font-family: var(--v2-sans);
  }
  .apc-carte h2 {
    margin: 0 0 12px;
    font-size: 1.2rem;
  }
  .apc-carte p {
    margin: 0 0 16px;
    color: var(--v2-txt2);
    line-height: 1.45;
  }
  .apc-champ {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    font-size: 0.9rem;
    color: var(--v2-txt2);
  }
  .apc-champ input {
    padding: 8px 10px;
    border: 1px solid var(--v2-line);
    border-radius: var(--v2-r-md);
    background: var(--v2-bg2);
    color: var(--v2-txt);
  }
  .apc-principal {
    width: 100%;
    padding: 10px 14px;
    border: none;
    border-radius: var(--v2-r-pill);
    background: var(--v2-acc1);
    color: var(--v2-on-acc);
    font-weight: 600;
    cursor: pointer;
  }
  .apc-appareils {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .apc-appareils li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--v2-line);
    border-radius: var(--v2-r-md);
  }
  .apc-nom {
    flex: 1;
  }
  .apc-plateforme {
    color: var(--v2-txt3);
    font-size: 0.85rem;
  }
  .apc-bandeau {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 900;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: var(--v2-acc-soft);
    color: var(--v2-txt);
    font-size: 0.9rem;
  }
  .apc-bandeau span {
    flex: 1;
  }
  .apc-bandeau button,
  .apc-appareils button {
    padding: 4px 10px;
    border: 1px solid var(--v2-line2);
    border-radius: var(--v2-r-pill);
    background: var(--v2-surface2);
    color: var(--v2-txt);
    cursor: pointer;
  }
</style>
