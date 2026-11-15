<script lang="ts">
  /**
   * Tune Circle rc12 — l'onglet « Découvrir » des maquettes de Levente
   * (15/11/2026), autour de la scène rc8 (`SceneCercleV2`, son globe, ses
   * points et ses étiquettes, passés en `scene`).
   *
   * AUCUNE donnée inventée (règle de Bertrand) :
   * - les compteurs sont ceux de MON cercle — contacts acceptés, pays des
   *   lieux qu'ils ont choisi de montrer, playlists partagées que je vois ;
   *   un compteur inconnu ou nul se cache, et la carte avec s'il n'en reste aucun ;
   * - « Nouveau sur Tune Circle » et « Activité récente » lisent les
   *   notifications du cercle (`notifsCercle`) : arrivées et partages ;
   * - « Messages récents » lit les conversations de la messagerie ;
   * - aucune carte vide : un bloc sans donnée n'est pas affiché.
   * Hors rc12 : « Personnes près de vous », présence en ligne, appels.
   */
  import type { Snippet } from 'svelte';
  import { t, tn } from '../../lib/i18n';
  import { dateCourte } from '../../lib/dates';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import VignettePochettesCercle from './VignettePochettesCercle.svelte';
  import { notifsCercle, type NotifCercle } from '../../lib/circleNotifications';
  import { apercuConversations, demandeConversation, nomConversation } from '../../lib/circleMessagerie';
  import type { ContactCercle } from '../../lib/circle';
  import type { Lieu } from '../../lib/champCercle/scene';
  import type { IdOpaque, PlaylistCercleResume } from '../../lib/circlePlaylists';
  import { compteursCercle, nouveauxDansLeCercle, activiteRecente, conversationsRecentes, initiales } from '../../lib/circleHabillage';
  import type { OngletCircle } from '../../lib/circleOnglets';

  interface Props {
    scene: Snippet;
    contacts: ContactCercle[];
    lieux: Map<number, Lieu>;
    /** `null` : greffon d'avant T5, ni compteur ni carte de playlists. */
    playlists: PlaylistCercleResume[] | null;
    occupe: boolean;
    onOnglet: (o: OngletCircle) => void;
    onInviter: () => void;
    onOuvrirPlaylist: (id: IdOpaque) => void;
    onLirePlaylist: (p: PlaylistCercleResume) => void;
  }
  let { scene, contacts, lieux, playlists, occupe, onOnglet, onInviter, onOuvrirPlaylist, onLirePlaylist }: Props = $props();

  const tr = (k: string, vars: Record<string, string | number> = {}) => {
    let s = $t(k as any);
    for (const [c, v] of Object.entries(vars)) s = s.split(`{${c}}`).join(String(v));
    return s;
  };
  const compteurs = $derived(compteursCercle(contacts, lieux, playlists));
  const chiffres = $derived([
    { cle: 'membres', libelle: 'v2.circle.disc.statMembers', n: compteurs.membres },
    { cle: 'pays', libelle: 'v2.circle.disc.statCountries', n: compteurs.pays },
    { cle: 'playlists', libelle: 'v2.circle.disc.statPlaylists', n: compteurs.playlists },
  ].filter((c): c is { cle: string; libelle: string; n: number } => c.n != null && c.n > 0));
  const nouveaux = $derived(nouveauxDansLeCercle($notifsCercle.liste));
  const activite = $derived(activiteRecente($notifsCercle.liste));
  const recentes = $derived(conversationsRecentes($apercuConversations));
  const apercuPlaylists = $derived((playlists ?? []).slice(0, 6));

  function phraseActivite(n: NotifCercle): string {
    const v = { name: n.actor.name, circle: n.circle_name ?? '', playlist: n.playlist?.name ?? '' };
    if (n.kind === 'playlist_shared') return tr(n.circle_name ? 'v2.circle.notif.playlistShared' : 'v2.circle.notif.playlistSharedNoCircle', v);
    return tr('v2.circle.disc.joined', v);
  }
  const ouvrirConversation = (id: number) => demandeConversation.set({ conversation: id });
</script>

