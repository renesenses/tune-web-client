<script lang="ts">
  /**
   * Tune Circle rc9 (web#2437, décision de Bertrand du 26/10/2026) : les
   * notifications dans l'écran Tune Circle. Une liste (lire, tout marquer lu)
   * et, repliés dessous, les réglages : un interrupteur par type.
   *
   * Dans Tune web seulement : ni push, ni mail. Lire une notification ne dit
   * rien à son émetteur. Serveur sans ces routes (404) : rien n'est affiché,
   * l'écran reste celui d'avant.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dateCourte } from '../../lib/dates';
  import {
    notifsCercle, relireNotifications, marquerLue, toutMarquerLu, lireReglages, reglerType,
    TYPES_REGLAGE, type NotifCercle, type Reglages, type TypeReglage,
  } from '../../lib/circleNotifications';

  let { onOuvrir }: { onOuvrir?: (n: NotifCercle) => void } = $props();

  let reglages = $state<Reglages | null>(null);
  let reglagesOuverts = $state(false);
  let occupe = $state(false);
  let erreur = $state(false);

  onMount(() => { void relireNotifications(); });

  const etat = $derived($notifsCercle);

  function tr(cle: string, vars: Record<string, string | number> = {}): string {
    let s = $t(cle as any);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }

  function phrase(n: NotifCercle): string {
    const v = { name: n.actor.name, circle: n.circle_name ?? '', playlist: n.playlist?.name ?? '', n: n.count };
    switch (n.kind) {
      case 'playlist_shared': return tr(n.circle_name ? 'v2.circle.notif.playlistShared' : 'v2.circle.notif.playlistSharedNoCircle', v);
      case 'circle_invitation': return tr('v2.circle.notif.circleInvitation', v);
      case 'message': return tr(n.count > 1 ? 'v2.circle.notif.messages' : 'v2.circle.notif.message', v);
      case 'contact_request': return tr('v2.circle.notif.contactRequest', v);
      case 'contact_accepted': return tr('v2.circle.notif.contactAccepted', v);
    }
  }

  async function geste(action: () => Promise<unknown>) {
    if (occupe) return;
    occupe = true;
    erreur = false;
    try { await action(); } catch { erreur = true; } finally { occupe = false; }
  }

  function ouvrir(n: NotifCercle) {
    void geste(async () => { if (!n.read) await marquerLue(n.id); });
    onOuvrir?.(n);
  }

  async function basculerReglages() {
    reglagesOuverts = !reglagesOuverts;
    if (reglagesOuverts && reglages === null) await geste(async () => { reglages = await lireReglages(); });
  }

  function basculer(type: TypeReglage) {
    if (!reglages) return;
    const voulu = !reglages[type];
    void geste(async () => { reglages = await reglerType(type, voulu); await relireNotifications(); });
  }

  const libelleType: Record<TypeReglage, string> = {
    playlist_shared: 'v2.circle.notif.pref.playlistShared',
    circle_invitation: 'v2.circle.notif.pref.circleInvitation',
    message: 'v2.circle.notif.pref.message',
    contact: 'v2.circle.notif.pref.contact',
  };
</script>

{#if etat.relais === 'ok' || etat.relais === 'indisponible'}
  <section class="bloc notifs-cercle" aria-labelledby="circle-notifs">
    <div class="notifs-tete">
      <h2 id="circle-notifs">{$t('v2.circle.notif.title' as any)}</h2>
      {#if etat.nonLues > 0}
        <span class="notifs-compte">{tr('v2.circle.notif.unreadAria', { n: etat.nonLues })}</span>
        <button type="button" class="lnk tout-lu" disabled={occupe} onclick={() => void geste(toutMarquerLu)}>{$t('v2.circle.notif.markAll' as any)}</button>
      {/if}
    </div>
    {#if etat.relais === 'indisponible' || erreur}
      <p class="note alerte" role="alert">{$t('v2.circle.notif.unavailable' as any)}</p>
    {/if}
    {#if etat.liste.length === 0}
      <p class="note notifs-vide">{$t('v2.circle.notif.empty' as any)}</p>
    {:else}
      <ul class="notifs-liste">
        {#each etat.liste as n (n.id)}
          <li class="notif" class:non-lue={!n.read} data-genre={n.kind}>
            <button type="button" class="notif-ligne" disabled={occupe} onclick={() => ouvrir(n)}>
              <span class="notif-texte">{phrase(n)}</span>
              {#if n.at}<span class="note notif-date">{$dateCourte(n.at)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <button type="button" class="lnk notifs-reglages-bascule" aria-expanded={reglagesOuverts} onclick={() => void basculerReglages()}>
      {$t('v2.circle.notif.settings' as any)}
    </button>
    {#if reglagesOuverts && reglages}
      <div class="notifs-reglages">
        <p class="note">{$t('v2.circle.notif.settingsHint' as any)}</p>
        {#each TYPES_REGLAGE as type (type)}
          <button type="button" class="interrupteur interrupteur-notif" data-type={type} role="switch" aria-checked={reglages[type]}
            disabled={occupe} onclick={() => basculer(type)}>
            <span class="piste-interrupteur" aria-hidden="true"><span class="bouton-interrupteur"></span></span>
            <span>{$t(libelleType[type] as any)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .bloc{display:flex; flex-direction:column; gap:8px}
  .bloc h2{font-size:15px; font-weight:700; margin:0}
  .notifs-tete{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap}
  .notifs-compte{font:600 12px var(--v2-sans); color:var(--v2-acc1)}
  .notifs-liste{list-style:none; margin:8px 0; padding:0; display:flex; flex-direction:column; gap:2px}
  .notif-ligne{display:flex; justify-content:space-between; align-items:baseline; gap:12px; width:100%; text-align:left;
    border:0; background:transparent; color:var(--v2-txt2); font:400 13px var(--v2-sans); padding:6px 8px; border-radius:6px; cursor:pointer}
  .notif-ligne:hover{background:var(--v2-line)}
  .notif.non-lue .notif-ligne{color:var(--v2-txt); font-weight:600}
  .notif.non-lue .notif-texte::before{content:''; display:inline-block; width:7px; height:7px; border-radius:50%;
    background:var(--v2-acc1); margin-right:8px; vertical-align:middle}
  .notif-texte{min-width:0; overflow-wrap:anywhere}
  .notif-date{flex:none}
  .note{font:400 12px var(--v2-sans); color:var(--v2-txt3); margin:4px 0}
  .alerte{color:var(--v2-danger)}
  .lnk{border:0; background:transparent; color:var(--v2-acc2); font:600 12px var(--v2-sans); cursor:pointer; padding:2px 0}
  .lnk:disabled,.notif-ligne:disabled{opacity:.5; cursor:not-allowed}
  .notifs-reglages{display:flex; flex-direction:column; gap:8px; margin-top:8px}
  .interrupteur{display:inline-flex; align-items:center; gap:10px; border:0; background:transparent; color:var(--v2-txt);
    font:600 13px var(--v2-sans); cursor:pointer; padding:2px 0; align-self:flex-start}
  .interrupteur:disabled{opacity:.35; cursor:not-allowed}
  .piste-interrupteur{position:relative; width:34px; height:20px; border-radius:10px; background:var(--v2-line2); flex:none; transition:background .15s}
  .bouton-interrupteur{position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--v2-surface); transition:left .15s}
  .interrupteur[aria-checked="true"] .piste-interrupteur{background:var(--v2-acc2)}
  .interrupteur[aria-checked="true"] .bouton-interrupteur{left:16px}
  .lnk:focus-visible,.notif-ligne:focus-visible,.interrupteur:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
</style>
