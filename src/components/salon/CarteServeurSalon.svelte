<script lang="ts">
  /**
   * Interface « Salon » — la carte « Serveur Tune » en tête de Réglages ›
   * Général : le nom de la machine, sa version, son adresse et le compte
   * mozaiklabs.fr relié. Lecture seule : les deux boutons MÈNENT aux sections
   * qui portent les gestes (À propos, compte du nuage) ; la déliaison du compte
   * reste là où elle demande confirmation.
   *
   * Montée par `SettingsV2` dans Salon seulement ; ses couleurs sont les jetons
   * du thème (`--s-*`).
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import IconeSalon from './IconeSalon.svelte';

  let nom = $state<string | null>(null);
  let version = $state<string | null>(null);
  let compte = $state<string | null>(null);
  const adresse = typeof window !== 'undefined' ? window.location.host : '';

  onMount(() => {
    api.getHealth().then((h) => { nom = h?.server_name ?? null; version = h?.version ?? null; }).catch(() => {});
    api.apiFetch('/cloud/sso/status').then((s: any) => {
      compte = s?.connected ? (s.user?.display_name || s.user?.email || $t('roonLike.serveur.relie' as any)) : null;
    }).catch(() => { compte = null; });
  });
</script>

<section class="carte-serveur" data-carte-serveur-salon>
  <h3>{$t('roonLike.serveur.titre' as any)}</h3>
  <div class="corps">
    <span class="logo" aria-hidden="true"><IconeSalon nom="enceinte" taille={30} trait={1.3} /></span>
    <div class="ident">
      <span class="nom">{nom ?? adresse}</span>
      <span class="adresse">{adresse}{#if version} · {$t('roonLike.serveur.version' as any)} {version}{/if}</span>
      <span class="compte">{#if compte}{$t('roonLike.serveur.connecteEnTantQue' as any)} <strong>{compte}</strong>{:else}{$t('roonLike.serveur.nonRelie' as any)}{/if}</span>
    </div>
  </div>
  <div class="actions">
    <button class="secondaire" onclick={() => v2SettingsTarget.set({ tab: 'system', section: 'about' })}>{$t('roonLike.serveur.aPropos' as any)}</button>
    <button class="principal" onclick={() => v2SettingsTarget.set({ tab: 'system', section: 'cloud' })}>{$t('roonLike.serveur.infosCompte' as any)}</button>
  </div>
</section>

<style>
  .carte-serveur { border: 1px solid var(--s-line); border-radius: var(--s-r-pop); padding: 16px 16px 14px; background: var(--s-bg); }
  h3 { margin: 0; font-size: var(--s-t-petit); font-weight: var(--s-graisse-forte); text-transform: uppercase; letter-spacing: var(--s-interlettre-capitales); color: var(--s-txt); }
  .corps { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
  .logo { color: var(--s-txt); display: grid; place-items: center; }
  .ident { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .nom { font-size: var(--s-t-corps); font-weight: var(--s-graisse-moyenne); color: var(--s-txt); }
  .adresse { font-size: var(--s-t-mini); color: var(--s-txt3); overflow-wrap: anywhere; }
  .compte { font-size: var(--s-t-petit); color: var(--s-txt2); margin-top: 6px; }
  .compte strong { font-weight: var(--s-graisse-moyenne); color: var(--s-txt); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  button { border: 0; cursor: pointer; font: inherit; font-size: var(--s-t-petit); padding: 9px 18px; border-radius: var(--s-r-pilule); }
  .secondaire { background: var(--s-puce); color: var(--s-txt); }
  .principal { background: var(--s-acc); color: var(--s-sur-acc); }
  .secondaire:hover { background: var(--s-survol); }
  .principal:hover { background: var(--s-acc-fonce); }
</style>
