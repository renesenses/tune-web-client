<script lang="ts">
  /**
   * Métadonnées — nouveau client (direction Levente). Niveau Expert.
   *
   * PÉRIMÈTRE ASSUMÉ : ce n'est PAS l'éditeur de tags de l'écran actuel. Cet
   * écran couvre les deux choses qui demandent une DÉCISION :
   *   - les propositions de la communauté, à accepter ou refuser ;
   *   - les albums douteux, que le serveur signale avec ses raisons.
   * L'édition champ par champ reste dans l'écran actuel, et on y renvoie.
   *
   * `accept: false` n'est pas un rejet muet : c'est une VOIX pour la valeur
   * qu'on possède déjà. L'écran le dit, sinon on croit jeter l'information.
   */
  import * as api from '../../lib/api';
  import { formatNombre } from '../../lib/formats';
  import type { GravureDrEtat, MetadataProposal, GroupeAlbumsEclates, GroupeArtistes, PaireDoublonNommee, AlbumEclate, ArtisteHomographe, CopieDoublon, AlbumDetailed } from '../../lib/api';
  import { } from '../../lib/utils';
  import AlbumArt from '../partages/AlbumArt.svelte';
  // L'arbre des genres du client actuel, REPRIS tel quel plutôt que réécrit :
  // 426 lignes qui savent charger, renommer, fusionner et enregistrer. Le
  // dupliquer en style v2 aurait été quatre cents lignes de risque pour un
  // habillage. Il est habillé par le conteneur, voir `.gt-v2`.
  import GenreTreeView from '../v2-heritage/GenreTreeView.svelte';
  import ManquantsV2 from './ManquantsV2.svelte';
  import { artisteApresFusion } from '../../lib/compilationArtiste';
  import { grouperParArtisteDevine, type PisteDouteuse } from '../../lib/artisteDepuisChemin';
  import { t } from '../../lib/i18n';
  import '../../styles/tune-v2.css';

  type Tab = 'proposals' | 'doubtful' | 'doublons' | 'genres' | 'dr' | 'compil' | 'coffret' | 'manquants';
  let tab = $state<Tab>('proposals');

  let proposals = $state<MetadataProposal[]>([]);
  let pending = $state(0);
  let autoApply = $state(false);
  let pLoading = $state(true);
  let doubtful = $state<PisteDouteuse[]>([]);
  let dLoading = $state(false);
  let dLoaded = false;
  let error = $state<string | null>(null);
  let busy = $state<number | null>(null);

  async function loadProposals() {
    pLoading = true;
    try {
      const r = await api.listMetadataProposals();
      proposals = r?.proposals ?? []; pending = r?.pending ?? 0; autoApply = !!r?.auto_apply;
      error = null;
    } catch { error = $t('v2.meta.suggestUnavail' as any); }
    pLoading = false;
  }
  // Onglet « Doublons » : ce que le serveur sait nommer ET réparer — albums
  // éclatés (BIB-A2), artistes en double (BIB-C1), paires de pistes à critère
  // nommé (BIB-B3). Chargé à l'ouverture de l'onglet, jamais avant.
  let dblAlbums = $state<GroupeAlbumsEclates[]>([]);
  let dblArtistes = $state<GroupeArtistes[]>([]);
  let dblPaires = $state<PaireDoublonNommee[]>([]);
  let dblLoading = $state(false);
  let dblLoaded = false;
  let arme = $state<string | null>(null);
  /**
   * 🔴 #4471 — LES COFFRETS RIPÉS EN CD1/CD2.
   *
   * Un coffret ripé en sous-dossiers arrive bien dans UN album, mais ses
   * titres se déclarent tous « disque 1 » : les numéros de piste se marchent
   * dessus, l'album se lit dans un ordre indéfini et paraît plein de doublons.
   *
   * Le serveur le répare depuis le DOSSIER, qui lui est juste. Ici on montre
   * d'abord ce qui SERAIT changé — la même détection que l'écriture, donc le
   * même compte rendu — et on n'écrit que si on le demande.
   *
   * ⚠️ Ce n'est PAS la fusion de deux albums, qui vit dans la section
   * « Albums en double » juste au-dessus : ici l'album est déjà un, c'est sa
   * numérotation qui est fausse.
   */
  let disques = $state<import('../../lib/api').DisquesAbimes | null>(null);
  let disquesEnCours = $state(false);
  /**
   * 🔴 LES COFFRETS ÉCLATÉS — un album par disque, à réunir.
   *
   * Distinct du bloc voisin : là, l'album est déjà un et sa numérotation est
   * fausse ; ici il y a autant d'albums que de disques. Mesuré sur le .18 :
   * 61 coffrets, 148 albums — *Radio Nova, La boîte Bleue* en compte 25.
   *
   * ⚠️ UN coffret à la fois. Le serveur ne propose pas de tout regrouper, et
   * l'écran non plus : vingt-cinq absorptions en un clic ne se relisent pas.
   */
  let coffrets = $state<import('../../lib/api').CoffretEclate[]>([]);
  let coffretEnCours = $state<number | null>(null);
  async function chargerCoffrets() {
    try { coffrets = (await api.getCoffretsEclates())?.coffrets ?? []; }
    catch { coffrets = []; }
  }
  async function regrouper(c: import('../../lib/api').CoffretEclate) {
    if (c.cible == null || coffretEnCours != null) return;
    coffretEnCours = c.cible;
    try {
      await api.regrouperCoffret(c.cible);
      error = null;
      await chargerCoffrets();
      await chargerDoublons();
    } catch (e: any) {
      error = e?.message ?? $t('v2.meta.decisionNotSaved' as any);
    }
    coffretEnCours = null;
  }

  async function chargerDisques() {
    try { disques = await api.getDisquesAbimes(); }
    catch { disques = null; }
  }
  async function reparerDisques() {
    if (disquesEnCours) return;
    disquesEnCours = true;
    try {
      const r = await api.reparerDisquesAbimes();
      disques = r;
      error = null;
      // La bibliothèque a changé sous l'écran : les autres onglets en dépendent.
      await chargerDoublons();
    } catch (e: any) {
      error = e?.message ?? $t('v2.meta.decisionNotSaved' as any);
    }
    disquesEnCours = false;
  }

  async function chargerDoublons() {
    dblLoading = true;
    const [al, ar, pa] = await Promise.all([
      api.getAlbumsEclates().catch(() => [] as GroupeAlbumsEclates[]),
      api.getArtistsDoublons().catch(() => [] as GroupeArtistes[]),
      api.getPairesDoublons().catch(() => [] as PaireDoublonNommee[]),
    ]);
    dblAlbums = al; dblArtistes = ar; dblPaires = pa;
    dblLoading = false;
    // #4471 : même onglet, même moment — mais une requête à part, pour qu'un
    // serveur antérieur (404) ne prive pas l'écran de ses trois autres listes.
    void chargerDisques();
    void chargerCoffrets();
  }
  $effect(() => {
    if (tab !== 'doublons' || dblLoaded) return;
    dblLoaded = true;
    chargerDoublons();
  });
  /** La fiche à garder : celle qui porte le plus (pistes, albums). */
  function cibleAlbum(g: GroupeAlbumsEclates): AlbumEclate | null {
    return g.albums?.reduce<AlbumEclate | null>((m, a) => (!m || a.track_count > m.track_count ? a : m), null) ?? null;
  }
  function cibleArtiste(g: GroupeArtistes): ArtisteHomographe | null {
    return g.artistes?.reduce<ArtisteHomographe | null>((m, a) => (!m || a.albums > m.albums ? a : m), null) ?? null;
  }
  function nomCopie(c: CopieDoublon): string {
    const q = [c.format?.toUpperCase(), c.sample_rate ? `${Math.round(c.sample_rate / 100) / 10} kHz` : null, c.bit_depth ? `${c.bit_depth} bit` : null].filter(Boolean).join(' · ');
    return q || (c.file_path?.split('/').pop() ?? String(c.id));
  }
  /**
   * #1069 — CE QUI A RAPPROCHÉ les deux fiches.
   *
   * Le serveur le dit depuis la v0.9.143 et la v0.9.146
   * (tune-server-rust#3396) ; l'écran n'en montrait rien. Or la décision de
   * fusionner n'est pas la même selon l'indice : « même dossier et même
   * titre » est presque sûr, « même pochette » peut rapprocher deux éditions
   * d'un coffret qu'on veut garder distinctes.
   *
   * Un code inconnu est rendu TEL QUEL plutôt que tu : un serveur plus récent
   * peut en nommer un troisième, et l'utilisateur doit pouvoir le lire.
   */
  function libelleIndice(code: string | undefined | null): string | null {
    if (!code) return null;
    switch (code) {
      case 'dossier_et_titre': return $t('v2.meta.indiceDossierTitre' as any);
      case 'pochette_identique': return $t('v2.meta.indicePochette' as any);
      default: return code;
    }
  }
  function libelleCritere(code: string): string {
    switch (code) {
      case 'fichier_identique': return $t('v2.meta.critereFichier' as any);
      case 'contenu_identique': return $t('v2.meta.critereContenu' as any);
      case 'empreinte_identique': return $t('v2.meta.critereEmpreinte' as any);
      case 'etiquettes_identiques': return $t('v2.meta.critereEtiquettes' as any);
      default: return code;
    }
  }
  /** Deux clics : le premier arme, le second agit — comme la suppression d'une zone. */
  async function agir(cle: string, fn: () => Promise<unknown>) {
    if (arme !== cle) { arme = cle; return; }
    arme = null;
    try { await fn(); await chargerDoublons(); error = null; }
    catch (e: any) { error = e?.message ?? $t('v2.meta.decisionNotSaved' as any); }
  }

  // Onglet « Dynamic Range » (Bertrand, 16/09/2026) : graver dans les
  // fichiers le DR que Tune a CALCULÉ, sous la clé `DYNAMIC RANGE` que le
  // scan relit. L'état vient du serveur seul ; pendant la passe on le relit
  // toutes les deux secondes, et on s'arrête dès qu'il ne dit plus « running ».
  let dr = $state<GravureDrEtat | null>(null);
  let drErr = $state<string | null>(null);
  let drBusy = $state(false);
  let drMinuterie: ReturnType<typeof setTimeout> | null = null;
  async function chargerDr() {
    try { dr = await api.getGravureDr(); drErr = null; }
    catch (e: any) { drErr = e?.message ?? $t('v2.meta.drUnavail' as any); }
    if (dr?.status === 'running') {
      if (drMinuterie) clearTimeout(drMinuterie);
      drMinuterie = setTimeout(chargerDr, 2000);
    }
  }
  async function graverDr() {
    if (drBusy) return;
    drBusy = true;
    try { await api.lancerGravureDr(); drErr = null; }
    catch (e: any) { drErr = e?.message ?? $t('v2.meta.drUnavail' as any); }
    drBusy = false;
    await chargerDr();
  }
  $effect(() => {
    if (tab !== 'dr') return;
    chargerDr();
    return () => { if (drMinuterie) { clearTimeout(drMinuterie); drMinuterie = null; } };
  });

  /*
    Onglet « Compilations » (#1172, Bertrand le 18/09/2026).

    Le cas mesuré sur sa bibliothèque : « Coco María Presents » occupe ONZE
    lignes album, une par artiste de piste, chacune à UNE seule piste. Aucun
    autre écran ne sait les réunir — l'onglet « Doublons » ne les voit pas :
    le détecteur d'albums éclatés rend 27 groupes et AUCUN ne les contient
    (mesuré sur son serveur le 18/09). Il fallait donc un geste à la main.

    Trois actions, dans l'ordre où elles se pensent :
      1. marquer — la base retient le choix tout de suite, et le marqueur
         d'édition manuelle empêche le scan de revenir dessus (serveur #4427) ;
      2. réunir — les lignes n'en font plus qu'une, par la fusion qui existe ;
      3. graver — écrire le drapeau DANS les fichiers. Toujours demandé,
         jamais en effet de bord : Tune ne touche pas aux fichiers en passant.

    Les deux dernières sont armées en deux clics, comme les fusions de
    l'onglet « Doublons » : elles déplacent des pistes ou écrivent sur le
    disque.
  */
  let cpQuery = $state('');
  let cpTous = $state<AlbumDetailed[]>([]);
  let cpLoading = $state(false);
  let cpCharge = false;
  let cpChoisis = $state<Set<number>>(new Set());
  let cpBusy = $state(false);
  let cpBilan = $state<string | null>(null);
  let cpErr = $state<string | null>(null);

  /**
   * 🔴 Le filtre se fait ICI, pas par `?q=` du serveur.
   *
   * `q` cherche dans le TITRE DE PISTE et le NOM D'ARTISTE — jamais dans le
   * titre d'album (`facets.rs` : `t.title LIKE … OR t.artist_id IN (SELECT id
   * FROM artists WHERE name LIKE …)`). Mesuré sur la bibliothèque de Bertrand
   * le 18/09 : 23 albums s'appellent « Coco María Presents… », et `q=Coco` en
   * rendait **2** — plus quelques artistes nommés « Acid Coco ». Exactement le
   * cas pour lequel cet écran existe, et il passait à côté.
   *
   * Il n'y a pas de filtre par titre d'album côté serveur ; en ajouter un est
   * un autre chantier. La liste entière tient largement en mémoire — 4 381
   * albums sur ce serveur — alors on la charge une fois et on filtre ici.
   */
  async function chargerAlbumsCompil() {
    if (cpCharge || cpLoading) return;
    cpLoading = true;
    cpErr = null;
    const tous: AlbumDetailed[] = [];
    try {
      // 2000 est le plafond dur du serveur (`limit.clamp(1, 2000)`), donc on
      // pagine. Sans la boucle on ne verrait que le début de la bibliothèque —
      // c'est ce qui m'a fait compter 11 albums au lieu de 23.
      for (let offset = 0; ; offset += 2000) {
        const r = await api.getAlbumsDetailed({}, 2000, offset);
        const lot = r?.items ?? [];
        tous.push(...lot);
        if (lot.length === 0 || tous.length >= (r?.total ?? 0)) break;
      }
      cpTous = tous;
      cpCharge = true;
    } catch (e: any) {
      cpErr = e?.message ?? $t('v2.meta.compilUnavail' as any);
      cpTous = [];
    }
    cpLoading = false;
  }

  /** Sans accents ni casse : « Coco María » se trouve en tapant « coco maria ». */
  function pliage(s: string): string {
    return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /**
   * Les albums affichés. Le titre D'ABORD, l'artiste ensuite — on cherche une
   * compilation par son nom, et c'est justement l'artiste qui diffère d'une
   * ligne à l'autre.
   */
  let cpAlbums = $derived.by(() => {
    const q = pliage(cpQuery.trim());
    if (q.length < 2) return [];
    return cpTous
      .filter((a) => pliage(a.title ?? '').includes(q) || pliage(a.album_artist ?? '').includes(q))
      .sort((x, y) => (x.title ?? '').localeCompare(y.title ?? '') || (x.album_artist ?? '').localeCompare(y.album_artist ?? ''))
      .slice(0, 300);
  });

  /**
   * Les résultats REGROUPÉS par titre d'album.
   *
   * 🔴 Sans ce regroupement, taper « coco » sortait 23 lignes en vrac — et
   * c'étaient DEUX compilations, « Club Coco ¡AHORA! » et « New Dimensions ».
   * Un « Tout cocher » suivi de « Réunir » les aurait fondues en un seul
   * disque. L'écran doit montrer ce qui va ensemble, pas une liste plate.
   */
  let cpGroupes = $derived.by(() => {
    const par = new Map<string, { titre: string; albums: AlbumDetailed[] }>();
    for (const a of cpAlbums) {
      const cle = pliage(a.title ?? '');
      let g = par.get(cle);
      if (!g) { g = { titre: a.title ?? '—', albums: [] }; par.set(cle, g); }
      g.albums.push(a);
    }
    return [...par.values()].sort(
      (x, y) => y.albums.length - x.albums.length || x.titre.localeCompare(y.titre),
    );
  });

  /** Les titres distincts présents dans la sélection. */
  function titresChoisis(): string[] {
    const t = new Set<string>();
    for (const a of cpTous) if (cpChoisis.has(a.album_id)) t.add(pliage(a.title ?? ''));
    return [...t];
  }

  /**
   * Réunir n'a de sens que DANS un groupe. Une sélection à cheval sur deux
   * titres fondrait deux disques différents — et c'est irréversible.
   */
  let cpMelange = $derived(cpChoisis.size > 0 && titresChoisis().length > 1);

  function cocherGroupe(g: { albums: AlbumDetailed[] }) {
    const ids = g.albums.map((a) => a.album_id);
    const tous = ids.every((id) => cpChoisis.has(id));
    const s = new Set(cpChoisis);
    // Cocher un groupe REMPLACE la sélection : additionner deux groupes est
    // précisément le geste qu'on veut rendre impossible par accident.
    if (tous) { cpChoisis = new Set(); } else { cpChoisis = new Set(ids); }
    void s;
    arme = null;
  }

  // Une sélection qui survivrait au changement de recherche agirait sur des
  // albums qu'on ne voit plus à l'écran.
  $effect(() => {
    cpQuery;
    cpChoisis = new Set();
    arme = null;
  });

  $effect(() => {
    if (tab !== 'compil') return;
    chargerAlbumsCompil();
  });

  function cocher(id: number) {
    const s = new Set(cpChoisis);
    if (s.has(id)) s.delete(id); else s.add(id);
    cpChoisis = s;
    arme = null;
  }


  /* ------------------------------------------------------------------ */
  /* COFFRETS composés À LA MAIN — Bertrand, 20/09/2026                   */
  /* ------------------------------------------------------------------ */
  /**
   * « Par exemple je voudrais créer un coffret pour 101 de Depeche Mode »,
   * capture à l'appui : deux albums, *101 - Disc A* et *101 - Disc B*.
   * « Et je veux l'interface pour le faire (proche de compilations). »
   *
   * 🔴 POURQUOI PAS L'ONGLET COMPILATIONS. Son « Réunir en un seul disque »
   * écrase les disques et renumérote à la suite — c'est ce qu'il faut pour une
   * compilation, et c'est exactement ce qu'il ne faut pas pour un coffret. Ici
   * les disques restent séparés : disque 1, disque 2, …
   *
   * 🔴 POURQUOI PAS LA DÉTECTION AUTOMATIQUE (onglet Doublons). Elle ne lit
   * que des marqueurs CHIFFRÉS et ne groupe que des dossiers FRÈRES : le
   * « Disc A » de Bertrand lui est invisible, deux fois plutôt qu'une.
   *
   * 🔴 UNE LISTE ORDONNÉE, PAS UN ENSEMBLE. Contrairement à Compilations, où
   * l'ordre n'a aucun sens, l'ordre des cases cochées EST l'ordre des disques
   * — c'est le contrat de la route. Un `Set` le perdrait, et l'écran ne
   * pourrait pas le montrer.
   */
  let cfQuery = $state('');
  let cfChoisis = $state<number[]>([]);
  let cfBusy = $state(false);
  let cfBilan = $state<string | null>(null);
  let cfErr = $state<string | null>(null);

  /** Les albums affichés, À PLAT. */
  let cfAlbums = $derived.by(() => {
    const q = pliage(cfQuery.trim());
    if (q.length < 2) return [];
    // 🔴 PAS de regroupement par titre, contrairement à Compilations : les
    // disques d'un coffret portent des titres DIFFÉRENTS (« … Disc A »,
    // « … Disc B »), et les ranger en groupes séparés les éloignerait
    // justement l'un de l'autre. Le tri par titre les met côte à côte.
    return cpTous
      .filter((a) => pliage(a.title ?? '').includes(q) || pliage(a.album_artist ?? '').includes(q))
      .sort((x, y) => (x.title ?? '').localeCompare(y.title ?? ''))
      .slice(0, 300);
  });

  /** Le rang d'un album dans la sélection, ou `0` s'il n'y est pas. */
  function rangCoffret(id: number): number {
    return cfChoisis.indexOf(id) + 1;
  }

  function cocherCoffret(id: number) {
    const i = cfChoisis.indexOf(id);
    // 🔴 Une NOUVELLE liste, pas un `splice` sur le proxy : une référence
    // détachée ne redéclencherait pas le rendu.
    cfChoisis = i === -1 ? [...cfChoisis, id] : cfChoisis.filter((x) => x !== id);
    arme = null;
  }

  // Une sélection qui survivrait au changement de recherche agirait sur des
  // albums qu'on ne voit plus à l'écran — la règle de l'onglet voisin.
  $effect(() => {
    cfQuery;
    cfChoisis = [];
    arme = null;
  });

  $effect(() => {
    if (tab !== 'coffret') return;
    chargerAlbumsCompil();
  });

  /** Réunit les albums cochés en UN coffret, dans l'ordre coché. Deux clics. */
  async function composerCoffret() {
    if (cfChoisis.length < 2 || cfBusy) return;
    if (arme !== 'cf:composer') { arme = 'cf:composer'; return; }
    arme = null;
    cfBusy = true;
    try {
      const r = await api.composerCoffret(cfChoisis);
      cfBilan = $t('v2.meta.boxDone' as any)
        .replace('{count}', String(r.disques))
        .replace('{title}', r.titre ?? '');
      cfErr = null;
      cfChoisis = [];
      // La bibliothèque a changé : la liste en mémoire est périmée.
      cpCharge = false;
      await chargerAlbumsCompil();
    } catch (e: any) {
      cfErr = e?.message ?? $t('v2.meta.compilUnavail' as any);
    }
    cfBusy = false;
  }

  /** Les albums cochés, le plus fourni en tête — l'ordre de lecture naturel. */
  function idsChoisisCiblePremiere(): number[] {
    return cpAlbums
      .filter((a) => cpChoisis.has(a.album_id))
      .sort((x, y) => (y.track_count ?? 0) - (x.track_count ?? 0))
      .map((a) => a.album_id);
  }

  /** Pose ou retire le drapeau sur les albums cochés. */
  async function marquerCompil(valeur: boolean) {
    if (!cpChoisis.size || cpBusy) return;
    const ids = idsChoisisCiblePremiere();
    cpBusy = true;
    try {
      // 🔴 Le drapeau passe par `batch-update`, avec `is_compilation` : c'est
      // la seule porte du serveur livré (0.9.155). Une route
      // `/library/albums/compilation` a existé dans une seconde
      // implémentation de #4427, fermée sans être fusionnée — l'appeler rend
      // 404. Marquer et réunir restent deux gestes distincts, le second armé.
      const r = await api.batchUpdateAlbums(ids, { is_compilation: valeur });
      cpTous = cpTous.map((a) => (ids.includes(a.album_id) ? { ...a, is_compilation: valeur } : a));
      cpBilan = $t('v2.meta.compilMarked' as any).replace('{count}', String(r.updated));
      cpErr = null;
    } catch (e: any) {
      cpErr = e?.message ?? $t('v2.meta.compilUnavail' as any);
    }
    cpBusy = false;
  }

  /** Réunit les albums cochés en un seul disque. Deux clics. */
  async function reunirCompil() {
    if (cpChoisis.size < 2 || cpBusy) return;
    if (arme !== 'cp:reunir') { arme = 'cp:reunir'; return; }
    arme = null;
    const ids = idsChoisisCiblePremiere();
    cpBusy = true;
    try {
      // Deux appels, parce que le serveur livré n'a pas de geste combiné :
      // on pose le drapeau, puis on réunit par la fusion d'albums qui existe
      // depuis longtemps. L'album maître est choisi par le serveur et rendu
      // dans `master_id`.
      await api.batchUpdateAlbums(ids, { is_compilation: true });
      const r = await api.mergeAlbums(ids);
      // 🔴 C2 — la fusion garde l'artiste du disque MAÎTRE. La règle et son
      // pourquoi vivent dans `compilationArtiste.ts`, avec ses épreuves.
      const aPoser = artisteApresFusion(
        cpTous.filter((a) => ids.includes(a.album_id)).map((a) => a.album_artist),
      );
      if (aPoser && r.master_id != null) {
        await api.batchUpdateAlbums([r.master_id], { artist_name: aPoser });
        cpTous = cpTous.map((a) => (a.album_id === r.master_id ? { ...a, album_artist: aPoser } : a));
      }
      cpTous = cpTous.map((a) => (ids.includes(a.album_id) ? { ...a, is_compilation: true } : a));
      cpBilan = $t('v2.meta.compilMerged' as any)
        .replace('{moved}', String(r.tracks_moved))
        .replace('{total}', String(r.total_tracks));
      cpErr = null;
      cpChoisis = new Set();
      cpCharge = false;
      await chargerAlbumsCompil();
    } catch (e: any) {
      cpErr = e?.message ?? $t('v2.meta.compilUnavail' as any);
      cpBusy = false;
      return;
    }
    cpBusy = false;
  }

  /** Grave le drapeau dans les fichiers des albums cochés. Deux clics. */
  async function graverCompil() {
    if (!cpChoisis.size || cpBusy) return;
    if (arme !== 'cp:graver') { arme = 'cp:graver'; return; }
    arme = null;
    const ids = [...cpChoisis];
    cpBusy = true;
    try {
      const b = await api.graverCompilation(ids);
      // `hors_format` n'est pas une erreur : le scan ne relit pas le drapeau
      // dans un WAV ni un DSF, alors le serveur ne l'y écrit pas. Sans ce
      // compte, l'écran annoncerait un « fait » que le prochain scan
      // démentirait.
      cpBilan = $t('v2.meta.compilBurned' as any)
        .replace('{written}', String(b.ecrits ?? 0))
        .replace('{skipped}', String(b.hors_format ?? 0))
        .replace('{failed}', String(b.echecs ?? 0));
      cpErr = null;
    } catch (e: any) {
      cpErr = e?.message ?? $t('v2.meta.compilUnavail' as any);
    }
    cpBusy = false;
  }

  $effect(() => { loadProposals(); });

  // Les albums douteux ne sont chargés qu'à l'ouverture de leur onglet.
  /*
    Onglet « Albums douteux » (#1199).

    Mesuré sur le .18 : 1 595 entrées, et ce ne sont pas des albums mais des
    PISTES — 1 592 pour une seule raison, l'artiste manque. L'information vit
    dans le chemin : `…/Prince/Ultimate/01 - ….m4a`. 1 496 pistes couvertes,
    pour 26 noms distincts.

    On regroupe donc par nom deviné : l'utilisateur valide 26 décisions au lieu
    de 1 496 lignes, et l'intrus se voit tout de suite — sur sa bibliothèque,
    « NEW_FLAC » ressort comme un groupe de douze, qu'il décoche.
  */
  let dRetenus = $state<Set<string>>(new Set());
  let dBusy = $state(false);
  let dBilan = $state<string | null>(null);
  let dGroupes = $derived(grouperParArtisteDevine(doubtful));
  let dSansIndice = $derived(
    doubtful.filter((p) => p.reasons?.includes('missing_artist')).length
      - dGroupes.reduce((n, g) => n + g.pistes.length, 0),
  );

  function basculerGroupe(nom: string) {
    const s = new Set(dRetenus);
    if (s.has(nom)) s.delete(nom); else s.add(nom);
    dRetenus = s;
  }

  /** Pose les artistes retenus : un appel par nom, pas par piste. */
  async function poserArtistesDevines() {
    if (!dRetenus.size || dBusy) return;
    dBusy = true;
    dBilan = null;
    let pistes = 0;
    let noms = 0;
    try {
      for (const g of dGroupes) {
        if (!dRetenus.has(g.nom)) continue;
        const r = await api.setTracksArtist(g.pistes.map((p) => p.id), g.nom);
        pistes += r.updated;
        noms += 1;
      }
      dBilan = $t('v2.meta.dArtistDone' as any)
        .replace('{tracks}', $formatNombre(pistes))
        .replace('{names}', $formatNombre(noms));
      dRetenus = new Set();
      // La liste vient du serveur : on la relit plutôt que de la corriger de
      // mémoire — c'est lui qui décide ce qui est encore douteux.
      dLoaded = false;
      await chargerDouteuses();
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
    dBusy = false;
  }

  async function chargerDouteuses() {
    if (dLoaded) return;
    dLoaded = true;
    dLoading = true;
    const tous: PisteDouteuse[] = [];
    try {
      for (let offset = 0; ; offset += 1000) {
        const r = await api.getDoubtfulTracks(1000, offset);
        tous.push(...r.items);
        if (r.items.length === 0 || tous.length >= r.total) break;
      }
      doubtful = tous;
    } catch {
      error = 'Liste indisponible.';
    }
    dLoading = false;
  }

  $effect(() => {
    if (tab !== 'doubtful' || dLoaded) return;
    void chargerDouteuses();
  });


  async function decide(p: MetadataProposal, accept: boolean) {
    if (busy != null) return;
    busy = p.id;
    try {
      await api.decideMetadataProposal(p.id, accept);
      proposals = proposals.filter((x) => x.id !== p.id);
      pending = Math.max(0, pending - 1);
    } catch { error = $t('v2.meta.decisionNotSaved' as any); }
    busy = null;
  }
  async function toggleAuto() {
    const next = !autoApply;
    autoApply = next;
    try { await api.setMetadataProposalsAutoApply(next); }
    catch { autoApply = !next; error = $t('v2.meta.settingNotSaved' as any); }
  }

  const FIELDS: Record<string, string> = $derived({
    title: $t('v2.lib.sortTitle' as any), artist: $t('v2.lib.sortArtist' as any),
    album: 'Album', genre: $t('v2.fav.facetGenre' as any),
    year: $t('v2.lib.sortYear' as any), label: $t('v2.fav.facetLabel' as any),
    composer: $t('v2.meta.fComposer' as any) });
</script>

<section class="v2-meta tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.meta.eyebrow' as any)}</div>
      <h1>{$t('v2.meta.title' as any)}</h1>
    </div>
    <nav class="tabs v2-actions">
      <button class:on={tab === 'proposals'} onclick={() => (tab = 'proposals')}>{$t('v2.meta.tabProposals' as any)}<span>{$formatNombre(pending)}</span></button>
      <button class:on={tab === 'doubtful'} onclick={() => (tab = 'doubtful')}>{$t('v2.meta.tabDoubtful' as any)}{#if dLoaded}<span>{$formatNombre(doubtful.length)}</span>{/if}</button>
      <button class:on={tab === 'doublons'} onclick={() => (tab = 'doublons')}>{$t('v2.meta.tabDoublons' as any)}{#if dblLoaded && !dblLoading}<span>{$formatNombre(dblAlbums.length + dblArtistes.length + dblPaires.length)}</span>{/if}</button>
      <button class:on={tab === 'genres'} onclick={() => (tab = 'genres')}>{$t('v2.meta.tabGenres' as any)}</button>
      <button class:on={tab === 'dr'} onclick={() => (tab = 'dr')}>{$t('v2.meta.tabDr' as any)}{#if dr}<span>{$formatNombre(dr.a_graver)}</span>{/if}</button>
      <button class:on={tab === 'compil'} onclick={() => (tab = 'compil')}>{$t('v2.meta.tabCompil' as any)}</button>
      <button class:on={tab === 'coffret'} onclick={() => (tab = 'coffret')}>{$t('v2.meta.tabCoffret' as any)}</button>
      <button class:on={tab === 'manquants'} onclick={() => (tab = 'manquants')}>{$t('v2.meta.tabMissing' as any)}</button>
    </nav>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if tab === 'manquants'}
      <!-- Yves, réunion du 17/09/2026 : retrouver pochettes, genres et années
           manquants. Voir `lib/manquantsMetadonnees`. -->
      <ManquantsV2 />
    {:else if tab === 'proposals'}
      <div class="auto">
        <div class="al">
          <span>{$t('v2.meta.autoApply' as any)}</span>
          <span class="hint">{$t('v2.meta.autoApplyHint' as any)}</span>
        </div>
        <label class="sw">
          <input type="checkbox" checked={autoApply} onchange={toggleAuto} />
          <span class="slider"></span>
        </label>
      </div>

      {#if pLoading}
        <div class="state">{$t('v2.meta.loadingProposals' as any)}</div>
      {:else if !proposals.length}
        <div class="state">{$t('v2.meta.noProposal' as any)}</div>
      {:else}
        <p class="note">
          {$t('v2.meta.refuseNoteA' as any)} <b>{$t('v2.meta.refuseNoteBold' as any)}</b>.
        </p>
        <div class="list">
          {#each proposals as p (p.id)}
            <article class="prop">
              <div class="pw">
                <div class="pt">{p.title ?? '—'}{#if p.artist}<em>{p.artist}</em>{/if}</div>
                <div class="pf">{FIELDS[p.field] ?? p.field}</div>
                <div class="diff">
                  <span class="cur">{p.current ?? '—'}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  <span class="new">{p.proposed ?? '—'}</span>
                </div>
                <div class="src">{$formatNombre(p.servers_count)} bibliothèque{p.servers_count > 1 ? 's' : ''} portent cette valeur</div>
              </div>
              <div class="pa">
                <button class="go" disabled={busy === p.id} onclick={() => decide(p, true)}>{$t('v2.meta.accept' as any)}</button>
                <button class="lnk" disabled={busy === p.id} onclick={() => decide(p, false)}>{$t('v2.meta.keepMine' as any)}</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}

    {:else if tab === 'doublons'}
      <!-- #4471 — HORS du `{#if dblLoading}` et hors du « rien à signaler » :
           un coffret mal numéroté n'est pas un doublon, et l'écran doit
           pouvoir le proposer même quand les trois autres listes sont vides. -->
      <!-- Les coffrets ÉCLATÉS, avant les mal numérotés : réunir d'abord,
           renuméroter ensuite. -->
      {#if coffrets.length}
        <div class="dh">{$t('v2.meta.boxTitle' as any)} <span>{$formatNombre(coffrets.length)}</span></div>
        <div class="list">
          {#each coffrets as c (c.cible)}
            <article class="prop grp">
              <div class="pw">
                <div class="pt">{c.titre}</div>
                <div class="pf">{$t('v2.meta.boxDiscs' as any).replace('{n}', String(c.disques.length))}</div>
                <div class="sub">{c.dossier}</div>
                <div class="pa wrap">
                  <button class="lnk" disabled={coffretEnCours != null || c.cible == null}
                    onclick={() => regrouper(c)}>
                    {coffretEnCours === c.cible
                      ? $t('v2.tool.loading' as any)
                      : $t('v2.meta.boxMerge' as any)}
                  </button>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
      {#if disques && disques.albums > 0}
        <div class="dh">{$t('v2.meta.discsTitle' as any)} <span>{$formatNombre(disques.albums)}</span></div>
        <article class="prop grp">
          <div class="pw">
            <div class="pt">{$t('v2.meta.discsWhat' as any)}</div>
            <div class="sub">
              {$t(disques.applique ? 'v2.meta.discsDone' as any : 'v2.meta.discsPreview' as any)
                .replace('{albums}', $formatNombre(disques.albums))
                .replace('{tracks}', $formatNombre(disques.pistes))}
            </div>
            <div class="pf">{$t('v2.meta.discsSafe' as any)}</div>
            {#if !disques.applique}
              <div class="pa wrap">
                <button class="lnk" disabled={disquesEnCours} onclick={reparerDisques}>
                  {disquesEnCours ? $t('v2.tool.loading' as any) : $t('v2.meta.discsFix' as any)}
                </button>
              </div>
            {/if}
          </div>
        </article>
      {/if}
      {#if dblLoading}
        <div class="state">{$t('v2.tool.loading' as any)}</div>
      {:else if !dblAlbums.length && !dblArtistes.length && !dblPaires.length}
        {#if (!disques || disques.albums === 0) && !coffrets.length}
          <div class="state">{$t('v2.meta.noDup' as any)}</div>
        {/if}
      {:else}
        {#if dblAlbums.length}
          <div class="dh">{$t('v2.meta.dupAlbums' as any)} <span>{$formatNombre(dblAlbums.length)}</span></div>
          <div class="list">
            {#each dblAlbums as g, gi (gi)}
              {@const cible = cibleAlbum(g)}
              <article class="prop grp">
                <div class="pw">
                  <div class="pt">{cible?.title ?? '—'}{#if cible?.artist}<em>{cible.artist}</em>{/if}</div>
                  <!-- #1069 — l'indice qui a rapproché les fiches. La décision
                       n'est pas la même selon lui : « même dossier et même
                       titre » est presque sûr, « même pochette » peut
                       rapprocher deux éditions d'un coffret. -->
                  {#if libelleIndice(g.indice)}<div class="pf">{libelleIndice(g.indice)}</div>{/if}
                  <div class="sub">{$t('v2.meta.recoKeep' as any).replace('{name}', `${cible?.title ?? ''} (${cible?.track_count ?? 0})`)}</div>
                  <!-- Les pochettes CÔTE À CÔTE : c'est la comparaison qui
                       tranche, surtout quand c'est la pochette elle-même qui a
                       servi d'indice. Le groupe ne porte pas de `cover_path`
                       (mesuré sur le .18) — `AlbumArt` la résout par l'id. -->
                  <div class="eclv">
                    {#each g.albums ?? [] as a (a.id)}
                      <span class="eclc" class:garde={a.id === cible?.id}
                            title={`${a.title} — ${a.track_count}`}>
                        <AlbumArt coverPath={null} albumId={a.id} size={0} alt={a.title}
                          fallbackInitials={a.title?.slice(0, 1)} />
                      </span>
                    {/each}
                  </div>
                  <div class="pa wrap">
                    {#each (g.albums ?? []).filter((a) => a.id !== cible?.id) as a (a.id)}
                      <button class="lnk" class:armed={arme === `album:${a.id}`} onclick={() => cible && agir(`album:${a.id}`, () => api.absorbAlbum(cible.id, a.id))}>
                        {arme === `album:${a.id}` ? $t('v2.meta.confirm' as any) : $t('v2.meta.regroupIn' as any).replace('{name}', `${a.title} (${a.track_count})`)}
                      </button>
                    {/each}
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
        {#if dblArtistes.length}
          <div class="dh">{$t('v2.meta.dupArtists' as any)} <span>{$formatNombre(dblArtistes.length)}</span></div>
          <div class="list">
            {#each dblArtistes as g (g.cle)}
              {@const cible = cibleArtiste(g)}
              <article class="prop grp">
                <div class="pw">
                  <div class="pt">{cible?.name ?? g.cle}</div>
                  {#if g.mbid_distincts}<div class="sub">{$t('v2.meta.mbidDistinct' as any)}</div>{/if}
                  <div class="pa wrap">
                    {#each (g.artistes ?? []).filter((x) => x.id !== cible?.id) as x (x.id)}
                      <button class="lnk" class:armed={arme === `artiste:${x.id}`} disabled={!!g.mbid_distincts} onclick={() => cible && agir(`artiste:${x.id}`, () => api.absorbArtist(cible.id, x.id))}>
                        {arme === `artiste:${x.id}` ? $t('v2.meta.confirm' as any) : $t('v2.meta.absorbIn' as any).replace('{name}', `${x.name} (${x.albums})`)}
                      </button>
                    {/each}
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
        {#if dblPaires.length}
          <div class="dh">{$t('v2.meta.dupTracks' as any)} <span>{$formatNombre(dblPaires.length)}</span></div>
          <div class="list">
            {#each dblPaires as p, pi (pi)}
              <article class="prop grp">
                <div class="pw">
                  <div class="pt">{p.a.title ?? '—'}{#if p.a.artist_name}<em>{p.a.artist_name}</em>{/if}</div>
                  <div class="pf">{libelleCritere(p.critere)}</div>
                  <div class="sub">A · {nomCopie(p.a)} — B · {nomCopie(p.b)}</div>
                  {#if p.recommandation?.garder != null}
                    <div class="sub">{$t('v2.meta.recoKeep' as any).replace('{name}', p.recommandation.garder === p.a.id ? 'A' : 'B')}</div>
                  {/if}
                  <div class="pa wrap">
                    <button class="lnk" class:armed={arme === `piste:${p.a.id}:${p.b.id}`} onclick={() => agir(`piste:${p.a.id}:${p.b.id}`, () => api.resolveTrackDuplicate(p.a.id, p.b.id))}>
                      {arme === `piste:${p.a.id}:${p.b.id}` ? $t('v2.meta.confirm' as any) : $t('v2.meta.keepThis' as any).replace('{name}', 'A')}
                    </button>
                    <button class="lnk" class:armed={arme === `piste:${p.b.id}:${p.a.id}`} onclick={() => agir(`piste:${p.b.id}:${p.a.id}`, () => api.resolveTrackDuplicate(p.b.id, p.a.id))}>
                      {arme === `piste:${p.b.id}:${p.a.id}` ? $t('v2.meta.confirm' as any) : $t('v2.meta.keepThis' as any).replace('{name}', 'B')}
                    </button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      {/if}

    {:else if tab === 'genres'}
      <!--
        L'arbre des genres, demandé par Bertrand le 03/09/2026 en troisième
        onglet.

        Il vient du client actuel, sans modification. Le conteneur redéfinit les
        sept variables `--tune-*` qu'il utilise à partir de la palette `--v2-*` :
        c'est ce qui l'accorde à cet écran sans toucher une ligne du composant,
        ni le figer dans une seule apparence. Sans cela, il aurait été un îlot
        à l'ancien thème au milieu du nouveau.
      -->
      <div class="gt-v2">
        <GenreTreeView />
      </div>

    {:else if tab === 'dr'}
      <!--
        Graver le Dynamic Range (Bertrand, 16/09/2026). Tune calcule le DR
        dans la passe ReplayGain et ne le garde qu'en base ; ce bouton l'écrit
        dans les fichiers sous `DYNAMIC RANGE`, la clé que le scan RELIT — et
        que foobar2000 lit aussi. Seuls les conteneurs relus (FLAC, Ogg, Opus)
        sont gravés ; les autres sont comptés, pas touchés. Un fichier qui
        porte déjà la clé n'est jamais réécrit : le tag du disque fait foi.
      -->
      {#if !dr && !drErr}
        <div class="state">{$t('v2.tool.loading' as any)}</div>
      {:else if drErr && !dr}
        <div class="state">{drErr}</div>
      {:else if dr}
        <div class="auto">
          <div class="al">
            <span>{$t('v2.meta.drEngrave' as any)}</span>
            <span class="hint">{$t('v2.meta.drHint' as any)}</span>
          </div>
          <button class="go" disabled={drBusy || dr.status === 'running' || dr.a_graver === 0} onclick={graverDr}>
            {dr.status === 'running' ? $t('v2.meta.drRunning' as any) : $t('v2.meta.drEngraveBtn' as any)}
          </button>
        </div>
        <div class="drgrid">
          <div class="drk"><b>{$formatNombre(dr.a_graver)}</b><span>{$t('v2.meta.drToEngrave' as any)}</span></div>
          <div class="drk"><b>{$formatNombre(dr.dans_les_fichiers)}</b><span>{$t('v2.meta.drInFiles' as any)}</span></div>
          <div class="drk"><b>{$formatNombre(dr.hors_format)}</b><span>{$t('v2.meta.drOtherFormats' as any)}</span></div>
        </div>
        {#if dr.status === 'running'}
          <p class="note">{$t('v2.meta.drProgress' as any).replace('{done}', $formatNombre((dr.written ?? 0) + (dr.already ?? 0) + (dr.skipped ?? 0) + (dr.errors ?? 0))).replace('{total}', $formatNombre(dr.total ?? 0))}</p>
        {:else if dr.status === 'done'}
          <p class="note">{$t('v2.meta.drDone' as any).replace('{written}', $formatNombre(dr.written ?? 0)).replace('{already}', $formatNombre(dr.already ?? 0)).replace('{skipped}', $formatNombre(dr.skipped ?? 0)).replace('{errors}', $formatNombre(dr.errors ?? 0))}</p>
        {:else if dr.a_graver === 0}
          <p class="note">{$t('v2.meta.drNothing' as any)}</p>
        {/if}
        {#if drErr}<div class="errline">{drErr}</div>{/if}
      {/if}

    {:else if tab === 'compil'}
      <p class="note">{$t('v2.meta.compilIntro' as any)}</p>
      <div class="cpbar">
        <!-- Filtre au fil de la frappe : la liste est déjà en mémoire, il n'y a
             rien à attendre. -->
        <input
          class="cpq"
          type="search"
          placeholder={$t('v2.meta.compilSearch' as any)}
          bind:value={cpQuery}
        />
      </div>

      {#if cpLoading}
        <div class="state">{$t('v2.tool.loading' as any)}</div>
      {:else if !cpAlbums.length}
        <div class="state">{cpQuery.trim().length < 2 ? $t('v2.meta.compilStart' as any) : $t('v2.meta.compilNone' as any)}</div>
      {:else}
        <div class="cpacts">
          <button class="lnk" onclick={() => { cpChoisis = new Set(); arme = null; }} disabled={!cpChoisis.size}>
            {$t('v2.meta.compilNoneSel' as any)}
          </button>
          <button class="go" onclick={() => marquerCompil(true)} disabled={cpBusy || !cpChoisis.size}>
            {$t('v2.meta.compilMark' as any)} ({cpChoisis.size})
          </button>
          <button class="lnk" onclick={() => marquerCompil(false)} disabled={cpBusy || !cpChoisis.size}>
            {$t('v2.meta.compilUnmark' as any)}
          </button>
          <button class="lnk" class:armed={arme === 'cp:reunir'} onclick={reunirCompil} disabled={cpBusy || cpChoisis.size < 2 || cpMelange}>
            {arme === 'cp:reunir' ? $t('v2.meta.confirm' as any) : $t('v2.meta.compilMerge' as any)}
          </button>
          <button class="lnk" class:armed={arme === 'cp:graver'} title={$t('v2.meta.compilBurnHint' as any)} onclick={graverCompil} disabled={cpBusy || !cpChoisis.size}>
            {arme === 'cp:graver' ? $t('v2.meta.confirm' as any) : $t('v2.meta.compilBurn' as any)}
          </button>
        </div>
        {#if cpMelange}<p class="note avert">{$t('v2.meta.compilMixed' as any)}</p>{/if}
        {#if cpBilan}<p class="note">{cpBilan}</p>{/if}
        {#if cpErr}<div class="errline">{cpErr}</div>{/if}
        {#each cpGroupes as g (g.titre)}
          <div class="cpgh">
            <span class="cpgt">{g.titre}</span>
            <span class="cpgn">{$t('v2.meta.compilGroup' as any).replace('{count}', $formatNombre(g.albums.length))}</span>
            <button class="lnk sm" onclick={() => cocherGroupe(g)}>
              {g.albums.every((a) => cpChoisis.has(a.album_id)) ? $t('v2.meta.compilNoneSel' as any) : $t('v2.meta.compilSelectGroup' as any)}
            </button>
          </div>
          <div class="list">
            {#each g.albums as a (a.album_id)}
              <label class="prop cprow">
                <input type="checkbox" checked={cpChoisis.has(a.album_id)} onchange={() => cocher(a.album_id)} />
                <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.album_id} size={0} alt={a.title ?? ''} fallbackInitials={a.title?.slice(0,1)} /></span>
                <span class="pw">
                  <span class="pt">{a.album_artist ?? '—'}</span>
                  <span class="sub">
                    {$t('v2.meta.compilTracks' as any).replace('{count}', $formatNombre(a.track_count))}
                    {#if a.is_compilation}<span class="cpflag">{$t('v2.album.compilation' as any)}</span>{/if}
                  </span>
                </span>
              </label>
            {/each}
          </div>
        {/each}
      {/if}

    {:else if tab === 'coffret'}
      <p class="note">{$t('v2.meta.boxIntro' as any)}</p>
      <div class="cpbar">
        <input
          class="cpq"
          type="search"
          placeholder={$t('v2.meta.compilSearch' as any)}
          bind:value={cfQuery}
        />
      </div>

      {#if cpLoading}
        <div class="state">{$t('v2.tool.loading' as any)}</div>
      {:else if !cfAlbums.length}
        <div class="state">{cfQuery.trim().length < 2 ? $t('v2.meta.compilStart' as any) : $t('v2.meta.compilNone' as any)}</div>
      {:else}
        <div class="cpacts">
          <button class="lnk" onclick={() => { cfChoisis = []; arme = null; }} disabled={!cfChoisis.length}>
            {$t('v2.meta.compilNoneSel' as any)}
          </button>
          <button class="go" class:armed={arme === 'cf:composer'} onclick={composerCoffret} disabled={cfBusy || cfChoisis.length < 2}>
            {arme === 'cf:composer' ? $t('v2.meta.confirm' as any) : $t('v2.meta.boxCompose' as any)} ({cfChoisis.length})
          </button>
        </div>
        <p class="note">{$t('v2.meta.boxOrder' as any)}</p>
        {#if cfBilan}<p class="note">{cfBilan}</p>{/if}
        {#if cfErr}<div class="errline">{cfErr}</div>{/if}
        <div class="list">
          {#each cfAlbums as a (a.album_id)}
            {@const rang = rangCoffret(a.album_id)}
            <label class="prop cprow">
              <input type="checkbox" checked={rang > 0} onchange={() => cocherCoffret(a.album_id)} />
              <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.album_id} size={0} alt={a.title ?? ''} fallbackInitials={a.title?.slice(0,1)} /></span>
              <span class="pw">
                <span class="pt">{a.title ?? '—'}</span>
                <span class="sub">
                  {a.album_artist ?? '—'} ·
                  {$t('v2.meta.compilTracks' as any).replace('{count}', $formatNombre(a.track_count))}
                </span>
              </span>
              <!-- Le RANG, visible : c'est le numéro de disque que l'album
                   portera. Sans lui, l'ordre de la sélection serait une règle
                   invisible, et l'utilisateur découvrirait son coffret après
                   coup. -->
              {#if rang > 0}
                <span class="cfrang">{$t('v2.meta.boxDisc' as any).replace('{n}', String(rang))}</span>
              {/if}
            </label>
          {/each}
        </div>
      {/if}

    {:else if dLoading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if !doubtful.length}
      <div class="state">{$t('v2.meta.noDoubtful' as any)}</div>
    {:else}
      <p class="note">{$t('v2.meta.dArtistIntro' as any).replace('{count}', $formatNombre(doubtful.length))}</p>

      {#if dGroupes.length}
        <div class="cpacts">
          <button class="go" disabled={dBusy || !dRetenus.size} onclick={poserArtistesDevines}>
            {$t('v2.meta.dArtistApply' as any).replace('{count}', $formatNombre(
              dGroupes.filter((g) => dRetenus.has(g.nom)).reduce((n, g) => n + g.pistes.length, 0),
            ))}
          </button>
          <button class="lnk" disabled={dBusy} onclick={() => (dRetenus = new Set(dGroupes.map((g) => g.nom)))}>
            {$t('v2.meta.dArtistAll' as any).replace('{count}', $formatNombre(dGroupes.length))}
          </button>
          <button class="lnk" disabled={dBusy || !dRetenus.size} onclick={() => (dRetenus = new Set())}>
            {$t('v2.miss.selectNone' as any)}
          </button>
        </div>
        {#if dBilan}<p class="note">{dBilan}</p>{/if}

        <div class="list">
          {#each dGroupes as g (g.nom)}
            <label class="prop cprow">
              <input type="checkbox" checked={dRetenus.has(g.nom)} onchange={() => basculerGroupe(g.nom)} />
              <span class="pw">
                <span class="pt">{g.nom}</span>
                <span class="sub">
                  {$t('v2.meta.dArtistTracks' as any).replace('{count}', $formatNombre(g.pistes.length))}
                  <!-- Le chemin d'une piste du groupe : c'est lui qui justifie
                       le nom, et il doit se lire avant de cocher. -->
                  <span class="chemin">{g.pistes[0]?.file_path ?? ''}</span>
                </span>
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if dSansIndice > 0}
        <p class="source">{$t('v2.meta.dArtistNoClue' as any).replace('{count}', $formatNombre(dSansIndice))}</p>
      {/if}
    {/if}

    <!-- Pas de bouton « ouvrir l'éditeur » : la vue `metadata` est CET écran
         désormais, un lien y renverrait sur lui-même. On dit où c'est, sans
         promettre un raccourci qui tourne en rond. -->
    {#if tab !== 'genres'}
      <p class="foot">{$t('v2.meta.foot' as any).replace('{p}', $t('v2.nav.processing' as any))}</p>
    {/if}
  </div>
</section>

<style>
  /*
    Habillage de l'arbre des genres repris du client actuel.

    Il n'utilise que SEPT variables `--tune-*` — je les ai comptées. Les
    redéfinir ici depuis la palette `--v2-*` l'accorde à cet écran sans
    modifier une ligne du composant : il reste utilisable tel quel dans le
    client actuel, où ces variables gardent leurs valeurs d'origine.

    `--tune-accent-rgb` est un TRIPLET, pas une couleur : il sert dans des
    `rgba(var(...), .15)`. La palette v2 n'en publie aucun ; on garde donc la
    valeur de repli du composant plutôt que d'inventer une conversion qui
    casserait au premier changement de thème.
  */
  .gt-v2{
    --tune-bg: var(--v2-bg);
    --tune-surface: var(--v2-surface);
    --tune-text: var(--v2-txt);
    --tune-text-muted: var(--v2-txt3);
    --tune-border: var(--v2-line2);
    --tune-accent: var(--v2-acc1);
    font-family: var(--v2-sans);
  }
  .v2-meta{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .tabs{display:flex; gap:4px}
  .tabs button{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill)}
  .tabs button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .tabs button.on span{color:var(--v2-on-acc); opacity:.75}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  /* Onglet « Compilations » (#1172). */
  .cpbar{display:flex; gap:8px; align-items:center; margin:0 0 14px}
  .cpq{flex:1 1 auto; min-width:0; height:34px; padding:0 12px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt);
    font:12.5px var(--v2-sans)}
  .cpq:focus{outline:none; border-color:var(--v2-acc2)}
  .cpacts{display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 12px}
  /* En-tête de groupe : le titre porte le regroupement, la ligne ne répète
     donc que l'artiste — c'est lui qui change d'une ligne à l'autre. */
  .cpgh{display:flex; align-items:baseline; gap:10px; margin:16px 0 6px; flex-wrap:wrap}
  .cpgt{font:600 13.5px var(--v2-sans); color:var(--v2-txt)}
  .chemin{display:block; margin-top:2px; font:10.5px var(--v2-mono); color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:rtl; text-align:left}
  .cpgn{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .note.avert{color:var(--v2-acc-tint)}
  /* Armé = le prochain clic agit. `.grp .lnk.armed` ne porte pas jusqu'ici :
     ces boutons ne sont pas dans une carte de groupe. */
  .cpacts .lnk.armed{font-weight:700; border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .cprow{cursor:pointer}
  .cprow input{flex:0 0 auto; accent-color:var(--v2-acc2)}
  .cprow .cv{flex:0 0 auto; width:40px; height:40px; border-radius:6px; overflow:hidden}
  .cprow .pt{display:block}
  /* Le drapeau déjà posé, dit à côté du compte de pistes : sans lui, marquer
     agit sans qu'on voie sur quoi. On n'affiche QUE le positif — voir
     PastilleCompilation. */
  .cfrang{margin-left:auto; font:600 11px var(--v2-sans); color:var(--v2-acc1);
    border:1px solid var(--v2-acc1); border-radius:var(--v2-r-pill); padding:2px 9px; white-space:nowrap}
  .cpflag{margin-left:8px; padding:1px 7px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-acc2); color:var(--v2-acc-tint);
    font:700 9.5px var(--v2-mono); letter-spacing:.06em; text-transform:uppercase}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .note{padding:4px 0 16px; font-size:12.5px; color:var(--v2-txt3)}
  .note b{color:var(--v2-txt2)}

  .auto{display:flex; align-items:center; justify-content:space-between; gap:22px; padding:14px 18px;
    border-radius:13px; border:1px solid var(--v2-line); background:var(--v2-surface2); margin-bottom:18px}
  .al{display:flex; flex-direction:column; gap:4px}
  .al span:first-child{font-size:13.5px; font-weight:600}
  .hint{font-size:11.5px; color:var(--v2-txt3)}
  .sw{position:relative; width:44px; height:25px; cursor:pointer; flex:0 0 auto}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}

  .list{display:flex; flex-direction:column; gap:9px}
  .prop{display:flex; align-items:center; gap:20px; padding:14px 18px; border-radius:12px;
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .pw{flex:1; min-width:0}
  .pt{font-size:14px; font-weight:700; display:flex; gap:9px; align-items:baseline}
  .pt em{font:11.5px var(--v2-sans); font-style:normal; color:var(--v2-txt3)}
  .pf{margin-top:4px; font:9.5px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--v2-acc2)}
  /* #1069 — les pochettes du groupe, côte à côte. Celle qu'on GARDE est
     soulignée : c'est la fiche qui absorbera les autres, et rien ne la
     distinguait des autres vignettes. */
  .eclv{display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 4px}
  .eclc{width:56px; height:56px; border-radius:6px; overflow:hidden; flex:0 0 auto;
    border:2px solid transparent}
  .eclc.garde{border-color:var(--v2-acc1)}
  .diff{margin-top:8px; display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .diff svg{width:15px; height:15px; color:var(--v2-txt3); flex:0 0 auto}
  .cur{font-size:13px; color:var(--v2-txt3); text-decoration:line-through}
  .new{font-size:13px; font-weight:600; color:var(--v2-acc-tint)}
  .src{margin-top:7px; font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .pa{display:flex; gap:8px; flex:0 0 auto}
  .pa.wrap{flex-wrap:wrap; margin-top:8px}
  .drgrid{display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin-bottom:14px}
  .drk{display:flex; flex-direction:column; gap:3px; padding:12px 16px; border-radius:12px;
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .drk b{font:600 20px var(--v2-sans); color:var(--v2-txt); font-variant-numeric:tabular-nums}
  .drk span{font-size:11.5px; color:var(--v2-txt3)}
  .errline{margin-top:10px; font-size:12.5px; color:var(--v2-danger)}
  .dh{margin:18px 0 8px; font:9.5px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--v2-txt3)}
  .dh span{margin-left:6px; opacity:.7}
  .sub{margin-top:4px; font-size:12px; color:var(--v2-txt3)}
  .grp .lnk.armed{font-weight:700}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:7px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .go:disabled,.lnk:disabled{opacity:.45; cursor:default}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}

  .dgrid{display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px}
  .dcard{display:flex; gap:14px; padding:12px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .dcard .cv{width:64px; height:64px; flex:0 0 auto; border-radius:8px; overflow:hidden}
  .dm{min-width:0}
  .dt{font-size:13.5px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .da{margin-top:3px; font-size:11.5px; color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .drs{margin-top:8px; display:flex; gap:5px; flex-wrap:wrap}
  .r{font:9.5px var(--v2-mono); color:var(--v2-danger); border:1px solid var(--v2-danger-bd);
    border-radius:999px; padding:2px 8px}

  .foot{margin-top:24px; font-size:12.5px; line-height:1.6; color:var(--v2-txt3); max-width:70ch}
  .foot b{color:var(--v2-txt2)}
  .foot code{font:11px var(--v2-mono); color:var(--v2-acc2)}
</style>
