<script lang="ts">
  /**
   * Bandeau « Connexion à mozaiklabs.fr expirée » (tune-server-rust#8797).
   *
   * Posé dans le FLUX de la coquille, comme l'annonce de mise à jour : visible
   * sur tous les écrans, hors des Réglages.
   *
   * - L'état vient de `GET /cloud/sso/status` (`reconnect_required`), relu au
   *   montage puis toutes les minutes : un refus du site se voit en moins
   *   d'une minute.
   * - « Se reconnecter » suit EXACTEMENT le chemin du menu de l'avatar et des
   *   Réglages (`relierCompteCloud`) : drapeau `tune_sso_pending`, puis
   *   `/api/v1/cloud/sso/authorize`. La reconnexion n'efface rien.
   * - Le texte dit de ne PAS passer par « Se déconnecter », qui effacerait la
   *   copie en ligne et les partages Tune Circle.
   * - Par l'accès à distance, le SSO ne peut pas aboutir (`ssoDisponible`) :
   *   le texte `login.ssoIndisponibleRelais` remplace le bouton.
   * - Une lecture en échec (serveur muet, plus ancien) ne montre RIEN.
   */
  import * as api from '../../lib/api';
  import { t, locale } from '../../lib/i18n';
  import { ssoDisponible } from '../../lib/bridge';
  import { urlSsoAuthorize } from '../../lib/ssoAuthorize';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import {
    bandeauReconnexionVisible,
    dateDuRefus,
    etatReconnexion,
    reconnexionCloud,
    reconnexionMasquee,
  } from '../../lib/reconnexionCloud';

  /** Une minute : le critère d'acceptation de #8797. */
  const PERIODE_MS = 60_000;

  async function relire(): Promise<void> {
    try {
      reconnexionCloud.set(etatReconnexion(await api.apiFetch('/cloud/sso/status')));
    } catch {
      reconnexionCloud.set(null);
    }
  }

  $effect(() => {
    void relire();
    const minuteur = setInterval(() => void relire(), PERIODE_MS);
    return () => clearInterval(minuteur);
  });

  const date = $derived(dateDuRefus($reconnexionCloud?.depuis ?? null, $locale));
  const message = $derived(
    date
      ? $t('cloud.reconnexionRequiseDepuis' as any).replace('{date}', date)
      : $t('cloud.reconnexionRequise' as any),
  );

  function seReconnecter(): void {
    try { localStorage.setItem('tune_sso_pending', Date.now().toString()); } catch {}
    try { sessionStorage.setItem('tune_sso_pending', '1'); } catch {}
    window.location.href = urlSsoAuthorize('/api/v1');
  }
</script>

{#if $bandeauReconnexionVisible}
  <div class="reco" role="alert">
    <span class="reco-txt" use:bulleTexte>{message}</span>
    {#if ssoDisponible()}
      <button class="reco-ok" onclick={seReconnecter}>{$t('cloud.seReconnecter' as any)}</button>
    {:else}
      <span class="reco-relais" use:bulleTexte>{$t('login.ssoIndisponibleRelais' as any)}</span>
    {/if}
    <button class="reco-x" onclick={() => reconnexionMasquee.set(true)}
      aria-label={$t('app.dismiss')} title={$t('app.dismiss')}>&times;</button>
  </div>
{/if}

<style>
  /* Même gabarit que l'annonce de mise à jour de la coquille (`.maj`), dans
     les couleurs d'alerte : c'est un service arrêté, pas une nouveauté. */
  .reco{flex:0 0 var(--maj-h, 42px); display:flex; align-items:center; gap:10px; min-width:0;
    padding:0 150px 0 30px; background:var(--v2-danger-soft); border-bottom:1px solid var(--v2-danger-bd); color:var(--v2-txt);
    font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .reco-txt,.reco-relais{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .reco-txt{flex:1 1 auto}
  .reco-relais{flex:0 1 auto; font-weight:500}
  .reco-ok{flex:0 0 auto; height:28px; padding:0 14px; border-radius:var(--v2-r-pill); border:0; cursor:pointer;
    font:700 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .reco-x{flex:0 0 auto; width:26px; height:26px; border:0; border-radius:50%; cursor:pointer;
    background:transparent; color:inherit; font-size:calc(18px * var(--v2-txt-echelle, 1)); line-height:1;
    display:grid; place-items:center}
</style>
