<script lang="ts">
  import { t } from '../../lib/i18n';
  /**
   * Extensions → Tune Circle — renesenses/tune-server-rust#5018 (étape T1,
   * avenant « plusieurs cercles » du 25/09/2026).
   *
   * - « Mes contacts » : les personnes qui ont ACCEPTÉ. Les retirer est une
   *   RÉVOCATION : immédiate, hors de tous les cercles, réinvitation requise.
   * - « Mes cercles » : MES classements privés. Y ranger un contact ne lui
   *   demande rien et ne lui montre rien ; l'en retirer n'est pas révoquer.
   * - Inviter, invitations reçues, invitations envoyées.
   *
   * Le cloud porte la vérité : aucun état local du cercle. L'écran relit
   * `GET /` à l'ouverture, après CHAQUE geste, et au plus toutes les
   * {@link RELECTURE_CERCLE_MS} ms tant qu'il est ouvert et l'onglet visible,
   * pour voir arriver une invitation.
   *
   * Il n'existe que si le greffon tourne (`circleCharge`) : sans lui, ses
   * routes ne sont pas montées, et l'écran le dit sans rien interroger.
   */
  import { onDestroy } from 'svelte';
  import { dialogs } from '../../lib/stores/dialogs';
  import { dateCourte } from '../../lib/dates';
  import {
    circleCharge, circlePlugin, refreshCirclePlugin, getCercle, estConnecte,
    inviterAuCercle, accepterInvitation, refuserInvitation, annulerInvitation,
    revoquerContact, creerCercle, renommerCercle, supprimerCercle,
    rangerDansCercle, retirerDuCercle, motifCercle, nomCercleValide,
    seConnecterAMozaiklabs, NOM_CERCLE_MAX, RELECTURE_CERCLE_MS,
    type EtatCercle, type MotifCercle, type ContactCercle, type CercleNomme,
  } from '../../lib/circle';
  import '../../styles/tune-v2.css';

  type Retour = { texte: string; erreur: boolean; reessayer?: () => void };

  let etat = $state<EtatCercle | null>(null);
  let erreurLecture = $state<MotifCercle | null>(null);
  let occupe = $state<string | null>(null);
  let retour = $state<Retour | null>(null);
  let retourInvitation = $state<Retour | null>(null);

  let email = $state('');
  let cercleInvitation = $state<number | ''>('');
  let nomNouveau = $state('');
  let ajout = $state<Record<number, number | ''>>({});

  let fini = false;
  let enCours = false;
  let minuteur: ReturnType<typeof setTimeout> | null = null;

  const connecte = $derived(etat && estConnecte(etat) ? etat : null);
  const contacts = $derived<ContactCercle[]>(connecte?.members ?? []);
  /** MES cercles, et eux seuls : aucun nom de cercle ne vient d'ailleurs. */
  const cercles = $derived<CercleNomme[]>(connecte?.circles ?? []);
  const nomDe = $derived(new Map(contacts.map((c) => [c.user_id, c.name])));

  function phrase(m: MotifCercle): string {
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  async function relire() {
    if (fini) return;
    enCours = true;
    try {
      const e = await getCercle();
      if (fini) return;
      etat = e;
      erreurLecture = null;
    } catch (e) {
      if (fini) return;
      // Pas de liste périmée affichée comme vraie : l'écran dit la panne.
      etat = null;
      erreurLecture = motifCercle(e);
    } finally {
      enCours = false;
    }
  }

  /** Relecture modérée : onglet visible, écran ouvert, rien en cours. */
  function planifier() {
    if (fini) return;
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(async () => {
      const cache = typeof document !== 'undefined' && document.hidden;
      if (!cache && !enCours && occupe === null) await relire();
      planifier();
    }, RELECTURE_CERCLE_MS);
  }

  /**
   * Un geste, puis la relecture de `GET /`, qu'il ait réussi ou non : l'écran
   * montre ce que le cloud dit, pas ce qu'il suppose.
   */
  async function geste(
    nom: string,
    action: () => Promise<unknown>,
    opts: { vers?: 'invitation' | 'action'; succes?: string; champ?: 'email' | 'name' | null; apres?: () => void } = {},
  ) {
    if (occupe !== null) return;
    const vers = opts.vers ?? 'action';
    occupe = nom;
    const poser = (r: Retour | null) => { if (vers === 'invitation') retourInvitation = r; else retour = r; };
    poser(null);
    try {
      await action();
      opts.apres?.();
      if (opts.succes) poser({ texte: $t(opts.succes as any), erreur: false });
    } catch (e) {
      const m = motifCercle(e, opts.champ ?? null);
      poser({
        texte: phrase(m),
        erreur: true,
        reessayer: m.indisponible ? () => void geste(nom, action, opts) : undefined,
      });
    } finally {
      occupe = null;
    }
    await relire();
  }

  // ── Les gestes ────────────────────────────────────────────────────────────

  function inviter(ev: SubmitEvent) {
    ev.preventDefault();
    const adresse = email.trim();
    if (!adresse) return;
    const cid = cercleInvitation === '' ? null : cercleInvitation;
    // 🔴 Le même message que l'adresse ait un compte ou non : le cloud répond
    // pareil, et l'écran n'en déduit rien.
    void geste('inviter', () => inviterAuCercle(adresse, cid), {
      vers: 'invitation', succes: 'v2.circle.invited', champ: 'email',
      apres: () => { email = ''; cercleInvitation = ''; },
    });
  }

  async function revoquer(c: ContactCercle) {
    const ok = await dialogs.confirm(
      $t('v2.circle.confirmRevoke' as any).split('{name}').join(c.name),
      { danger: true },
    );
    if (!ok) return;
    void geste(`revoquer-${c.user_id}`, () => revoquerContact(c.user_id), { succes: 'v2.circle.revoked' });
  }

  function creer(ev: SubmitEvent) {
    ev.preventDefault();
    const nom = nomCercleValide(nomNouveau);
    if (nom === null) { retour = { texte: $t('v2.circle.err.nameInvalid' as any), erreur: true }; return; }
    void geste('creer', () => creerCercle(nom), { champ: 'name', apres: () => { nomNouveau = ''; } });
  }

  async function renommer(c: CercleNomme) {
    const saisi = await dialogs.prompt($t('v2.circle.renamePrompt' as any), c.name);
    if (saisi === null) return;
    const nom = nomCercleValide(saisi);
    if (nom === null) { retour = { texte: $t('v2.circle.err.nameInvalid' as any), erreur: true }; return; }
    if (nom === c.name) return;
    void geste(`renommer-${c.id}`, () => renommerCercle(c.id, nom), { champ: 'name' });
  }

  async function supprimer(c: CercleNomme) {
    const ok = await dialogs.confirm(
      $t('v2.circle.confirmDeleteCircle' as any).replace('{name}', c.name),
      { danger: true },
    );
    if (!ok) return;
    void geste(`supprimer-${c.id}`, () => supprimerCercle(c.id));
  }

  function ranger(c: CercleNomme) {
    const uid = ajout[c.id];
    if (uid === '' || uid == null) return;
    void geste(`ranger-${c.id}`, () => rangerDansCercle(c.id, uid), { apres: () => { ajout[c.id] = ''; } });
  }

  function retirerDe(c: CercleNomme, uid: number) {
    // Pas une révocation : le contact reste un contact, et reste dans ses
    // autres cercles.
    void geste(`retirer-${c.id}-${uid}`, () => retirerDuCercle(c.id, uid));
  }

  // ── Cycle de vie ──────────────────────────────────────────────────────────

  $effect(() => { void refreshCirclePlugin(); });
  let demarre = false;
  $effect(() => {
    if ($circleCharge && !demarre) {
      demarre = true;
      void relire().then(planifier);
    }
  });
  onDestroy(() => { fini = true; if (minuteur) clearTimeout(minuteur); });

  const hors = (c: CercleNomme) => contacts.filter((m) => !c.member_ids.includes(m.user_id));
</script>

<section class="v2-circle tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.nav.plugins' as any)}</div>
      <h1>{$t('v2.circle.title' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    {#if $circlePlugin === null}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !$circleCharge}
      <div class="state absent">{$t('v2.circle.notInstalled' as any)}</div>
    {:else if erreurLecture}
      <div class="err panne" role="alert">
        <span>{phrase(erreurLecture)}</span>
        <button class="lnk reessayer" onclick={() => void relire()}>{$t('v2.circle.retry' as any)}</button>
      </div>
    {:else if !etat}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !connecte}
      <div class="state deconnecte">
        <p>{$t('v2.circle.notConnected' as any)}</p>
        <button class="go se-connecter" onclick={seConnecterAMozaiklabs}>{$t('v2.circle.signIn' as any)}</button>
      </div>
    {:else}
      <p class="intro">{$t('v2.circle.intro' as any)}</p>

      {#if retour}
        <div class={retour.erreur ? 'err retour' : 'ok retour'} role={retour.erreur ? 'alert' : 'status'}>
          <span>{retour.texte}</span>
          {#if retour.reessayer}
            <button class="lnk reessayer" onclick={retour.reessayer}>{$t('v2.circle.retry' as any)}</button>
          {/if}
        </div>
      {/if}

      {#if connecte.received.length > 0}
        <section class="bloc recues" aria-labelledby="circle-recues">
          <h2 id="circle-recues">{$t('v2.circle.received' as any)}</h2>
          <ul>
            {#each connecte.received as inv (inv.id)}
              <li class="ligne invitation-recue">
                <span class="nom">{inv.name_or_email}</span>
                <span class="note">{$t('v2.circle.expires' as any).replace('{date}', $dateCourte(inv.expires_at))}</span>
                <span class="gestes">
                  <button class="go accepter" disabled={occupe !== null}
                    onclick={() => void geste(`accepter-${inv.id}`, () => accepterInvitation(inv.id), { succes: 'v2.circle.accepted' })}>
                    {$t('v2.circle.accept' as any)}
                  </button>
                  <button class="lnk refuser" disabled={occupe !== null}
                    onclick={() => void geste(`refuser-${inv.id}`, () => refuserInvitation(inv.id))}>
                    {$t('v2.circle.decline' as any)}
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="bloc contacts" aria-labelledby="circle-contacts">
        <h2 id="circle-contacts">{$t('v2.circle.contacts' as any)}</h2>
        {#if contacts.length === 0}
          <p class="note vide">{$t('v2.circle.noContacts' as any)}</p>
        {:else}
          <ul>
            {#each contacts as c (c.user_id)}
              <li class="ligne contact">
                <span class="nom">{c.name}</span>
                <span class="note">{$t('v2.circle.since' as any).replace('{date}', $dateCourte(c.since))}</span>
                <span class="gestes">
                  <button class="lnk danger revoquer" disabled={occupe !== null}
                    aria-label={$t('v2.circle.revokeNamed' as any).replace('{name}', c.name)}
                    onclick={() => void revoquer(c)}>
                    {$t('v2.circle.revoke' as any)}
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="bloc cercles" aria-labelledby="circle-cercles">
        <h2 id="circle-cercles">{$t('v2.circle.circles' as any)}</h2>
        <p class="note">{$t('v2.circle.circlesHint' as any)}</p>
        <form class="rangee creer-cercle" onsubmit={creer}>
          <label class="sr" for="circle-nouveau">{$t('v2.circle.newCircleLabel' as any)}</label>
          <input id="circle-nouveau" class="champ" type="text" maxlength={NOM_CERCLE_MAX}
            placeholder={$t('v2.circle.newCirclePlaceholder' as any)} bind:value={nomNouveau} />
          <button class="go creer" type="submit" disabled={occupe !== null || !nomNouveau.trim()}>{$t('v2.circle.create' as any)}</button>
        </form>
        {#if cercles.length === 0}
          <p class="note vide">{$t('v2.circle.noCircles' as any)}</p>
        {:else}
          {#each cercles as c (c.id)}
            <article class="cercle" aria-label={c.name}>
              <div class="cercle-tete">
                <h3 class="cercle-nom">{c.name}</h3>
                <button class="lnk renommer" disabled={occupe !== null} onclick={() => void renommer(c)}>{$t('v2.circle.rename' as any)}</button>
                <button class="lnk danger supprimer" disabled={occupe !== null} onclick={() => void supprimer(c)}>{$t('v2.circle.deleteCircle' as any)}</button>
              </div>
              {#if c.member_ids.length === 0}
                <p class="note vide">{$t('v2.circle.circleEmpty' as any)}</p>
              {:else}
                <ul>
                  {#each c.member_ids as uid (uid)}
                    <li class="ligne membre-cercle">
                      <span class="nom">{nomDe.get(uid) ?? ''}</span>
                      <span class="gestes">
                        <button class="lnk retirer-du-cercle" disabled={occupe !== null}
                          title={$t('v2.circle.removeFromCircleHint' as any)}
                          onclick={() => retirerDe(c, uid)}>
                          {$t('v2.circle.removeFromCircle' as any)}
                        </button>
                      </span>
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if hors(c).length > 0}
                <div class="rangee ajouter">
                  <label class="sr" for={`circle-ajout-${c.id}`}>{$t('v2.circle.addContact' as any)}</label>
                  <select id={`circle-ajout-${c.id}`} class="champ choix-contact" bind:value={ajout[c.id]}>
                    <option value="">{$t('v2.circle.addContactPick' as any)}</option>
                    {#each hors(c) as m (m.user_id)}
                      <option value={m.user_id}>{m.name}</option>
                    {/each}
                  </select>
                  <button class="lnk ranger" disabled={occupe !== null || ajout[c.id] === '' || ajout[c.id] == null}
                    onclick={() => ranger(c)}>{$t('v2.circle.addContact' as any)}</button>
                </div>
              {/if}
            </article>
          {/each}
        {/if}
      </section>

      <section class="bloc inviter" aria-labelledby="circle-inviter">
        <h2 id="circle-inviter">{$t('v2.circle.invite' as any)}</h2>
        <form class="rangee" onsubmit={inviter}>
          <label class="sr" for="circle-email">{$t('v2.circle.emailLabel' as any)}</label>
          <input id="circle-email" class="champ email" type="email" autocomplete="email"
            placeholder={$t('v2.circle.emailLabel' as any)} bind:value={email} />
          {#if cercles.length > 0}
            <label class="sr" for="circle-ranger">{$t('v2.circle.fileInto' as any)}</label>
            <select id="circle-ranger" class="champ ranger-dans" bind:value={cercleInvitation}>
              <option value="">{$t('v2.circle.fileIntoNone' as any)}</option>
              {#each cercles as c (c.id)}
                <option value={c.id}>{$t('v2.circle.fileIntoNamed' as any).replace('{name}', c.name)}</option>
              {/each}
            </select>
          {/if}
          <button class="go envoyer" type="submit" disabled={occupe !== null || !email.trim()}>{$t('v2.circle.send' as any)}</button>
        </form>
        {#if retourInvitation}
          <div class={retourInvitation.erreur ? 'err retour-invitation' : 'ok retour-invitation'}
            role={retourInvitation.erreur ? 'alert' : 'status'}>
            <span>{retourInvitation.texte}</span>
            {#if retourInvitation.reessayer}
              <button class="lnk reessayer" onclick={retourInvitation.reessayer}>{$t('v2.circle.retry' as any)}</button>
            {/if}
          </div>
        {/if}
      </section>

      <section class="bloc envoyees" aria-labelledby="circle-envoyees">
        <h2 id="circle-envoyees">{$t('v2.circle.sent' as any)}</h2>
        {#if connecte.sent.length === 0}
          <p class="note vide">{$t('v2.circle.noSent' as any)}</p>
        {:else}
          <ul>
            {#each connecte.sent as inv (inv.id)}
              <li class="ligne invitation-envoyee">
                <span class="nom">{inv.name_or_email}</span>
                <span class="note">{$t('v2.circle.expires' as any).replace('{date}', $dateCourte(inv.expires_at))}</span>
                <span class="gestes">
                  <button class="lnk annuler" disabled={occupe !== null}
                    onclick={() => void geste(`annuler-${inv.id}`, () => annulerInvitation(inv.id))}>
                    {$t('v2.circle.cancelInvite' as any)}
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</section>

<style>
  .v2-circle{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; display:flex; flex-direction:column; gap:16px; max-width:880px}
  .state{color:var(--v2-txt3); font-size:13px}
  .absent,.deconnecte{padding:14px 16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2); color:var(--v2-txt2);
    display:flex; flex-direction:column; gap:10px; align-items:flex-start}
  .intro{font-size:13px; color:var(--v2-txt2); margin:0}
  .err,.ok{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .ok{border:1px solid var(--v2-line); background:var(--v2-acc-soft); color:var(--v2-txt)}
  .panne,.retour,.retour-invitation{margin:0}
  .bloc{display:flex; flex-direction:column; gap:8px}
  .bloc h2{font-size:15px; font-weight:700; margin:0}
  .bloc ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .ligne{display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px;
    padding:8px 6px; border-bottom:1px solid var(--v2-line); font-size:13px}
  .nom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .note{font-size:11.5px; color:var(--v2-txt3)}
  .vide{margin:0}
  .gestes{display:flex; gap:10px; align-items:center}
  .rangee{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .champ{height:34px; padding:0 12px; border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font:13px var(--v2-sans); min-width:0}
  .champ:focus-visible,.go:focus-visible,.lnk:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .email{flex:1 1 220px}
  .cercle{display:flex; flex-direction:column; gap:6px; padding:12px 14px; border-radius:var(--v2-r-card);
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .cercle-tete{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .cercle-nom{font-size:14px; font-weight:700; margin:0; flex:1; min-width:0; overflow-wrap:anywhere}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px}
  .lnk:disabled{opacity:.35; cursor:not-allowed}
  .danger{color:var(--v2-danger)}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (max-width: 640px){
    .scroll{padding:6px 16px 32px}
    .ligne{grid-template-columns:minmax(0,1fr) auto}
    .ligne .note{grid-column:1}
  }
</style>
