<script lang="ts">
  /**
   * Réglages › Accès distant, quand l'écoute à distance passe par le compte
   * mozaiklabs (`acces_par_compte` dans `GET /cloud/bridge/status`,
   * tune-server-rust#6603) : plus de lien ni de QR code à partager.
   *
   * Appareils du compte (5 au plus) et retrait. La liste et le retrait
   * passent par le SITE, avec le jeton OAuth du compte : c'est le site qui ne
   * rend et ne retire que les appareils de ce compte. Ce jeton n'existe que
   * dans l'application servie par le relais ; sur le réseau local, on renvoie
   * vers l'espace client.
   */
  import { t, locale } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { accesParCompte, ESPACE_CLIENT_ECOUTE, etatAccesParCompte } from '../../lib/laissezPasser/accesParCompte';
  import type { AppareilDuSite } from '../../lib/laissezPasser/machine';
  import { remplir } from '../../lib/laissezPasser/messages';

  const machine = accesParCompte();
  const relie = $derived.by(() => {
    void $etatAccesParCompte;
    return machine !== null && machine.compteRelie();
  });

  let appareils = $state<AppareilDuSite[]>([]);
  let max = $state(5);
  let courant = $state<string | null>(null);
  let chargement = $state(false);
  let charge = $state(false);
  let erreur = $state<string | null>(null);
  let retrait = $state<string | null>(null);

  const PLATEFORMES: Record<string, string> = {
    ios: 'accesCompte.plateforme.ios',
    android: 'accesCompte.plateforme.android',
    web: 'accesCompte.plateforme.web',
  };

  function plateforme(p: string): string {
    return PLATEFORMES[p] ? $t(PLATEFORMES[p] as any) : p;
  }

  function date(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString($locale, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return d.toLocaleDateString();
    }
  }

  async function charger() {
    if (!machine) return;
    chargement = true;
    const r = await machine.listerAppareils();
    if (r.ok) {
      appareils = r.appareils;
      max = r.max;
      courant = r.courant;
      erreur = null;
    } else {
      erreur = r.raison;
    }
    chargement = false;
    charge = true;
  }

  $effect(() => {
    if (relie && !charge && !chargement) void charger();
  });

  async function retirer(a: AppareilDuSite) {
    if (!machine) return;
    const cle = a.device_id === courant ? 'accesCompte.appareils.retirerCeluiCiConfirm' : 'accesCompte.appareils.retirerConfirm';
    if (!(await dialogs.confirm(remplir($t(cle as any), { nom: a.name }), { danger: true }))) return;
    retrait = a.device_id;
    const r = await machine.retirerAppareil(a.device_id);
    retrait = null;
    if (r.ok || r.raison === 'appareil_inconnu') {
      appareils = appareils.filter((x) => x.device_id !== a.device_id);
      erreur = null;
    } else {
      erreur = r.raison;
    }
  }
</script>

<div class="apr" data-acces="par-compte">
  <p class="apr-explication">{$t('accesCompte.reglages.explication')}</p>

  {#if relie}
    <div class="apr-tete">
      <span>{$t('accesCompte.appareils.titre')}</span>
      {#if charge && !erreur}
        <span class="apr-compte">{remplir($t('accesCompte.appareils.compte'), { n: String(appareils.length), max: String(max) })}</span>
      {/if}
    </div>
    {#if erreur}
      <p class="apr-erreur" data-acces="erreur">{remplir($t('accesCompte.appareils.erreur'), { code: erreur })}</p>
      <button class="lnk" onclick={charger} disabled={chargement}>{$t('accesCompte.reessayer')}</button>
    {:else if !charge}
      <p class="apr-note">{$t('accesCompte.appareils.chargement')}</p>
    {:else if !appareils.length}
      <p class="apr-note">{$t('accesCompte.appareils.vide')}</p>
    {/if}
    {#if appareils.length}
      <ul class="apr-liste">
        {#each appareils as a (a.device_id)}
          <li data-appareil={a.device_id}>
            <span class="apr-nom">
              {a.name}
              {#if a.device_id === courant}
                <span class="apr-ici">{$t('accesCompte.appareils.celuiCi')}</span>
              {/if}
            </span>
            <span class="apr-detail">
              {plateforme(a.platform)}{#if a.last_pass_at} · {remplir($t('accesCompte.appareils.derniereEcoute'), { date: date(a.last_pass_at) })}{/if}
            </span>
            <button
              class="lnk danger"
              data-acces="retirer"
              disabled={retrait !== null}
              onclick={() => retirer(a)}
            >
              {retrait === a.device_id ? $t('accesCompte.appareils.retraitEnCours') : $t('accesCompte.appareils.retirer')}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="apr-note">{$t('accesCompte.appareils.delai')}</p>
  {:else}
    <p class="apr-note">{$t('accesCompte.appareils.ailleurs')}</p>
    <a class="apr-lien" data-acces="espace-client" href={ESPACE_CLIENT_ECOUTE} target="_blank" rel="noopener">
      {$t('accesCompte.appareils.espaceClient')}
    </a>
  {/if}
</div>

<style>
  .apr {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
  }
  .apr-explication {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--v2-txt);
  }
  .apr-tete {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-top: 6px;
    font-size: 13px;
    color: var(--v2-txt);
  }
  .apr-compte,
  .apr-note,
  .apr-detail {
    font-size: 12px;
    color: var(--v2-txt2);
  }
  .apr-note {
    margin: 0;
    line-height: 1.45;
  }
  .apr-erreur {
    margin: 0;
    font-size: 12px;
    color: var(--v2-danger);
  }
  .apr-liste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .apr-liste li {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'nom bouton' 'detail bouton';
    align-items: center;
    column-gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--v2-line);
    border-radius: 10px;
  }
  .apr-nom {
    grid-area: nom;
    font-size: 13px;
    color: var(--v2-txt);
    overflow-wrap: anywhere;
  }
  .apr-detail {
    grid-area: detail;
  }
  .apr-liste li button {
    grid-area: bouton;
  }
  .apr-ici {
    margin-left: 6px;
    font: 10px var(--v2-mono);
    color: var(--v2-acc1);
  }
  .apr-lien {
    font-size: 13px;
    color: var(--v2-acc1);
  }
</style>
