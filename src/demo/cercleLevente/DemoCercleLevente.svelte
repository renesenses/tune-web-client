<script lang="ts">
  /**
   * DÉMO — les quatre onglets de Tune Circle d'après les maquettes de Levente
   * du 20/11/2026, DANS le système de design existant du client (NE PAS
   * FUSIONNER).
   *
   * Règles suivies :
   * - jetons `--v2-*` et `--font-display` de `src/styles/` uniquement ; aucune
   *   police, couleur ou bibliothèque nouvelle ;
   * - titres en `--font-display` (Cormorant Garamond) et texte en `--v2-sans`
   *   (Inter), comme le reste de Tune Circle (#3277) ;
   * - pictogrammes au trait du client, en SVG en ligne (`Icone.svelte`) ;
   * - en-tête, onglets, puces, boutons : la géométrie de `CircleV2`,
   *   `PlaylistsGrilleCercleV2` et `tune-v2.css` ;
   * - seules des données que le greffon rend : pas de photo, de présence,
   *   d'appel, d'abonnés, d'écoutes, de « personnes près de vous ».
   * Données : `donnees.ts`, FICTIVES. Aucun appel serveur, aucun droit touché.
   */
  import '../../styles/tune-v2.css';
  import GlobeLueur from './GlobeLueur.svelte';
  import Icone from './Icone.svelte';
  import { MOI, MEMBRES, CERCLES, PLAYLISTS, CONVERSATIONS, PARTAGES_FIL, NOTIFS, nomDe, type ConversationDemo, type PlaylistDemo } from './donnees';

  type Onglet = 'decouvrir' | 'messages' | 'playlists' | 'cercle';
  let { ongletInitial = 'decouvrir' }: { ongletInitial?: Onglet } = $props();
  // svelte-ignore state_referenced_locally
  let onglet = $state<Onglet>(ongletInitial);

  const ONGLETS: { id: Onglet; libelle: string; icone: 'globe' | 'message' | 'playlist' | 'personnes' }[] = [
    { id: 'decouvrir', libelle: 'Discover', icone: 'globe' },
    { id: 'messages', libelle: 'Messages', icone: 'message' },
    { id: 'playlists', libelle: 'Shared playlists', icone: 'playlist' },
    { id: 'cercle', libelle: 'My circle', icone: 'personnes' },
  ];
  function clavier(ev: KeyboardEvent) {
    const i = ONGLETS.findIndex((o) => o.id === onglet);
    const n = ONGLETS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i - 1 + n) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    onglet = ONGLETS[j].id;
    document.getElementById(`demo-onglet-${onglet}`)?.focus();
  }

  const initiales = (n: string) => n.split(/\s+/).map((m) => m[0] ?? '').join('').slice(0, 2).toUpperCase();
  const heure = (iso: string) => iso.slice(11, 16);
  const jour = (iso: string) => {
    const d = new Date(iso);
    return iso.startsWith('2026-11-20') ? heure(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
  const membre = (id: number) => MEMBRES.find((m) => m.id === id);
  const teinte = (id: number) => `t${(id % 4) + 1}`;

  const nonLus = CONVERSATIONS.reduce((n, c) => n + c.nonLus, 0);
  const pays = new Set(MEMBRES.map((m) => m.pays)).size;
  const morceaux = PLAYLISTS.reduce((n, p) => n + p.morceaux, 0);
  const nomConv = (c: ConversationDemo) => (c.genre === 'circle' ? `# ${nomDe(c.avec)}` : nomDe(c.avec));
  const dernier = (c: ConversationDemo) => c.messages[c.messages.length - 1];
  const extrait = (c: ConversationDemo) => { const m = dernier(c); return m.texte ?? `Shared “${m.carte?.titre}”`; };
  const phrase = (n: (typeof NOTIFS)[number]) => n.genre === 'playlist_shared'
    ? `shared ${PLAYLISTS.find((p) => p.id === n.playlist)?.nom ?? 'a playlist'} in ${n.cercle}`
    : 'joined your circle';

  // ── Messages ──────────────────────────────────────────────────────────────
  type Filtre = 'all' | 'direct' | 'circle';
  let filtreConv = $state<Filtre>('all');
  let convOuverte = $state(CONVERSATIONS[0].id);
  const convVisibles = $derived(CONVERSATIONS.filter((c) => filtreConv === 'all' || c.genre === filtreConv));
  const fil = $derived(CONVERSATIONS.find((c) => c.id === convOuverte)!);

  // ── Playlists ─────────────────────────────────────────────────────────────
  type FiltrePl = 'tout' | 'nouveautes' | 'amis' | 'miennes';
  let filtrePl = $state<FiltrePl>('tout');
  let affichage = $state<'grille' | 'liste'>('grille');
  const plVisibles = $derived(PLAYLISTS.filter((p) => filtrePl === 'tout' || (filtrePl === 'miennes' ? p.mine : filtrePl === 'amis' ? !p.mine : p.maj >= '2026-11-16')));
  const miennes = PLAYLISTS.filter((p) => p.mine);
  const proprietaire = (p: PlaylistDemo) => (p.mine ? 'You' : nomDe(p.proprietaire));

  // ── Mon cercle ────────────────────────────────────────────────────────────
  let filtreCercle = $state<number | 'tous'>('tous');
  let recherche = $state('');
  const contactsVisibles = $derived(MEMBRES.filter((m) =>
    (filtreCercle === 'tous' || CERCLES.find((c) => c.id === filtreCercle)?.membres.includes(m.id))
    && m.nom.toLowerCase().includes(recherche.trim().toLowerCase())));
  const cerclesDe = (id: number) => CERCLES.filter((c) => c.membres.includes(id)).map((c) => c.nom);
  const partageesPar = (id: number) => PLAYLISTS.filter((p) => p.proprietaire === id).length;
</script>

<div class="tune-v2 demo-cercle">
  <header class="v2-top tete-circle">
    <div class="v2-titres">
      <h1 class="titre-circle">Tune Circle</h1>
      <p class="sous-titre">People. Music. A more connected world.</p>
    </div>
    <button type="button" class="inviter-entete"><Icone nom="inviter" />Invite people</button>
  </header>

  <div class="onglets-circle" role="tablist" aria-label="Tune Circle" tabindex="-1" onkeydown={clavier}>
    {#each ONGLETS as o (o.id)}
      <button type="button" role="tab" class="onglet" id="demo-onglet-{o.id}" aria-controls="demo-panneau-{o.id}"
        aria-selected={onglet === o.id} tabindex={onglet === o.id ? 0 : -1} onclick={() => (onglet = o.id)}>
        <Icone nom={o.icone} />
        <span>{o.libelle}</span>
        {#if o.id === 'messages' && nonLus > 0}<span class="pastille-onglet" aria-label="{nonLus} unread">{nonLus}</span>{/if}
      </button>
    {/each}
  </div>

  <main class="corps">
    <!-- ═════════════════════════ DÉCOUVRIR ═════════════════════════ -->
    <section id="demo-panneau-decouvrir" role="tabpanel" aria-labelledby="demo-onglet-decouvrir" hidden={onglet !== 'decouvrir'} class="panneau">
      <div class="hero-decouvrir">
        <div class="hero-texte">
          <h2 class="titre-hero">A global community<br />for music lovers.</h2>
          <ul class="capacites">
            <li><button type="button" class="capacite" onclick={() => (onglet = 'messages')}><span class="rond"><Icone nom="message" taille={18} /></span>
              <span><strong>Message</strong><span class="note">Chat with people in your circle</span></span></button></li>
            <li><button type="button" class="capacite" onclick={() => (onglet = 'playlists')}><span class="rond"><Icone nom="note" taille={18} /></span>
              <span><strong>Share playlists</strong><span class="note">Exchange and discover new music</span></span></button></li>
            <li><button type="button" class="capacite" onclick={() => (onglet = 'cercle')}><span class="rond"><Icone nom="personnes" taille={18} /></span>
              <span><strong>Discover people</strong><span class="note">See who is in your circle, and where</span></span></button></li>
          </ul>
        </div>
        <div class="hero-globe">
          <GlobeLueur moi={MOI} membres={MEMBRES} etiquetes={[15]} libelle="Where your circle listens" />
        </div>
        <aside class="hero-droite">
          <dl class="carte chiffres">
            <div><dt><Icone nom="personnes" taille={20} /><span>Members</span></dt><dd>{MEMBRES.length}</dd></div>
            <div><dt><Icone nom="globe" taille={20} /><span>Countries</span></dt><dd>{pays}</dd></div>
            <div><dt><Icone nom="note" taille={20} /><span>Shared playlists</span></dt><dd>{PLAYLISTS.length}</dd></div>
          </dl>
          <section class="carte" aria-labelledby="demo-nouveau">
            <div class="tete-carte"><h3 id="demo-nouveau">New in your circle</h3></div>
            <ul class="rangs">
              {#each NOTIFS as n (n.id)}
                <li class="rang"><span class="avatar" aria-hidden="true">{initiales(nomDe(n.acteur))}</span>
                  <span class="texte-rang"><strong class="coupe">{nomDe(n.acteur)}</strong><span class="note coupe">{n.genre === 'playlist_shared' ? `Shared ${PLAYLISTS.find((p) => p.id === n.playlist)?.nom}` : 'Joined your circle'}</span></span>
                  <time class="note">{jour(n.le)}</time></li>
              {/each}
            </ul>
          </section>
        </aside>
      </div>

      <div class="deux-colonnes">
        <section class="carte" aria-labelledby="demo-dec-messages">
          <div class="tete-carte"><h3 id="demo-dec-messages">Messages <span class="pastille-onglet">{nonLus}</span></h3>
            <button type="button" class="voir-tout" onclick={() => (onglet = 'messages')}>View all →</button></div>
          <ul class="rangs">
            {#each CONVERSATIONS.slice(0, 3) as c (c.id)}
              <li><button type="button" class="rang rang-bouton" class:non-lu={c.nonLus > 0} onclick={() => { convOuverte = c.id; onglet = 'messages'; }}>
                <span class="point" aria-hidden="true"></span>
                <span class="avatar" aria-hidden="true">{#if c.genre === 'circle'}<Icone nom="personnes" />{:else}{initiales(nomDe(c.avec))}{/if}</span>
                <span class="texte-rang"><strong class="coupe">{nomConv(c)}{#if c.nonLus > 0}<span class="sr-only"> (unread)</span>{/if}</strong><span class="note coupe">{extrait(c)}</span></span>
                <time class="note">{jour(dernier(c).le)}</time></button></li>
            {/each}
          </ul>
        </section>
        <section class="carte" aria-labelledby="demo-dec-cercle">
          <div class="tete-carte"><h3 id="demo-dec-cercle">Your circle</h3>
            <button type="button" class="voir-tout" onclick={() => (onglet = 'cercle')}>View all →</button></div>
          <ul class="rangee-membres">
            {#each MEMBRES.slice(0, 5) as m (m.id)}
              <li class="membre"><span class="avatar grand" aria-hidden="true">{initiales(m.nom)}</span>
                <strong class="coupe">{m.nom.split(' ')[0]}</strong><span class="note coupe">{m.ville}, {m.pays}</span></li>
            {/each}
            <li class="membre"><button type="button" class="ajouter"><span class="avatar grand plus" aria-hidden="true"><Icone nom="plus" taille={22} /></span><span>Add member</span></button></li>
          </ul>
        </section>
      </div>

      <section class="carte" aria-labelledby="demo-dec-playlists">
        <div class="tete-carte"><h3 id="demo-dec-playlists"><Icone nom="note" taille={18} /> Shared playlists</h3>
          <button type="button" class="voir-tout" onclick={() => (onglet = 'playlists')}>View all →</button></div>
        <ul class="bande">
          {#each PLAYLISTS.slice(0, 6) as p (p.id)}
            <li class="mini">
              <div class="vignette teinte-{teinte(p.id)}"><span class="note-vignette"><Icone nom="note" taille={34} /></span>
                <button type="button" class="lire" aria-label="Play {p.nom}"><Icone nom="lecture" taille={14} /></button></div>
              <div class="ligne-titre"><strong class="coupe">{p.nom}</strong><button type="button" class="options" aria-label="More options for {p.nom}"><Icone nom="plus-options" /></button></div>
              <span class="note coupe">{proprietaire(p)}</span><span class="note">{p.morceaux} tracks</span>
            </li>
          {/each}
        </ul>
      </section>

      <section class="carte" aria-labelledby="demo-dec-activite">
        <div class="tete-carte"><h3 id="demo-dec-activite">Recent activity</h3></div>
        <ul class="rangs">
          {#each NOTIFS as n (n.id)}
            <li class="rang"><span class="avatar icone" aria-hidden="true"><Icone nom={n.genre === 'playlist_shared' ? 'note' : 'personnes'} /></span>
              <span class="texte-rang"><span class="coupe"><strong>{nomDe(n.acteur)}</strong> {phrase(n)}</span></span>
              <time class="note">{jour(n.le)}</time></li>
          {/each}
        </ul>
      </section>
    </section>

    <!-- ═════════════════════════ MESSAGES ═════════════════════════ -->
    <section id="demo-panneau-messages" role="tabpanel" aria-labelledby="demo-onglet-messages" hidden={onglet !== 'messages'} class="panneau">
      <div class="messagerie">
        <nav class="carte liste-conv" aria-label="Conversations">
          <div class="tete-carte"><h2 class="titre-carte">Messages <span class="etiquette-non-lus">{nonLus} unread</span></h2>
            <button type="button" class="bouton-rond" aria-label="New message"><Icone nom="ecrire" /></button></div>
          <label class="v2-rech champ-conv"><Icone nom="recherche" /><input type="search" placeholder="Search messages…" aria-label="Search messages" /></label>
          <div class="puces" role="group" aria-label="Filter conversations">
            {#each [['all', 'All'], ['direct', 'Direct'], ['circle', 'Groups']] as [f, l] (f)}
              <button type="button" class="puce" aria-pressed={filtreConv === f} onclick={() => (filtreConv = f as Filtre)}>{l}</button>
            {/each}
          </div>
          <ul class="conversations">
            {#each convVisibles as c (c.id)}
              <li><button type="button" class="conversation" class:choisie={c.id === convOuverte} class:non-lu={c.nonLus > 0}
                aria-current={c.id === convOuverte ? 'true' : undefined} onclick={() => (convOuverte = c.id)}>
                <span class="avatar moyen" aria-hidden="true">{#if c.genre === 'circle'}<Icone nom="personnes" taille={20} />{:else}{initiales(nomDe(c.avec))}{/if}</span>
                <span class="texte-rang"><strong class="coupe">{nomConv(c)}</strong><span class="note coupe">{extrait(c)}</span></span>
                <span class="meta-conv"><time class="note">{jour(dernier(c).le)}</time>
                  {#if c.nonLus > 0}<span class="pastille-onglet" aria-label="{c.nonLus} unread">{c.nonLus}</span>{/if}</span>
              </button></li>
            {/each}
          </ul>
        </nav>

        <section class="carte fil" aria-label="Conversation with {nomConv(fil)}">
          <header class="tete-fil">
            <span class="avatar moyen" aria-hidden="true">{#if fil.genre === 'circle'}<Icone nom="personnes" taille={20} />{:else}{initiales(nomDe(fil.avec))}{/if}</span>
            <span class="texte-rang"><strong>{nomConv(fil)}</strong>
              <span class="note">{fil.genre === 'circle' ? `${CERCLES.find((x) => x.id === fil.avec)?.membres.length ?? 0} members` : `${membre(fil.avec)?.ville}, ${membre(fil.avec)?.pays}`}</span></span>
          </header>
          <div class="defilement">
            <p class="jour-fil"><span>Today</span></p>
            <ul class="messages">
              {#each fil.messages as m, i (m.id)}
                {@const finDeSerie = fil.messages[i + 1]?.de !== m.de}
                <li class="message" class:mon-message={m.de === MOI.id}>
                  {#if m.de !== MOI.id}<span class="avatar petit" class:invisible={!finDeSerie} aria-hidden="true">{initiales(nomDe(m.de))}</span>{/if}
                  <div class="bulle">
                    {#if m.carte}
                      <div class="carte-musique">
                        <span class="pochette teinte-t2" aria-hidden="true"><Icone nom="note" taille={22} /></span>
                        <span class="texte-rang"><strong>{m.carte.titre}</strong><span class="note">{m.carte.artiste}</span><span class="note">Album</span></span>
                        <button type="button" class="lecture-ronde" aria-label="Play {m.carte.titre}"><Icone nom="lecture" taille={16} /></button>
                      </div>
                    {:else}{m.texte}{/if}
                    <time class="heure">{heure(m.le)}</time>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
          <form class="composeur" onsubmit={(e) => e.preventDefault()}>
            <button type="button" class="bouton-rond" aria-label="Share music"><Icone nom="plus" /></button>
            <input class="saisie" type="text" placeholder="Type a message…" aria-label="Message" />
            <button type="submit" class="envoi" aria-label="Send"><Icone nom="envoyer" taille={18} /></button>
          </form>
        </section>
      </div>

      <section class="carte" aria-labelledby="demo-partages-fil">
        <div class="tete-carte"><h3 id="demo-partages-fil"><Icone nom="note" taille={18} /> Shared in this conversation</h3>
          <button type="button" class="voir-tout">View all →</button></div>
        <ul class="bande">
          {#each PARTAGES_FIL as p, i (p.titre)}
            <li class="mini"><div class="vignette teinte-t{(i % 4) + 1}"><span class="note-vignette"><Icone nom="note" taille={34} /></span></div>
              <strong class="coupe">{p.titre}</strong><span class="note coupe">{p.artiste}</span></li>
          {/each}
        </ul>
      </section>
    </section>

    <!-- ═════════════════════════ PLAYLISTS ═════════════════════════ -->
    <section id="demo-panneau-playlists" role="tabpanel" aria-labelledby="demo-onglet-playlists" hidden={onglet !== 'playlists'} class="panneau">
      <div class="bandeau-playlists">
        <div class="bandeau-texte">
          <h2 class="titre-hero">Shared playlists</h2>
          <p class="note">Playlists shared in your circles. Play them, add to them, and share your own.</p>
          <div class="actions-bandeau">
            <button type="button" class="v2-btn primaire"><Icone nom="plus" />Share a playlist</button>
            <button type="button" class="v2-btn">Create playlist</button>
          </div>
        </div>
        <dl class="chiffres sans-cadre">
          <div><dt><Icone nom="note" taille={20} /><span>Playlists</span></dt><dd>{PLAYLISTS.length}</dd></div>
          <div><dt><Icone nom="playlist" taille={20} /><span>Tracks</span></dt><dd>{morceaux}</dd></div>
          <div><dt><Icone nom="cercle" taille={20} /><span>Circles</span></dt><dd>{CERCLES.length}</dd></div>
        </dl>
      </div>

      <div class="barre">
        <div class="puces" role="group" aria-label="Filter playlists">
          {#each [['tout', 'All'], ['nouveautes', 'New'], ['amis', 'From friends'], ['miennes', 'Mine']] as [f, l] (f)}
            <button type="button" class="puce" aria-pressed={filtrePl === f} onclick={() => (filtrePl = f as FiltrePl)}>{l}</button>
          {/each}
        </div>
        <div class="reglages">
          <select class="choix-tri" aria-label="Sort"><option>Most recent</option><option>Name</option><option>Tracks</option></select>
          <div class="bascule" role="group" aria-label="Display">
            <button type="button" aria-pressed={affichage === 'grille'} aria-label="Grid" onclick={() => (affichage = 'grille')}><Icone nom="grille" /></button>
            <button type="button" aria-pressed={affichage === 'liste'} aria-label="List" onclick={() => (affichage = 'liste')}><Icone nom="liste" /></button>
          </div>
        </div>
      </div>

      <ul class="grille-playlists" class:en-liste={affichage === 'liste'}>
        {#each plVisibles as p (p.id)}
          <li class="carte-playlist">
            <div class="vignette teinte-{teinte(p.id)}"><span class="note-vignette"><Icone nom="note" taille={40} /></span>
              <button type="button" class="lire visible" aria-label="Play {p.nom}"><Icone nom="lecture" taille={16} /></button></div>
            <div class="infos">
              <div class="ligne-titre"><strong class="coupe">{p.nom}</strong><button type="button" class="options" aria-label="More options for {p.nom}"><Icone nom="plus-options" /></button></div>
              <span class="note coupe">{p.morceaux} tracks · {nomDe(p.cercle)}</span>
              <span class="proprio"><span class="avatar mini" aria-hidden="true">{initiales(proprietaire(p) === 'You' ? MOI.nom : proprietaire(p))}</span><span class="note coupe">{proprietaire(p)}</span></span>
            </div>
          </li>
        {/each}
      </ul>

      <div class="deux-colonnes">
        <section class="carte" aria-labelledby="demo-pl-miennes">
          <div class="tete-carte"><h3 id="demo-pl-miennes"><Icone nom="note" taille={18} /> Your playlists</h3><button type="button" class="voir-tout">View all →</button></div>
          <ul class="rangs">
            {#each miennes as p (p.id)}
              <li class="rang"><span class="vignette mini-vignette teinte-{teinte(p.id)}" aria-hidden="true"><Icone nom="note" taille={18} /></span>
                <span class="texte-rang"><strong class="coupe">{p.nom}</strong><span class="note">{p.morceaux} tracks · {nomDe(p.cercle)}</span></span>
                <button type="button" class="lecture-ronde" aria-label="Play {p.nom}"><Icone nom="lecture" taille={14} /></button>
                <button type="button" class="options" aria-label="More options for {p.nom}"><Icone nom="plus-options" /></button></li>
            {/each}
          </ul>
        </section>
        <section class="carte" aria-labelledby="demo-pl-cercles">
          <div class="tete-carte"><h3 id="demo-pl-cercles"><Icone nom="cercle" taille={18} /> Your circles</h3><button type="button" class="voir-tout" onclick={() => (onglet = 'cercle')}>View all →</button></div>
          <ul class="rangs">
            {#each CERCLES as c (c.id)}
              <li class="rang"><span class="avatar icone" aria-hidden="true"><Icone nom="personnes" /></span>
                <span class="texte-rang"><strong class="coupe">{c.nom}</strong><span class="note">{c.membres.length} members · {PLAYLISTS.filter((p) => p.cercle === c.id).length} playlists</span></span>
                <button type="button" class="v2-btn">New playlist</button></li>
            {/each}
          </ul>
        </section>
      </div>
    </section>

    <!-- ═════════════════════════ MON CERCLE ═════════════════════════ -->
    <section id="demo-panneau-cercle" role="tabpanel" aria-labelledby="demo-onglet-cercle" hidden={onglet !== 'cercle'} class="panneau">
      <div class="carte profil">
        <div class="identite">
          <span class="avatar geant" aria-hidden="true">{initiales(MOI.nom)}</span>
          <div class="texte-profil">
            <h2 class="titre-hero">My circle</h2>
            <p class="note">The people you share music with. Only you see your circles; each contact sees only what you share with them.</p>
          </div>
          <button type="button" class="v2-btn"><Icone nom="lieu" />Manage my visibility</button>
        </div>
        <dl class="chiffres quatre">
          <div><dt><Icone nom="personnes" taille={20} /><span>Contacts</span></dt><dd>{MEMBRES.length}</dd></div>
          <div><dt><Icone nom="cercle" taille={20} /><span>Circles</span></dt><dd>{CERCLES.length}</dd></div>
          <div><dt><Icone nom="note" taille={20} /><span>Shared playlists</span></dt><dd>{PLAYLISTS.length}</dd></div>
          <div><dt><Icone nom="globe" taille={20} /><span>Countries</span></dt><dd>{pays}</dd></div>
        </dl>
      </div>

      <div class="barre">
        <div class="puces" role="group" aria-label="Filter contacts">
          <button type="button" class="puce" aria-pressed={filtreCercle === 'tous'} onclick={() => (filtreCercle = 'tous')}>All contacts</button>
          {#each CERCLES as c (c.id)}<button type="button" class="puce" aria-pressed={filtreCercle === c.id} onclick={() => (filtreCercle = c.id)}>{c.nom}</button>{/each}
        </div>
        <label class="v2-rech"><Icone nom="recherche" /><input type="search" placeholder="Search in your circle…" aria-label="Search in your circle" bind:value={recherche} /></label>
      </div>

      <ul class="connexions">
        {#each contactsVisibles as m (m.id)}
          <li class="connexion">
            <span class="avatar moyen-plus" aria-hidden="true">{initiales(m.nom)}</span>
            <span class="texte-rang"><strong class="coupe">{m.nom}</strong><span class="note">{m.ville}, {m.pays}</span></span>
            <span class="note resume">{partageesPar(m.id)} shared playlist{partageesPar(m.id) === 1 ? '' : 's'} · {cerclesDe(m.id).join(', ') || 'No circle yet'}</span>
            <button type="button" class="bouton-rond" aria-label="Message {m.nom}"><Icone nom="message" /></button>
            <button type="button" class="bouton-rond" aria-label="More options for {m.nom}"><Icone nom="plus-options" /></button>
          </li>
        {:else}
          <li class="note">No contact matches “{recherche}”.</li>
        {/each}
      </ul>

      <div class="deux-colonnes">
        <section class="carte" aria-labelledby="demo-mc-cercles">
          <div class="tete-carte"><h3 id="demo-mc-cercles"><Icone nom="personnes" taille={18} /> My circles</h3><button type="button" class="voir-tout">View all →</button></div>
          <ul class="rangs">
            {#each CERCLES as c (c.id)}
              <li class="rang"><span class="vignette mini-vignette teinte-{teinte(c.id)}" aria-hidden="true"><Icone nom="personnes" taille={18} /></span>
                <span class="texte-rang"><strong class="coupe">{c.nom}</strong><span class="note">{c.membres.length} members</span></span>
                <button type="button" class="options" aria-label="More options for {c.nom}"><Icone nom="plus-options" /></button></li>
            {/each}
          </ul>
        </section>
        <section class="carte" aria-labelledby="demo-mc-activite">
          <div class="tete-carte"><h3 id="demo-mc-activite">Recent activity</h3><button type="button" class="voir-tout">View all →</button></div>
          <ul class="rangs">
            {#each NOTIFS as n (n.id)}
              <li class="rang"><span class="avatar icone" aria-hidden="true"><Icone nom={n.genre === 'playlist_shared' ? 'note' : 'personnes'} /></span>
                <span class="texte-rang"><span class="coupe"><strong>{nomDe(n.acteur)}</strong> {phrase(n)}</span></span>
                <time class="note">{jour(n.le)}</time></li>
            {/each}
          </ul>
        </section>
      </div>
    </section>
  </main>
</div>

<style>
  /* ── Coquille de la démo : le fond et la police du client ─────────────── */
  .demo-cercle{min-height:100vh; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans); padding-bottom:40px}
  .demo-cercle :global(*){box-sizing:border-box}
  ul{list-style:none; margin:0; padding:0}
  .corps{padding:20px 30px 0; display:flex; flex-direction:column}
  .panneau{display:flex; flex-direction:column; gap:18px}
  .panneau[hidden]{display:none}

  /* ── En-tête et onglets : ceux de CircleV2 (rc12), à l'identique ─────── */
  .tete-circle{display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; padding-right:30px}
  .titre-circle{font-family:var(--font-display, Georgia, serif); font-weight:600; letter-spacing:-.01em;
    font-size:calc(34px * var(--v2-txt-echelle, 1)); line-height:1.1; margin:0}
  .sous-titre{margin:4px 0 0; color:var(--v2-txt2); font-family:var(--font-display, Georgia, serif); font-size:calc(15px * var(--v2-txt-echelle, 1))}
  .inviter-entete{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 16px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-acc1); background:transparent; color:var(--v2-acc-tint); cursor:pointer; font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .inviter-entete:hover{background:var(--v2-acc-soft)}
  .onglets-circle{display:flex; gap:4px; padding:0 30px; border-bottom:1px solid var(--v2-line); overflow-x:auto; scrollbar-width:none}
  .onglet{display:inline-flex; align-items:center; gap:8px; padding:12px 16px; border:0; border-bottom:2px solid transparent; background:transparent;
    color:var(--v2-txt2); cursor:pointer; white-space:nowrap; flex:none; margin-bottom:-1px; font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .onglet:hover{color:var(--v2-txt)}
  .onglet[aria-selected="true"]{color:var(--v2-txt); border-bottom-color:var(--v2-acc1)}
  .pastille-onglet{min-width:18px; height:18px; padding:0 5px; border-radius:9px; display:inline-grid; place-items:center;
    background:var(--v2-acc1); color:var(--v2-on-acc); font:700 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans)}

  /* ── Cartes, titres, rangs : ceux de DecouvrirCercleV2 ─────────────────── */
  .carte{padding:16px 18px; border:1px solid var(--v2-line); border-radius:var(--v2-r-card); background:var(--v2-surface); min-width:0}
  .tete-carte{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px}
  h3,.titre-carte{display:inline-flex; align-items:center; gap:8px; margin:0; font-family:var(--font-display, Georgia, serif); font-weight:600;
    font-size:calc(19px * var(--v2-txt-echelle, 1))}
  .titre-hero{font-family:var(--font-display, Georgia, serif); font-weight:600; font-size:calc(30px * var(--v2-txt-echelle, 1)); line-height:1.15; margin:0}
  .voir-tout{border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); white-space:nowrap}
  .voir-tout:hover{color:var(--v2-txt)}
  .note{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .coupe{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0}
  .rang{display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--v2-line); min-width:0}
  .rangs > li:last-child > .rang,.rangs > .rang:last-child{border-bottom:0}
  .rang-bouton{width:100%; border:0; border-bottom:1px solid var(--v2-line); background:transparent; color:var(--v2-txt); cursor:pointer; text-align:left; font:inherit}
  .rang-bouton:hover{background:var(--v2-hover)}
  .texte-rang{flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  time{flex:none; white-space:nowrap}
  .point{flex:none; width:7px; height:7px; border-radius:50%}
  .non-lu .point{background:var(--v2-acc1)}
  .non-lu strong{color:var(--v2-acc-tint)}
  .avatar{flex:none; width:36px; height:36px; border-radius:50%; display:grid; place-items:center; background:var(--v2-surface2); border:1px solid var(--v2-line2);
    font-weight:700; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .avatar.petit{width:28px; height:28px; font-size:calc(10px * var(--v2-txt-echelle, 1))}
  /* Une série de messages du même auteur : l'avatar sous le dernier seulement, la place gardée. */
  .avatar.invisible{visibility:hidden}
  .avatar.mini{width:22px; height:22px; font-size:calc(9.5px * var(--v2-txt-echelle, 1))}
  .avatar.moyen{width:44px; height:44px}
  .avatar.moyen-plus{width:48px; height:48px; font-size:calc(14px * var(--v2-txt-echelle, 1));
    background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2)); color:var(--v2-on-acc); border:2px solid var(--v2-acc-tint)}
  .avatar.grand{width:60px; height:60px; font-size:calc(18px * var(--v2-txt-echelle, 1));
    background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2)); color:var(--v2-on-acc); border:2px solid var(--v2-acc-tint)}
  .avatar.geant{width:96px; height:96px; font-size:calc(30px * var(--v2-txt-echelle, 1));
    background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2)); color:var(--v2-on-acc); border:2px solid var(--v2-acc-tint); box-shadow:0 0 0 6px var(--v2-glow)}
  .avatar.plus{background:transparent; color:var(--v2-txt2); border:1px dashed var(--v2-line2)}
  .avatar.icone{color:var(--v2-acc-tint)}
  .sr-only{position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap}

  /* ── Boutons ronds, options, lecture ───────────────────────────────────── */
  .bouton-rond{flex:none; width:38px; height:38px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-acc-tint); cursor:pointer}
  .bouton-rond:hover{border-color:var(--v2-acc2)}
  .options{flex:none; width:28px; height:28px; display:grid; place-items:center; border:0; border-radius:50%; background:transparent; color:var(--v2-txt2); cursor:pointer}
  .options:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .lecture-ronde{flex:none; width:36px; height:36px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--v2-acc1);
    background:transparent; color:var(--v2-acc-tint); cursor:pointer}
  .lecture-ronde:hover{background:var(--v2-acc-soft)}
  .onglet:focus-visible,.inviter-entete:focus-visible,.voir-tout:focus-visible,.rang-bouton:focus-visible,.bouton-rond:focus-visible,.options:focus-visible,
  .lecture-ronde:focus-visible,.lire:focus-visible,.capacite:focus-visible,.puce:focus-visible,.conversation:focus-visible,.ajouter:focus-visible,
  .bascule button:focus-visible,.choix-tri:focus-visible,.envoi:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}

  /* ── Vignettes : les teintes de PlaylistsGrilleCercleV2 (aucune pochette inventée) ── */
  .vignette{position:relative; aspect-ratio:1; border-radius:12px; display:grid; place-items:center; overflow:hidden; border:1px solid var(--v2-line)}
  .teinte-t1{background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2))}
  .teinte-t2{background:linear-gradient(160deg, var(--v2-acc2), var(--v2-surface2))}
  .teinte-t3{background:linear-gradient(120deg, var(--v2-surface2), var(--v2-acc1))}
  .teinte-t4{background:radial-gradient(circle at 30% 30%, var(--v2-acc-tint), var(--v2-bg2))}
  .note-vignette{color:var(--v2-on-acc); opacity:.55; display:grid}
  .mini-vignette{width:44px; height:44px; flex:none; border-radius:8px; color:var(--v2-on-acc)}
  .lire{position:absolute; right:10px; bottom:10px; width:36px; height:36px; border-radius:50%; border:1px solid var(--v2-line2); display:grid; place-items:center;
    background:var(--v2-scrim); color:var(--v2-txt); cursor:pointer}
  .ligne-titre{display:flex; align-items:center; justify-content:space-between; gap:6px; min-width:0; font-size:calc(13.5px * var(--v2-txt-echelle, 1))}
  .bande{display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:18px}
  .mini{display:flex; flex-direction:column; gap:3px; min-width:0; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .mini .vignette{margin-bottom:6px}

  /* ── DÉCOUVRIR : héros en trois parties autour du globe ────────────────── */
  .hero-decouvrir{display:grid; grid-template-columns:minmax(220px, 280px) minmax(0, 1fr) minmax(260px, 320px); gap:24px; align-items:center}
  .hero-texte{display:flex; flex-direction:column; gap:22px}
  .capacites{display:flex; flex-direction:column; gap:14px}
  .capacite{display:flex; align-items:center; gap:14px; border:0; background:transparent; color:var(--v2-txt); cursor:pointer; text-align:left; padding:0;
    font:600 calc(13.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .capacite > span:last-child{display:flex; flex-direction:column; gap:2px}
  .rond{flex:none; width:44px; height:44px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-acc-tint)}
  .capacite:hover .rond{border-color:var(--v2-acc2)}
  .hero-globe{height:440px; min-width:0}
  .hero-droite{display:flex; flex-direction:column; gap:18px; min-width:0}
  .chiffres{display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); margin:0}
  .chiffres.quatre{grid-template-columns:repeat(4, minmax(0, 1fr)); border-top:1px solid var(--v2-line); padding-top:16px; margin-top:16px}
  /* Un chiffre : l'icône, le nombre, puis le libellé (dt porte icône + libellé, on les sépare en grille). */
  .chiffres > div{display:grid; grid-template-areas:"icone" "chiffre" "libelle"; justify-items:center; gap:2px; padding:0 8px; border-left:1px solid var(--v2-line)}
  .chiffres > div:first-child{border-left:0}
  .chiffres dt{display:contents}
  .chiffres dt :global(svg){grid-area:icone; color:var(--v2-acc-tint); margin-bottom:4px}
  .chiffres dt span{grid-area:libelle; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); text-align:center}
  .chiffres dd{grid-area:chiffre; margin:0; font-size:calc(24px * var(--v2-txt-echelle, 1)); font-weight:700; font-variant-numeric:tabular-nums}
  .deux-colonnes{display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:18px}
  .rangee-membres{display:flex; flex-wrap:wrap; gap:16px}
  .membre{flex:none; width:84px; display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; font-size:calc(12px * var(--v2-txt-echelle, 1))}
  .membre .coupe{max-width:100%}
  .ajouter{display:flex; flex-direction:column; align-items:center; gap:4px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans)}

  /* ── MESSAGES : deux volets, fil, composeur, partages ─────────────────── */
  .messagerie{display:grid; grid-template-columns:minmax(280px, 36%) minmax(0, 1fr); gap:18px; align-items:stretch}
  .liste-conv{display:flex; flex-direction:column; gap:12px; padding:16px 12px}
  .etiquette-non-lus{padding:2px 8px; border-radius:var(--v2-r-pill); background:var(--v2-acc-soft); border:1px solid var(--v2-acc2); color:var(--v2-acc-tint);
    font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .champ-conv{width:100%}
  .puces{display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; min-width:0}
  .puce{flex:none; padding:7px 16px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .puce[aria-pressed="true"]{background:var(--v2-acc1); border-color:var(--v2-acc1); color:var(--v2-on-acc); font-weight:600}
  .conversations{display:flex; flex-direction:column}
  .conversation{display:flex; align-items:center; gap:12px; width:100%; padding:12px 10px; border:0; border-bottom:1px solid var(--v2-line); border-radius:0;
    background:transparent; color:var(--v2-txt); text-align:left; cursor:pointer; font:inherit}
  .conversation:hover{background:var(--v2-hover)}
  /* Choisie : fond ET liseré à gauche — pas la couleur seule. */
  .conversation.choisie{background:var(--v2-active1); box-shadow:inset 3px 0 0 var(--v2-acc1)}
  .meta-conv{display:flex; flex-direction:column; align-items:flex-end; gap:6px}
  .fil{display:flex; flex-direction:column; padding:0}
  .tete-fil{display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--v2-line)}
  .tete-fil strong{font-size:calc(15px * var(--v2-txt-echelle, 1))}
  .defilement{flex:1; padding:14px 18px; overflow-y:auto; min-height:360px}
  .jour-fil{text-align:center; margin:0 0 12px}
  .jour-fil span{display:inline-block; padding:3px 12px; border-radius:var(--v2-r-pill); background:var(--v2-surface2); border:1px solid var(--v2-line);
    font-size:calc(11px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .messages{display:flex; flex-direction:column; gap:10px}
  .message{display:flex; align-items:flex-end; gap:8px; align-self:flex-start; max-width:72%; min-width:0}
  .message.mon-message{align-self:flex-end}
  .bulle{position:relative; padding:10px 14px 18px; border-radius:16px 16px 16px 4px; background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line);
    font-size:calc(13px * var(--v2-txt-echelle, 1)); line-height:1.45; min-width:72px; overflow-wrap:anywhere}
  .mon-message .bulle{background:var(--v2-acc1); color:var(--v2-on-acc); border-radius:16px 16px 4px 16px; border-color:transparent}
  .heure{position:absolute; right:10px; bottom:4px; font-size:calc(10px * var(--v2-txt-echelle, 1)); opacity:.7}
  .carte-musique{display:flex; align-items:center; gap:12px; padding:4px 0; min-width:260px}
  .pochette{flex:none; width:64px; height:64px; border-radius:8px; display:grid; place-items:center; color:var(--v2-on-acc); border:1px solid var(--v2-line)}
  .composeur{display:flex; align-items:center; gap:10px; padding:12px 16px; border-top:1px solid var(--v2-line)}
  .saisie{flex:1; min-width:0; height:40px; padding:0 16px; border-radius:20px; border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt);
    font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); outline:none}
  .saisie:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .envoi{flex:none; width:40px; height:40px; border:0; border-radius:50%; display:grid; place-items:center; background:var(--v2-acc1); color:var(--v2-on-acc); cursor:pointer}

  /* ── PLAYLISTS : bandeau de PlaylistsGrilleCercleV2, grille, deux cartes ── */
  .bandeau-playlists{display:flex; gap:24px; justify-content:space-between; align-items:center; flex-wrap:wrap; padding:28px 30px;
    border:1px solid var(--v2-line); border-radius:var(--v2-r-card);
    background:radial-gradient(90% 160% at 100% 0%, var(--v2-glow), transparent 60%), radial-gradient(120% 140% at 100% 0%, var(--v2-acc-soft), transparent 70%), var(--v2-surface)}
  .bandeau-texte{display:flex; flex-direction:column; gap:12px; max-width:520px; min-width:0}
  .bandeau-texte .note{margin:0; font-size:calc(14px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); line-height:1.5}
  .actions-bandeau{display:flex; gap:10px; flex-wrap:wrap; margin-top:4px}
  .chiffres.sans-cadre{min-width:300px}
  .barre{display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap}
  .reglages{display:flex; gap:10px; align-items:center}
  .choix-tri{height:34px; padding:0 12px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:var(--v2-surface); color:var(--v2-txt);
    font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .bascule{display:flex; border:1px solid var(--v2-line2); border-radius:10px; overflow:hidden}
  .bascule button{display:grid; place-items:center; width:36px; height:32px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer}
  .bascule button[aria-pressed="true"]{background:var(--v2-acc1); color:var(--v2-on-acc)}
  .grille-playlists{display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:22px}
  .carte-playlist{display:flex; flex-direction:column; gap:10px; min-width:0}
  .infos{display:flex; flex-direction:column; gap:3px; min-width:0}
  .proprio{display:flex; align-items:center; gap:6px; margin-top:4px; min-width:0}
  .en-liste{grid-template-columns:minmax(0, 1fr); gap:0}
  .en-liste .carte-playlist{flex-direction:row; align-items:center; padding:8px 0; border-bottom:1px solid var(--v2-line)}
  .en-liste .vignette{width:56px; flex:none}
  .en-liste .lire,.en-liste .note-vignette{display:none}
  .en-liste .infos{flex:1}

  /* ── MON CERCLE : profil, connexions, deux cartes ─────────────────────── */
  .profil{padding:22px 24px}
  .identite{display:flex; align-items:center; gap:22px; flex-wrap:wrap}
  .texte-profil{flex:1; min-width:220px; display:flex; flex-direction:column; gap:6px}
  .texte-profil .note{margin:0; font-size:calc(13.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); line-height:1.5; max-width:60ch}
  .connexions{display:flex; flex-direction:column}
  .connexion{display:grid; grid-template-columns:auto minmax(140px, 220px) minmax(0, 1fr) auto auto; align-items:center; gap:14px; padding:10px 6px;
    border-bottom:1px solid var(--v2-line)}
  .connexion .texte-rang strong{font-size:calc(14px * var(--v2-txt-echelle, 1))}
  .resume{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  /* ── Largeurs ─────────────────────────────────────────────────────────── */
  @media (max-width: 1280px){
    .hero-decouvrir{grid-template-columns:minmax(220px, 280px) minmax(0, 1fr)}
    .hero-droite{grid-column:1 / -1; display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr))}
  }
  @media (max-width: 860px){
    .corps{padding:16px 16px 0}
    .tete-circle{padding-left:16px; padding-right:16px}
    .onglets-circle{padding:0 16px}
    .hero-decouvrir,.deux-colonnes,.messagerie{grid-template-columns:minmax(0, 1fr)}
    .hero-globe{height:340px; order:-1}
    .connexion{grid-template-columns:auto minmax(0, 1fr) auto auto}
    .connexion .resume{display:none}
    .chiffres.quatre{grid-template-columns:repeat(2, minmax(0, 1fr)); row-gap:14px}
    .chiffres.quatre > div:nth-child(3){border-left:0}
    .chiffres.sans-cadre{min-width:0; width:100%}
    .bande{grid-template-columns:repeat(2, minmax(0, 1fr))}
    .grille-playlists{grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px}
    .message{max-width:88%}
    .carte-musique{min-width:0}
    .barre .v2-rech{flex:1 1 100%; width:auto}
  }
</style>
