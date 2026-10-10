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
   *
   * Étape T2 (renesenses/tune-server-rust#5325, décisions du 28/09/2026) :
   * - sous chaque cercle, l'interrupteur « Partager ma bibliothèque »,
   *   ÉTEINT par défaut, qui dit ce qui part (des métadonnées, de CE serveur
   *   seulement) et ce qui ne part jamais (les fichiers, leurs chemins) ;
   * - le bloc « Partagé avec moi », et le catalogue d'un contact en lecture
   *   (`CatalogueContactV2`). Un 404 y ramène ici, avec la phrase.
   * Un greffon T1 ne connaît pas `/library-sync` (404) : la partie T2 reste
   * alors cachée plutôt que d'offrir des gestes qui échoueraient.
   *
   * Étape T3 (renesenses/tune-server-rust#5326, décisions du 28/09/2026) :
   * sous l'interrupteur, « Sélections partagées » — mes étiquettes et mes
   * collections intelligentes, à cocher UNE PAR UNE pour CE cercle, aucune
   * cochée par défaut. Grisé tant que ce cercle ne partage pas la
   * bibliothèque de CE serveur. Les listes se lisent à la demande (bouton),
   * pas à chaque relecture de `GET /` : les compter coûte au serveur.
   * Cocher = PUT sans corps (le greffon résout les membres), décocher = DELETE.
   * Étape T5 (renesenses/tune-server-rust#5328, décisions du 28/09/2026) :
   * - le bloc « Playlists partagées » (`GET /playlists`) : les miennes et
   *   celles des cercles où je suis rangé ; la vue d'une playlist
   *   (`PlaylistCercleV2`), où tout membre retire et réordonne ;
   * - « Nouvelle playlist » sous chacun de MES cercles : le propriétaire du
   *   cercle seul crée, renomme, supprime ;
   * - « Playlists à récupérer » : à la suppression d'un cercle, le cloud
   *   ARCHIVE ses playlists (site-mozaiklabs#236) ; le propriétaire et chaque
   *   membre rangé et actif à ce moment peuvent en récupérer une COPIE dans
   *   leurs playlists, ou y renoncer (décision 3) — la seule copie que
   *   l'écran offre (décision 5). Décisions du 28/09 (suite) : ce droit dure
   *   30 jours (échéance `expires_at`, affichée quand le cloud la rend), et
   *   supprimer une playlist VIVANTE l'archive aussi : elle arrive ici.
   * Même règle qu'en T2 : un 404 sur `/playlists` dit un greffon d'avant T5,
   * et le bloc reste caché.
   */
  import { onDestroy } from 'svelte';
  import { dialogs } from '../../lib/stores/dialogs';
  import { dateCourte } from '../../lib/dates';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import {
    circleCharge, circlePlugin, refreshCirclePlugin, getCercle, estConnecte, ecouteOuverte,
    inviterAuCercle, accepterInvitation, refuserInvitation, annulerInvitation,
    revoquerContact, creerCercle, renommerCercle, supprimerCercle,
    rangerDansCercle, retirerDuCercle, motifCercle, nomCercleValide,
    seConnecterAMozaiklabs, NOM_CERCLE_MAX, RELECTURE_CERCLE_MS,
    partageActif, partagerBibliotheque, arreterPartageBibliotheque, ouPartage,
    getSynchroBibliotheque, avisSynchro, getPartagesAvecMoi, plusPartage,
    getRayonsCercle, partagerRayon, retirerRayon, estBibliothequeNonPartagee,
    type RayonsCercle, type RayonLocal,
    type EtatCercle, type MotifCercle, type ContactCercle, type CercleNomme,
    type EtatSynchroBibliotheque, type PartageRecu, type AvisSynchro,
  } from '../../lib/circle';
  import {
    listerPlaylistsCercle, creerPlaylistCercle, nomPlaylistValide, codeT5,
    listerRecuperables, recupererCopie, renoncerRecuperable,
    NOM_PLAYLIST_MAX, type IdOpaque, type PlaylistCercleResume, type PlaylistRecuperable, type BilanCopie,
  } from '../../lib/circlePlaylists';
  import CatalogueContactV2 from './CatalogueContactV2.svelte';
  import PlaylistCercleV2 from './PlaylistCercleV2.svelte';
  import '../../styles/tune-v2.css';

  /** `relier` : le refus dit que ce serveur n'est pas relié au compte (T2). */
  type Retour = { texte: string; erreur: boolean; reessayer?: () => void; relier?: boolean };

  let etat = $state<EtatCercle | null>(null);
  let erreurLecture = $state<MotifCercle | null>(null);
  let occupe = $state<string | null>(null);
  let retour = $state<Retour | null>(null);
  let retourInvitation = $state<Retour | null>(null);

  let email = $state('');
  let cercleInvitation = $state<number | ''>('');
  let nomNouveau = $state('');
  let ajout = $state<Record<number, number | ''>>({});

  /** T2 : `null` tant qu'on ne sait pas si le greffon connaît l'étape (404 = non). */
  let t2 = $state<boolean | null>(null);
  let synchro = $state<EtatSynchroBibliotheque | null>(null);
  let partages = $state<PartageRecu[]>([]);
  let erreurPartages = $state<MotifCercle | null>(null);
  let contactOuvert = $state<PartageRecu | null>(null);

  /** T3 : les rayons d'un cercle, lus à la demande. Clé = id du cercle. */
  type EtatRayons = { chargement: boolean; donnees: RayonsCercle | null; erreur: MotifCercle | null };
  let rayons = $state<Record<number, EtatRayons>>({});
  let rayonsOuverts = $state<Record<number, boolean>>({});
  /** T5 : `null` tant qu'on ne sait pas si le greffon connaît l'étape (404 = non). */
  let t5 = $state<boolean | null>(null);
  let playlists = $state<PlaylistCercleResume[]>([]);
  let erreurPlaylists = $state<MotifCercle | null>(null);
  let playlistOuverte = $state<IdOpaque | null>(null);
  let recuperables = $state<PlaylistRecuperable[]>([]);

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
      // Un cercle qui ne partage plus ici (coupé ailleurs, déplacé) perd ses
      // listes gardées : rallumé, il repartira d'une liste relue, décochée.
      if (estConnecte(e)) {
        for (const c of e.circles ?? []) {
          if (!partageIci(c) && (rayons[c.id] || rayonsOuverts[c.id])) { delete rayons[c.id]; delete rayonsOuverts[c.id]; }
        }
      }
      if (estConnecte(e)) await Promise.all([relireT2(), relireT5()]);
    } catch (e) {
      if (fini) return;
      // Pas de liste périmée affichée comme vraie : l'écran dit la panne.
      etat = null;
      erreurLecture = motifCercle(e);
    } finally {
      enCours = false;
    }
  }

  /**
   * T2 : l'état de ma copie en ligne et ce qu'on partage avec moi. Lus après
   * `GET /`, seulement quand je suis connecté. Un 404 sur `/library-sync`
   * dit un greffon T1 : la partie T2 se cache.
   */
  async function relireT2() {
    const [s, p] = await Promise.allSettled([getSynchroBibliotheque(), getPartagesAvecMoi()]);
    if (fini) return;
    if (s.status === 'fulfilled') { synchro = s.value; t2 = true; }
    else { synchro = null; t2 = plusPartage(s.reason) ? false : t2; }
    if (p.status === 'fulfilled') { partages = p.value; erreurPartages = null; }
    else if (plusPartage(p.reason)) { partages = []; erreurPartages = null; }
    else { erreurPartages = motifCercle(p.reason); }
  }

  /** T5 : les playlists de cercle visibles par moi. Un 404 dit un greffon d'avant T5. */
  async function relireT5() {
    const [l, r] = await Promise.allSettled([listerPlaylistsCercle(), listerRecuperables()]);
    if (fini) return;
    if (l.status === 'fulfilled') { playlists = l.value; t5 = true; erreurPlaylists = null; }
    else if (plusPartage(l.reason)) { playlists = []; t5 = false; erreurPlaylists = null; }
    else erreurPlaylists = motifCercle(l.reason);
    // Rien à récupérer, ou une panne : le bloc se tait (il ne porte aucun geste urgent).
    recuperables = r.status === 'fulfilled' ? r.value : [];
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
      const t5cle = codeT5(e);
      poser({
        texte: t5cle ? $t(t5cle as any).replace('{max}', String(NOM_PLAYLIST_MAX)) : phrase(m),
        erreur: true,
        reessayer: m.indisponible ? () => void geste(nom, action, opts) : undefined,
        relier: m.nonRelie === true,
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

  /** Mes playlists de CE cercle (le cloud dit `circle_id` des miennes seulement). */
  const playlistsDe = (c: CercleNomme) => playlists.filter((p) => p.mine && p.circle_id === c.id);

  async function supprimer(c: CercleNomme) {
    // Décision 3 du 28/09 : ses playlists sont ARCHIVÉES par le cloud, et
    // chacun pourra en récupérer une copie. On le dit AVANT de supprimer.
    const n = playlistsDe(c).length;
    const note = n > 0 ? ` ${$t('v2.circle.pl.deleteCircleNote' as any).replace('{n}', String(n))}` : '';
    const ok = await dialogs.confirm(
      $t('v2.circle.confirmDeleteCircle' as any).replace('{name}', c.name) + note,
      { danger: true },
    );
    if (!ok) return;
    void geste(`supprimer-${c.id}`, () => supprimerCercle(c.id));
  }

  /** Décision 3 : récupérer une copie d'une playlist archivée, ou y renoncer. */
  function recuperer(r: PlaylistRecuperable) {
    let bilan: BilanCopie | null = null;
    void geste(`recuperer-${String(r.id)}`, async () => { bilan = await recupererCopie(r.id); }, {
      apres: () => {
        const b = bilan as BilanCopie | null;
        if (!b || b.liberee) { retour = { texte: $t('v2.circle.pl.rec.copied' as any), erreur: false }; return; }
        // Décision du 28/09 : des introuvables gardent l'archive ; une seconde
        // copie, après avoir branché un service, complétera la même playlist.
        const cle = r.expires_at ? 'v2.circle.pl.rec.partial' : 'v2.circle.pl.rec.partialNoDate';
        retour = {
          texte: $t(cle as any).replace('{n}', String(b.manquants)).replace('{date}', r.expires_at ? $dateCourte(r.expires_at) : ''),
          erreur: true,
        };
      },
    });
  }
  async function renoncer(r: PlaylistRecuperable) {
    const ok = await dialogs.confirm($t('v2.circle.pl.rec.confirmDecline' as any).replace('{name}', r.name), { danger: true });
    if (!ok) return;
    void geste(`renoncer-${String(r.id)}`, () => renoncerRecuperable(r.id));
  }

  /** Le propriétaire du cercle crée une playlist pour CE cercle. */
  async function nouvellePlaylist(c: CercleNomme) {
    const saisi = await dialogs.prompt($t('v2.circle.pl.newPrompt' as any).replace('{max}', String(NOM_PLAYLIST_MAX)), '');
    if (saisi === null) return;
    const nom = nomPlaylistValide(saisi);
    if (nom === null) { retour = { texte: $t('v2.circle.pl.err.nameInvalid' as any).replace('{max}', String(NOM_PLAYLIST_MAX)), erreur: true }; return; }
    void geste(`playlist-${c.id}`, () => creerPlaylistCercle(c.id, nom), { succes: 'v2.circle.pl.created' });
  }

  /** Retour de la vue d'une playlist : la phrase qui convient, et la liste relue. */
  function fermerPlaylist(raison: 'retour' | 'plusPartagee' | 'supprimee') {
    playlistOuverte = null;
    if (raison === 'plusPartagee') retour = { texte: $t('v2.circle.pl.gone' as any), erreur: true };
    else if (raison === 'supprimee') retour = { texte: $t('v2.circle.pl.deleted' as any), erreur: false };
    void relire();
  }

  function ranger(c: CercleNomme) {
    const uid = ajout[c.id];
    if (uid === '' || uid == null) return;
    void geste(`ranger-${c.id}`, () => rangerDansCercle(c.id, uid), { apres: () => { ajout[c.id] = ''; } });
  }

  /** Le `server_id` de CE serveur, quand le greffon le dit. */
  const serveurLocal = $derived(synchro?.server_id ?? null);
  const ou = (c: CercleNomme) => ouPartage(c, serveurLocal);
  /** Un de mes cercles partage-t-il un AUTRE de mes serveurs ? */
  const partageAilleurs = $derived(cercles.some((c) => ou(c) === 'ailleurs'));

  /**
   * L'interrupteur : allumé ici → DELETE ; sinon → PUT (sans corps), puis relecture.
   *
   * Décision du 28/09/2026 : UN seul serveur partagé par propriétaire, pour
   * tous ses cercles. Si un cercle partage déjà un autre de mes serveurs,
   * activer ici DÉPLACE le partage — l'écran le dit et le fait confirmer
   * AVANT d'envoyer quoi que ce soit.
   */
  async function basculerPartage(c: CercleNomme) {
    if (occupe !== null) return;
    if (ou(c) === 'ici') {
      // T3 (décision 4 du contrat cloud) : couper le partage SUPPRIME les
      // sélections de ce cercle. S'il en a, l'écran le dit et le fait
      // confirmer AVANT d'envoyer quoi que ce soit.
      const message = await confirmationCoupure(c);
      if (message !== null && !(await dialogs.confirm(message, { danger: true }))) return;
      void geste(`partage-${c.id}`, () => arreterPartageBibliotheque(c.id), {
        succes: 'v2.circle.share.stopped', apres: oublierSelections,
      });
      return;
    }
    if (partageAilleurs) {
      // Le texte dit aussi que les sélections des cercles déplacés partent.
      const ok = await dialogs.confirm($t('v2.circle.share.confirmMove' as any));
      if (!ok) return;
    }
    void geste(`partage-${c.id}`, () => partagerBibliotheque(c.id), { succes: 'v2.circle.share.started', apres: oublierSelections });
  }

  /**
   * Le texte de confirmation d'une coupure, ou `null` s'il n'y a rien à perdre.
   * Les cases sont relues au greffon, pas prises dans une liste affichée
   * peut-être ancienne. Un 404 (greffon sans T3) : aucune sélection possible.
   * Une autre panne : on ne sait pas, on prévient quand même.
   */
  async function confirmationCoupure(c: CercleNomme): Promise<string | null> {
    try {
      const d = await getRayonsCercle(c.id);
      const n = [...d.tags, ...d.smart_collections].filter((r) => r.shared).length;
      if (n === 0) return null;
      return n === 1 ? $t('v2.circle.sel.confirmStopOne' as any)
        : $t('v2.circle.sel.confirmStopMany' as any).replace('{n}', String(n));
    } catch (e) {
      return plusPartage(e) ? null : $t('v2.circle.sel.confirmStopUnknown' as any);
    }
  }

  /**
   * Après une coupure, un rallumage ou un déplacement : les listes gardées
   * sont oubliées. Le cloud a supprimé les sélections coupées ; montrer
   * l'ancienne liste ferait croire qu'elles sont encore cochées. Rien n'est
   * recoché de soi-même : il faut un nouveau geste du propriétaire.
   */
  function oublierSelections() {
    rayons = {};
    rayonsOuverts = {};
  }

  // ── T3 : rayons partagés ─────────────────────────────────────────────────

  async function chargerRayons(id: number) {
    rayons[id] = { chargement: true, donnees: rayons[id]?.donnees ?? null, erreur: null };
    try {
      const d = await getRayonsCercle(id);
      if (fini) return;
      rayons[id] = { chargement: false, donnees: d, erreur: null };
    } catch (e) {
      if (fini) return;
      // Pas de cases périmées affichées comme vraies : la panne, et c'est tout.
      rayons[id] = { chargement: false, donnees: null, erreur: motifCercle(e) };
    }
  }

  function basculerOuvertureRayons(c: CercleNomme) {
    const ouvrir = !rayonsOuverts[c.id];
    rayonsOuverts[c.id] = ouvrir;
    if (ouvrir) void chargerRayons(c.id);
  }

  /**
   * Cocher = PUT sans corps, décocher = DELETE ; puis les cases sont RELUES :
   * elles disent ce que le greffon dit, pas ce que l'écran suppose.
   */
  async function basculerRayon(c: CercleNomme, r: RayonLocal) {
    if (occupe !== null) return;
    occupe = `rayon-${c.id}-${r.kind}-${r.source_id}`;
    let erreur: MotifCercle | null = null;
    let relireTout = false;
    try {
      if (r.shared) await retirerRayon(c.id, r.kind, r.source_id);
      else await partagerRayon(c.id, r.kind, r.source_id);
    } catch (e) {
      erreur = motifCercle(e);
      // Le partage de bibliothèque a été coupé ailleurs : relire le cercle.
      relireTout = estBibliothequeNonPartagee(e);
    } finally {
      occupe = null;
    }
    if (fini) return;
    await chargerRayons(c.id);
    if (erreur && rayons[c.id]) rayons[c.id] = { ...rayons[c.id], erreur };
    if (relireTout) await relire();
  }

  /** Les rayons ne s'offrent que si ce cercle partage la bibliothèque de CE serveur. */
  const partageIci = (c: CercleNomme) => ou(c) === 'ici';

  const compteRayon = (r: RayonLocal) =>
    r.count != null ? $t('v2.circle.sel.count' as any).replace('{n}', String(r.count)) : '';

  /** Réglages ▸ Système ▸ Cloud : le chemin de `OutputModuleBanner.ouvrirLiaisonCompte`. */
  function ouvrirLiaisonCompte() {
    v2SettingsTarget.set({ tab: 'system', section: 'cloud' });
    activeView.set('settings');
  }

  function texteAvis(a: AvisSynchro): string {
    const s = $t(a.cle as any);
    if (a.cle === 'v2.circle.share.syncPending') return s.replace('{n}', String(a.n));
    if (a.cle === 'v2.circle.share.syncOk') return s.replace('{date}', $dateCourte(a.date));
    return s;
  }
  const avis = $derived(avisSynchro(synchro));

  /** Retour du catalogue d'un contact. Un 404 : la phrase, et la liste relue. */
  function fermerCatalogue(plusPartageAvecMoi: boolean) {
    contactOuvert = null;
    if (plusPartageAvecMoi) retour = { texte: $t('v2.circle.shared.gone' as any), erreur: true };
    void relire();
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
    {:else if playlistOuverte != null}
      {#key String(playlistOuverte)}
        <PlaylistCercleV2 id={playlistOuverte} onFermer={fermerPlaylist} />
      {/key}
    {:else if contactOuvert}
      {#key contactOuvert.user_id}
        <CatalogueContactV2 contact={contactOuvert} onFermer={fermerCatalogue} premium={synchro?.premium ?? null} ouverte={ecouteOuverte(synchro)} />
      {/key}
    {:else}
      <p class="intro">{$t('v2.circle.intro' as any)}</p>

      {#if retour}
        <div class={retour.erreur ? 'err retour' : 'ok retour'} role={retour.erreur ? 'alert' : 'status'}>
          <span>{retour.texte}</span>
          {#if retour.reessayer}
            <button class="lnk reessayer" onclick={retour.reessayer}>{$t('v2.circle.retry' as any)}</button>
          {/if}
          {#if retour.relier}
            <button class="lnk relier-compte" onclick={ouvrirLiaisonCompte}>{$t('outputModule.notLinkedAction' as any)}</button>
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
                {#if t5}
                  <button class="lnk nouvelle-playlist" disabled={occupe !== null} onclick={() => void nouvellePlaylist(c)}>{$t('v2.circle.pl.new' as any)}</button>
                {/if}
                <button class="lnk danger supprimer" disabled={occupe !== null} onclick={() => void supprimer(c)}>{$t('v2.circle.deleteCircle' as any)}</button>
              </div>
              {#if t2}
                <div class="partage">
                  <button class="interrupteur interrupteur-partage" role="switch" aria-checked={ou(c) === 'ici'}
                    disabled={occupe !== null} onclick={() => void basculerPartage(c)}>
                    <span class="piste-interrupteur" aria-hidden="true"><span class="bouton-interrupteur"></span></span>
                    <span>{$t('v2.circle.share.toggle' as any)}</span>
                  </button>
                  <p class="note partage-quoi">{$t('v2.circle.share.what' as any)}</p>
                  {#if ou(c) === 'ailleurs'}
                    <p class="note partage-ailleurs">{$t('v2.circle.share.elsewhere' as any)}</p>
                  {/if}
                  {#if ou(c) === 'ici' && avis}
                    <p class={avis.cle === 'v2.circle.share.syncOk' ? 'note avis-synchro' : 'note avis-synchro alerte'}>{texteAvis(avis)}</p>
                  {/if}
                </div>
                <div class="rayons" class:grise={!partageIci(c)} aria-disabled={!partageIci(c)}>
                  <button class="lnk ouvrir-rayons" aria-expanded={partageIci(c) && rayonsOuverts[c.id] === true}
                    aria-controls={`circle-rayons-${c.id}`} disabled={!partageIci(c)}
                    onclick={() => basculerOuvertureRayons(c)}>{$t('v2.circle.sel.title' as any)}</button>
                  <p class="note rayons-quoi">{$t((partageIci(c) ? 'v2.circle.sel.hint' : 'v2.circle.sel.needLibrary') as any)}</p>
                  {#if partageIci(c) && rayonsOuverts[c.id]}
                    {@const r = rayons[c.id]}
                    <div class="rayons-listes" id={`circle-rayons-${c.id}`}>
                      {#if r?.erreur}
                        <div class="err erreur-rayons" role="alert"><span>{phrase(r.erreur)}</span>
                          <button class="lnk reessayer" onclick={() => void chargerRayons(c.id)}>{$t('v2.circle.retry' as any)}</button></div>
                      {/if}
                      {#if !r || (r.chargement && !r.donnees)}
                        <div class="state">{$t('v2.tool.loading' as any)}</div>
                      {:else if r.donnees}
                        {#each [
                          { cle: 'tags', titre: 'v2.circle.sel.tags', vide: 'v2.circle.sel.noTags', liste: r.donnees.tags },
                          { cle: 'smart', titre: 'v2.circle.sel.smart', vide: 'v2.circle.sel.noSmart', liste: r.donnees.smart_collections },
                        ] as groupe (groupe.cle)}
                          <fieldset class="groupe-rayons groupe-{groupe.cle}">
                            <legend>{$t(groupe.titre as any)}</legend>
                            {#if groupe.liste.length === 0}
                              <p class="note vide">{$t(groupe.vide as any)}</p>
                            {:else}
                              {#each groupe.liste as x (`${x.kind}-${x.source_id}`)}
                                <label class="case-rayon">
                                  <input type="checkbox" class="coche-rayon" checked={x.shared}
                                    disabled={occupe !== null} onchange={(ev) => { (ev.currentTarget as HTMLInputElement).checked = x.shared; void basculerRayon(c, x); }} />
                                  <span class="nom-rayon">{x.name}</span>
                                  {#if x.count != null}<span class="note compte-rayon">{compteRayon(x)}</span>{/if}
                                </label>
                              {/each}
                            {/if}
                          </fieldset>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
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

      {#if t2}
        <section class="bloc partages-recus" aria-labelledby="circle-partages-recus">
          <h2 id="circle-partages-recus">{$t('v2.circle.shared.title' as any)}</h2>
          <p class="note">{$t('v2.circle.shared.hint' as any)}</p>
          {#if erreurPartages}
            <div class="err" role="alert"><span>{phrase(erreurPartages)}</span>
              <button class="lnk reessayer" onclick={() => void relire()}>{$t('v2.circle.retry' as any)}</button></div>
          {:else if partages.length === 0}
            <p class="note vide">{$t('v2.circle.shared.none' as any)}</p>
          {:else}
            <ul>
              {#each partages as p (p.user_id)}
                <li class="ligne partage-recu">
                  <span class="nom">{p.name}</span>
                  <span></span>
                  <span class="gestes">
                    <button class="lnk ouvrir-catalogue"
                      aria-label={$t('v2.circle.shared.browseNamed' as any).replace('{name}', p.name)}
                      onclick={() => { retour = null; contactOuvert = p; }}>
                      {$t('v2.circle.shared.browse' as any)}
                    </button>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if t5}
        <section class="bloc playlists-cercle" aria-labelledby="circle-playlists">
          <h2 id="circle-playlists">{$t('v2.circle.pl.title' as any)}</h2>
          <p class="note">{$t('v2.circle.pl.hint' as any)}</p>
          {#if erreurPlaylists}
            <div class="err" role="alert"><span>{phrase(erreurPlaylists)}</span>
              <button class="lnk reessayer" onclick={() => void relire()}>{$t('v2.circle.retry' as any)}</button></div>
          {:else if playlists.length === 0}
            <p class="note vide">{$t('v2.circle.pl.none' as any)}</p>
          {:else}
            <ul>
              {#each playlists as p (String(p.id))}
                <li class="ligne playlist-cercle">
                  <span class="nom">{p.name}</span>
                  <span class="note">
                    {$t('v2.circle.pl.count' as any).replace('{n}', String(p.count))}{#if !p.mine && p.owner?.name} · {$t('v2.circle.pl.by' as any).replace('{name}', p.owner.name)}{/if}
                  </span>
                  <span class="gestes">
                    <button class="lnk ouvrir-playlist"
                      aria-label={$t('v2.circle.pl.openNamed' as any).replace('{name}', p.name)}
                      onclick={() => { retour = null; playlistOuverte = p.id; }}>
                      {$t('v2.circle.pl.open' as any)}
                    </button>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if t5 && recuperables.length > 0}
        <section class="bloc recuperables" aria-labelledby="circle-recuperables">
          <h2 id="circle-recuperables">{$t('v2.circle.pl.rec.title' as any)}</h2>
          <p class="note">{$t('v2.circle.pl.rec.hint' as any)}</p>
          <ul>
            {#each recuperables as r (String(r.id))}
              <li class="ligne recuperable">
                <span class="nom">{r.name}</span>
                <span class="note">
                  {$t('v2.circle.pl.count' as any).replace('{n}', String(r.count))}{#if !r.mine && r.owner?.name} · {$t('v2.circle.pl.by' as any).replace('{name}', r.owner.name)}{/if}{#if r.expires_at} · <span class="echeance">{$t('v2.circle.pl.rec.until' as any).replace('{date}', $dateCourte(r.expires_at))}</span>{/if}
                </span>
                <span class="gestes">
                  <button class="lnk recuperer-copie" disabled={occupe !== null}
                    aria-label={$t('v2.circle.pl.rec.copyNamed' as any).replace('{name}', r.name)}
                    onclick={() => recuperer(r)}>{$t('v2.circle.pl.rec.copy' as any)}</button>
                  <button class="lnk renoncer" disabled={occupe !== null}
                    onclick={() => void renoncer(r)}>{$t('v2.circle.pl.rec.decline' as any)}</button>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

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
  .partage{display:flex; flex-direction:column; gap:4px; padding:4px 0 6px; border-bottom:1px solid var(--v2-line)}
  .partage-quoi{margin:0}
  .avis-synchro{margin:0}
  .avis-synchro.alerte{color:var(--v2-danger)}
  .interrupteur{display:inline-flex; align-items:center; gap:10px; border:0; background:transparent; color:var(--v2-txt);
    font:600 13px var(--v2-sans); cursor:pointer; padding:2px 0; align-self:flex-start}
  .interrupteur:disabled{opacity:.35; cursor:not-allowed}
  .interrupteur:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .piste-interrupteur{position:relative; width:34px; height:20px; border-radius:10px; background:var(--v2-line2); flex:none; transition:background .15s}
  .bouton-interrupteur{position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--v2-surface); transition:left .15s}
  .interrupteur[aria-checked="true"] .piste-interrupteur{background:var(--v2-acc2)}
  .interrupteur[aria-checked="true"] .bouton-interrupteur{left:16px}
  .rayons{display:flex; flex-direction:column; gap:4px; padding:2px 0 6px; border-bottom:1px solid var(--v2-line)}
  .rayons.grise{opacity:.55}
  .ouvrir-rayons{align-self:flex-start; font-weight:600}
  .rayons-quoi{margin:0}
  .rayons-listes{display:flex; flex-direction:column; gap:10px; padding-top:4px}
  .groupe-rayons{border:0; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; min-width:0}
  .groupe-rayons legend{font-size:12.5px; font-weight:700; color:var(--v2-txt2); padding:0; margin-bottom:2px}
  .case-rayon{display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; min-width:0}
  .case-rayon input:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .nom-rayon{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (max-width: 640px){
    .scroll{padding:6px 16px 32px}
    .ligne{grid-template-columns:minmax(0,1fr) auto}
    .ligne .note{grid-column:1}
  }
</style>
