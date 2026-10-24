<script lang="ts">
  /**
   * Tune Circle (renesenses/tune-server-rust#6935) : inviter quelqu'un dont on
   * ne connaît pas l'adresse, dans le bloc « Inviter », à côté de l'e-mail.
   *
   * - « Inviter un membre du forum » : son pseudo EXACT, sans recherche, sans
   *   liste, sans complétion. Le message est le même que le pseudo existe ou
   *   non : le cloud répond pareil, l'écran n'en déduit rien.
   * - « Créer un lien d'invitation » : un lien à usage unique, valable
   *   7 jours, à envoyer par SMS, WhatsApp ou le forum. Son URL n'est montrée
   *   QU'À la création (le cloud n'en garde que l'empreinte) : « Copier » est
   *   à côté. Les liens actifs se listent, avec leur échéance, et se révoquent.
   *
   * Un 404 sur `GET /invitation-links` dit un greffon ou un cloud d'avant
   * #6935 : rien de ce composant ne s'affiche.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dateCourte } from '../../lib/dates';
  import { copyText } from '../../lib/utils';
  import {
    inviterParPseudo, listerLiensInvitation, creerLienInvitation, revoquerLienInvitation, motifCercle,
    type LienInvitation, type MotifCercle,
  } from '../../lib/circle';

  let { circleId = null, onchange }: {
    /** Le cercle choisi dans le bloc « Inviter », s'il y en a un. */
    circleId?: number | null;
    /** Après une invitation par pseudo : l'écran relit `sent`. */
    onchange?: () => void;
  } = $props();

  type Retour = { texte: string; erreur: boolean };

  let disponible = $state<boolean | null>(null);
  let liens = $state<LienInvitation[]>([]);
  let pseudo = $state('');
  let occupe = $state(false);
  let retourPseudo = $state<Retour | null>(null);
  let retourLien = $state<Retour | null>(null);
  /** L'URL du lien qui vient d'être créé, montrée une seule fois. */
  let nouveau = $state<{ id: number; url: string } | null>(null);
  let copie = $state(false);

  function phrase(m: MotifCercle): string {
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  async function relireLiens() {
    try {
      liens = (await listerLiensInvitation()).links ?? [];
      disponible = true;
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (status === 404 || status === 405) disponible = false;
      else if (disponible === null) disponible = true; // panne passagère : les gestes diront le refus
    }
  }

  onMount(() => { void relireLiens(); });

  async function inviterPseudo(ev: SubmitEvent) {
    ev.preventDefault();
    const p = pseudo.trim();
    if (!p || occupe) return;
    occupe = true;
    retourPseudo = null;
    try {
      await inviterParPseudo(p, circleId);
      pseudo = '';
      retourPseudo = { texte: $t('v2.circle.invited' as any), erreur: false };
      onchange?.();
    } catch (e) {
      retourPseudo = { texte: phrase(motifCercle(e, 'pseudo')), erreur: true };
    } finally {
      occupe = false;
    }
  }

  async function creerLien() {
    if (occupe) return;
    occupe = true;
    retourLien = null;
    copie = false;
    try {
      const l = await creerLienInvitation(circleId);
      nouveau = { id: l.id, url: l.url };
    } catch (e) {
      nouveau = null;
      retourLien = { texte: phrase(motifCercle(e)), erreur: true };
    } finally {
      occupe = false;
    }
    await relireLiens();
  }

  async function copier() {
    if (!nouveau) return;
    copie = await copyText(nouveau.url);
    if (!copie) retourLien = { texte: $t('v2.circle.link.copyFailed' as any), erreur: true };
  }

  async function revoquer(l: LienInvitation) {
    if (occupe) return;
    occupe = true;
    retourLien = null;
    try {
      await revoquerLienInvitation(l.id);
      if (nouveau?.id === l.id) nouveau = null;
      retourLien = { texte: $t('v2.circle.link.revoked' as any), erreur: false };
    } catch (e) {
      retourLien = { texte: phrase(motifCercle(e)), erreur: true };
    } finally {
      occupe = false;
    }
    await relireLiens();
  }
</script>

{#if disponible}
  <div class="sans-email">
    <form class="rangee pseudo" onsubmit={inviterPseudo}>
      <label class="titre" for="circle-pseudo">{$t('v2.circle.pseudo.label' as any)}</label>
      <input id="circle-pseudo" class="champ pseudo-saisi" type="text" autocomplete="off" spellcheck="false"
        maxlength="255" placeholder={$t('v2.circle.pseudo.placeholder' as any)} bind:value={pseudo} />
      <button class="go envoyer-pseudo" type="submit" disabled={occupe || !pseudo.trim()}>{$t('v2.circle.send' as any)}</button>
    </form>
    <p class="note">{$t('v2.circle.pseudo.hint' as any)}</p>
    {#if retourPseudo}
      <div class={retourPseudo.erreur ? 'err retour-pseudo' : 'ok retour-pseudo'} role={retourPseudo.erreur ? 'alert' : 'status'}>
        {retourPseudo.texte}
      </div>
    {/if}

    <div class="liens">
      <div class="rangee">
        <span class="titre">{$t('v2.circle.link.title' as any)}</span>
        <button class="go creer-lien" type="button" disabled={occupe} onclick={() => void creerLien()}>
          {$t('v2.circle.link.create' as any)}
        </button>
      </div>
      <p class="note">{$t('v2.circle.link.hint' as any)}</p>
      {#if nouveau}
        <div class="rangee nouveau-lien">
          <label class="sr" for="circle-lien-url">{$t('v2.circle.link.urlLabel' as any)}</label>
          <input id="circle-lien-url" class="champ url-lien" type="text" readonly value={nouveau.url}
            onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
          <button class="lnk copier-lien" type="button" onclick={() => void copier()}>
            {copie ? $t('v2.circle.link.copied' as any) : $t('v2.circle.link.copy' as any)}
          </button>
        </div>
        <p class="note">{$t('v2.circle.link.onceOnly' as any)}</p>
      {/if}
      {#if retourLien}
        <div class={retourLien.erreur ? 'err retour-lien' : 'ok retour-lien'} role={retourLien.erreur ? 'alert' : 'status'}>
          {retourLien.texte}
        </div>
      {/if}
      {#if liens.length > 0}
        <h3 class="sous-titre">{$t('v2.circle.link.active' as any)}</h3>
        <ul>
          {#each liens as l (l.id)}
            <li class="ligne lien-actif">
              <span class="nom">{$t('v2.circle.link.item' as any).replace('{date}', $dateCourte(l.created_at))}</span>
              <span class="note">{$t('v2.circle.expires' as any).replace('{date}', $dateCourte(l.expires_at))}</span>
              <span class="gestes">
                <button class="lnk revoquer-lien" type="button" disabled={occupe} onclick={() => void revoquer(l)}>
                  {$t('v2.circle.link.revoke' as any)}
                </button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sans-email{display:flex; flex-direction:column; gap:8px; padding-top:6px; border-top:1px solid var(--v2-line)}
  .liens{display:flex; flex-direction:column; gap:6px}
  .titre{font-size:13px; font-weight:600}
  .sous-titre{font-size:13px; font-weight:700; margin:4px 0 0}
  .rangee{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .champ{height:34px; padding:0 12px; border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font:13px var(--v2-sans); min-width:0}
  .pseudo-saisi{flex:1 1 200px}
  .url-lien{flex:1 1 260px; font-family:var(--v2-mono, monospace); font-size:12px}
  .champ:focus-visible,.go:focus-visible,.lnk:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled,.lnk:disabled{opacity:.35; cursor:not-allowed}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .err,.ok{padding:8px 12px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .ok{border:1px solid var(--v2-line); background:var(--v2-acc-soft); color:var(--v2-txt)}
  ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .ligne{display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px;
    padding:6px 4px; border-bottom:1px solid var(--v2-line); font-size:13px}
  .nom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .gestes{display:flex; gap:10px; align-items:center}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (max-width: 640px){
    .ligne{grid-template-columns:minmax(0,1fr) auto}
    .ligne .note{grid-column:1}
  }
</style>