<div class="decouvrir">
  <div class="decouvrir-haut">
    <div class="hero">{@render scene()}</div>
    {#if chiffres.length > 0 || nouveaux.length > 0}
      <aside class="colonne-droite">
        {#if chiffres.length > 0}
          <dl class="carte-dec chiffres-cercle" aria-label={tr('v2.circle.disc.statsTitle')}>
            {#each chiffres as c (c.cle)}
              <div class="chiffre chiffre-{c.cle}"><dt>{tr(c.libelle)}</dt><dd>{c.n}</dd></div>
            {/each}
          </dl>
        {/if}
        {#if nouveaux.length > 0}
          <section class="carte-dec nouveaux" aria-labelledby="circle-dec-nouveaux">
            <h2 id="circle-dec-nouveaux">{tr('v2.circle.disc.newTitle')}</h2>
            <ul>
              {#each nouveaux as n (n.id)}
                <li class="rang"><span class="avatar" aria-hidden="true">{initiales(n.actor.name)}</span>
                  <span class="texte-rang"><strong class="coupe" use:bulleTexte>{n.actor.name}</strong><span class="note coupe" use:bulleTexte>{tr('v2.circle.disc.joinedShort')}</span></span>
                  <time class="note" datetime={n.at}>{$dateCourte(n.at)}</time></li>
              {/each}
            </ul>
          </section>
        {/if}
      </aside>
    {/if}
  </div>

  <div class="decouvrir-milieu">
    {#if recentes.length > 0}
      <section class="carte-dec messages-recents" aria-labelledby="circle-dec-messages">
        <div class="tete-carte"><h2 id="circle-dec-messages">{tr('v2.circle.tab.messages')}</h2>
          <button type="button" class="voir-tout" onclick={() => onOnglet('messages')}>{tr('v2.circle.disc.viewAll')} →</button></div>
        <ul>
          {#each recentes as c (c.id)}
            <li><button type="button" class="rang rang-bouton" onclick={() => ouvrirConversation(c.id)}>
              {#if c.unread_count > 0}<span class="point-non-lu" aria-label={$tn('v2.circle.tab.unread', c.unread_count)}></span>{/if}
              <span class="avatar" aria-hidden="true">{c.kind === 'direct' ? initiales(c.contact.name) : '#'}</span>
              <span class="texte-rang"><strong class="coupe" use:bulleTexte>{nomConversation(c)}</strong>
                <span class="note coupe" use:bulleTexte>{c.last_message?.body ?? c.last_message?.card?.title ?? ''}</span></span>
              {#if c.last_message?.created_at}<time class="note" datetime={c.last_message.created_at}>{$dateCourte(c.last_message.created_at)}</time>{/if}
            </button></li>
          {/each}
        </ul>
      </section>
    {/if}
    <section class="carte-dec ton-cercle" aria-labelledby="circle-dec-cercle">
      <div class="tete-carte"><h2 id="circle-dec-cercle">{tr('v2.circle.disc.yourCircle')}</h2>
        {#if contacts.length > 0}<button type="button" class="voir-tout" onclick={() => onOnglet('cercle')}>{tr('v2.circle.disc.viewAll')} →</button>{/if}</div>
      <ul class="rangee-membres">
        {#each contacts.slice(0, 6) as c (c.user_id)}
          {@const lieu = lieux.get(c.user_id)}
          <li class="membre"><span class="avatar grand" aria-hidden="true">{initiales(c.name)}</span>
            <strong class="coupe" use:bulleTexte>{c.name}</strong>
            {#if lieu}<span class="note coupe" use:bulleTexte>{lieu.label}{#if lieu.country_code}, {lieu.country_code}{/if}</span>{/if}</li>
        {/each}
        <li class="membre"><button type="button" class="ajouter" onclick={onInviter}><span class="avatar grand plus" aria-hidden="true">+</span>
          <span>{tr('v2.circle.addMember')}</span></button></li>
      </ul>
    </section>
  </div>

  {#if apercuPlaylists.length > 0}
    <section class="carte-dec playlists-apercu" aria-labelledby="circle-dec-playlists">
      <div class="tete-carte"><h2 id="circle-dec-playlists">{tr('v2.circle.tab.playlists')}</h2>
        <button type="button" class="voir-tout" onclick={() => onOnglet('playlists')}>{tr('v2.circle.disc.viewAll')} →</button></div>
      <ul class="bande-playlists">
        {#each apercuPlaylists as p (String(p.id))}
          <li class="mini-playlist">
            <div class="vignette"><span aria-hidden="true">♪</span>
              <VignettePochettesCercle id={p.id} version={p.version} count={p.count} />
              <button type="button" class="lire" disabled={occupe || p.count === 0}
                aria-label={tr('v2.circle.pl.playNamed', { name: p.name })} onclick={() => onLirePlaylist(p)}>
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></button></div>
            <button type="button" class="ouvrir" onclick={() => onOuvrirPlaylist(p.id)}><strong class="coupe" use:bulleTexte>{p.name}</strong></button>
            <span class="note coupe" use:bulleTexte>{#if !p.mine && p.owner?.name}{p.owner.name}{' · '}{/if}{$tn('v2.common.trackCountN', p.count)}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if activite.length > 0}
    <section class="carte-dec activite" aria-labelledby="circle-dec-activite">
      <h2 id="circle-dec-activite">{tr('v2.circle.disc.activity')}</h2>
      <ul>
        {#each activite as n (n.id)}
          <li class="rang"><span class="avatar icone" aria-hidden="true">{n.kind === 'playlist_shared' ? '♫' : '+'}</span>
            <span class="texte-rang" use:bulleTexte>{phraseActivite(n)}</span>
            <time class="note" datetime={n.at}>{$dateCourte(n.at)}</time></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .decouvrir{display:flex; flex-direction:column; gap:18px; min-width:0}
  .decouvrir-haut{display:grid; grid-template-columns:minmax(0, 1fr) 300px; gap:18px; align-items:start}
  .decouvrir-haut:has(> .hero:only-child){grid-template-columns:minmax(0, 1fr)}
  .hero{min-width:0}
  .colonne-droite{display:flex; flex-direction:column; gap:18px; min-width:0}
  .decouvrir-milieu{display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:18px}
  .carte-dec{padding:16px 18px; border:1px solid var(--v2-line); border-radius:var(--v2-r-card); background:var(--v2-surface); min-width:0}
  /* Le bouton « Remonter en haut » (60 px, en bas à droite) masquait la fin des dates de la dernière carte :
     place pour le bouton, ajoutée à la marge de la carte (ce n'est pas la gouttière de la grappe). */
  .carte-dec.activite{padding-right:calc(18px + 60px)}
  .carte-dec h2{font-family:var(--font-display, Georgia, serif); font-weight:600; font-size:calc(17px * var(--v2-txt-echelle, 1)); margin:0 0 10px}
  .tete-carte{display:flex; align-items:baseline; justify-content:space-between; gap:10px}
  .voir-tout{border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); white-space:nowrap}
  .voir-tout:hover{color:var(--v2-txt)}
  ul{list-style:none; margin:0; padding:0}
  .chiffres-cercle{display:flex; justify-content:space-around; gap:12px; margin:0}
  .chiffre{display:flex; flex-direction:column-reverse; align-items:center; gap:2px; min-width:0}
  .chiffre dd{margin:0; font-size:calc(24px * var(--v2-txt-echelle, 1)); font-weight:700}
  .chiffre dt{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); text-align:center}
  .rang{display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--v2-line); min-width:0}
  li:last-child > .rang, li.rang:last-child{border-bottom:0}
  .rang-bouton{width:100%; border:0; border-bottom:1px solid var(--v2-line); background:transparent; color:var(--v2-txt); cursor:pointer; text-align:left;
    font:inherit; border-radius:0}
  .rang-bouton:hover{background:var(--v2-hover)}
  .texte-rang{flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; font-size:calc(13px * var(--v2-txt-echelle, 1)); overflow:hidden}
  .coupe{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .note{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  time{flex:none; white-space:nowrap}
  .point-non-lu{flex:none; width:7px; height:7px; border-radius:50%; background:var(--v2-acc1)}
  .avatar{flex:none; width:36px; height:36px; border-radius:50%; display:grid; place-items:center; background:var(--v2-surface2);
    border:1px solid var(--v2-line2); font-weight:700; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .avatar.grand{width:60px; height:60px; font-size:calc(18px * var(--v2-txt-echelle, 1));
    background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2)); color:var(--v2-on-acc); border:2px solid var(--v2-acc-tint)}
  .avatar.plus{background:transparent; color:var(--v2-txt2); border:1px dashed var(--v2-line2); font-weight:300; font-size:calc(26px * var(--v2-txt-echelle, 1))}
  .avatar.icone{color:var(--v2-acc-tint)}
  /* Passe à la ligne plutôt que de couper le dernier membre (vérifié sur le .18). */
  .rangee-membres{display:flex; flex-wrap:wrap; gap:16px; padding-bottom:4px}
  .membre{flex:none; width:84px; display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; font-size:calc(12px * var(--v2-txt-echelle, 1))}
  .membre .coupe{max-width:100%}
  .ajouter{display:flex; flex-direction:column; align-items:center; gap:4px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .ajouter:hover{color:var(--v2-txt)}
  .bande-playlists{display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:16px}
  .mini-playlist{display:flex; flex-direction:column; gap:3px; min-width:0}
  .vignette{position:relative; aspect-ratio:1; border-radius:10px; display:grid; place-items:center; margin-bottom:6px; border:1px solid var(--v2-line);
    background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2)); color:var(--v2-on-acc); font-size:calc(30px * var(--v2-txt-echelle, 1))}
  .vignette > span{opacity:.55}
  .lire{position:absolute; right:8px; bottom:8px; width:32px; height:32px; border-radius:50%; border:1px solid var(--v2-line2); display:grid; place-items:center;
    background:var(--v2-scrim); color:var(--v2-txt); cursor:pointer; opacity:0; transition:opacity .15s}
  .mini-playlist:hover .lire,.lire:focus-visible{opacity:1}
  .lire:disabled{cursor:not-allowed}
  @media (hover: none){ .lire{opacity:1} }
  .ouvrir{border:0; background:transparent; padding:0; text-align:left; color:var(--v2-txt); cursor:pointer; min-width:0; font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .ouvrir strong{display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .voir-tout:focus-visible,.rang-bouton:focus-visible,.ajouter:focus-visible,.lire:focus-visible,.ouvrir:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  /* La colonne de droite ne prend sa place qu'en grand écran : en dessous, le globe garde toute
     la largeur (ses noms de membres se serrent vite quand il rétrécit). */
  @media (max-width: 1400px){
    .decouvrir-haut{grid-template-columns:minmax(0, 1fr)}
    .colonne-droite{display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr))}
  }
  @media (max-width: 640px){
    .decouvrir-milieu{grid-template-columns:minmax(0, 1fr)}
    .bande-playlists{grid-template-columns:repeat(2, minmax(0, 1fr))}
  }
</style>
