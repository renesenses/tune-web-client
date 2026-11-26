<script lang="ts">
  /**
   * TESS — Tune Engine for Sound Shaping (lot W1, maquette A1).
   *
   * Deux colonnes : le chemin du signal à gauche (`CheminTess`), le greffon
   * choisi à droite (`ReglagesGreffonTess`).
   *
   * Refonte rc14 (retours de Rémi, GO de Bertrand du 25/11, spécification
   * `coordination/spec-refonte-ux-tess-rc14.md`, lot 2) :
   *   - plus de sélecteur de zone : l'écran règle la zone COURANTE (choisie en
   *     bas à droite) et la suit ;
   *   - « Apply changes » est un interrupteur de l'en-tête ;
   *   - les préréglages sont à droite de « Signal path » (surcouche fermée
   *     après un Save ou un Load réussi) ;
   *   - l'ouverture peut demander un greffon (`greffonTessDemande`, contrat
   *     `stores/tessOuverture.ts`) : il est sélectionné s'il est dans la chaîne ;
   *   - l'étage Headroom se règle dans le panneau de droite.
   *
   * 🔴 CACHÉ sans la capacité serveur : l'entrée de la barre et la pastille
   * de la barre de lecture n'existent que si `GET /zones/{id}/tess` répond
   * selon le contrat. Ouvert par son adresse sur un serveur sans TESS, la
   * coquille revient à l'accueil dès que la capacité vaut `non` ; en attendant,
   * l'écran le dit et ne montre rien d'autre. Les préréglages ne sont lus
   * qu'une fois la capacité confirmée.
   *
   * Préréglages (lot W4, maquette A2, routes T17) : le bouton « Préréglage »
   * de l'en-tête ouvre le panneau `PreReglagesTess` (charger, enregistrer la
   * chaîne courante, renommer, supprimer, mode d'application). Charger passe
   * par la route du serveur, qui marque le préréglage « ACTIVE » pour la zone
   * et dit ce qui ne s'applique pas sur cette sortie.
   *
   * Chaque geste envoie la chaîne entière (`PUT /zones/{id}/tess`) et
   * l'écran se redessine depuis la RÉPONSE : l'ordre affiché est toujours
   * celui que le serveur a résolu (Q9), jamais une supposition locale.
   */
  import { untrack } from 'svelte';
  import { t } from '../../../lib/i18n';
  import * as api from '../../../lib/api';
  import { zones, currentZoneId } from '../../../lib/stores/zones';
  import { activeView, type View } from '../../../lib/stores/navigation';
  import { isPremium } from '../../../lib/stores/license';
  import { capaciteTess } from '../../../lib/stores/tess';
  import {
    contratCompris, basculerGreffon, retirerGreffon, ajouterGreffon, deplacerGreffon, avecBypassAll,
    conflitExclusif, descripteur, liensDe, libelleOuRepli, cleExclusivite,
    nomDuPreReglage,
    type ReponseTessZone, type ChaineTess, type RefusTess, type PreReglagesTess, type NonAppliqueTess,
  } from '../../../lib/tess';
  import { avecReglages, vueReglagesAvances, motifDuVerrou, paquetAInstaller } from '../../../lib/tessPanneaux';
  import PanneauPreReglages from './PreReglagesTess.svelte';
  import CheminTess from './CheminTess.svelte';
  import ReglagesGreffonTess from './ReglagesGreffonTess.svelte';
  import PanneauHeadroomTess from './PanneauHeadroomTess.svelte';
  import InterrupteurTess from './InterrupteurTess.svelte';
  import { greffonTessDemande, ouvrirPopupConfiguration } from '../../../lib/stores/tessOuverture';
  import {
    FACADES_EGALISEUR, FACADES_SERIE, SELECTION_HEADROOM, bornesGain, chaineAvecAncienPreReglage, genrePanneau,
    voiesQuiArrivent, bornesEnceintes,
    headroomDe, avecHeadroom, type HeadroomTess,
  } from '../../../lib/tessPanneaux';
  import '../../../styles/tune-v2.css';
  // rc14 — la cible du suréchantillonnage (PCM ou DSD), réglée depuis l'étage fixe.
  import PanneauSurechantillonnageTess from './PanneauSurechantillonnageTess.svelte';
  import {
    SELECTION_SURECHANTILLONNAGE, ID_SURECHANTILLONNAGE, avecUpsampling, cleMotifDsd, type UpsamplingTess,
  } from '../../../lib/tessDsd';
  import { v2SettingsTarget } from '../../../lib/stores/v2SettingsNav';

  const tr = (k: string) => $t(k as any);

  let zoneId = $state<number | null>(null);
  let reponse = $state<ReponseTessZone | null>(null);
  let chargement = $state(false);
  let absent = $state(false);
  let occupe = $state(false);
  let message = $state<string | null>(null);
  let selection = $state<string | null>(null);
  let preReglages = $state<PreReglagesTess | null>(null);
  let panneauPreReglages = $state(false);
  let avis = $state<string | null>(null);
  /** Droits par greffon publiés par le serveur (`GET /tess/catalog`) ; `null` : serveur ancien. */
  let droits = $state<api.DroitsTess>(null);

  // Refonte rc14 : la zone de l'écran EST la zone courante (bas à droite).
  // Un geste en attente part quand même à la zone où il a eu lieu.
  $effect(() => {
    const z = $currentZoneId;
    if (z != null && z !== zoneId) {
      if (zoneId != null) selection = null;
      zoneId = z;
    }
  });

  // Refonte rc14 (demande 2) : ouvert depuis le chemin du signal, l'écran
  // sélectionne le greffon (ou l'étage Headroom) demandé, s'il est là.
  $effect(() => {
    const id = $greffonTessDemande;
    if (id == null || !reponse || reponse.zone_id !== zoneId) return;
    greffonTessDemande.set(null);
    if (id === 'headroom' || id === SELECTION_HEADROOM) selection = SELECTION_HEADROOM;
    else if (liensDe(reponse.chain).some((l) => l.id === id)) selection = id;
    // Absent de la chaîne : l'écran s'ouvre SANS sélection (rien n'est créé).
    else selection = null;
  });

  let jeton = 0;
  async function charger(id: number) {
    const moi = ++jeton;
    chargement = true;
    message = null;
    avis = null;
    try {
      const r = await api.getTessZone(id);
      if (moi !== jeton) return;
      if (r.ok && contratCompris(r.reponse)) {
        reponse = r.reponse;
        absent = false;
        capaciteTess.set('oui');
      } else if (r.ok || 'absent' in r) {
        reponse = null;
        absent = true;
        capaciteTess.set('non');
      } else if ('zoneInconnue' in r) {
        // La zone a disparu : TESS reste annoncé, on le dit sans rien cacher.
        reponse = null;
        message = tr('tess.zoneNotFound');
      } else {
        message = texteRefus(r.refus);
      }
    } catch {
      if (moi === jeton) message = tr('tess.loadError');
    } finally {
      if (moi === jeton) chargement = false;
    }
  }

  $effect(() => { if (zoneId != null) void charger(zoneId); });
  // `GET /tess/presets` seulement sur un serveur qui annonce TESS (pas de 404
  // inutile face à un rc12 ou rc13), et une seule fois.
  let preReglagesDemandes = false;
  $effect(() => {
    if ($capaciteTess !== 'oui' || preReglagesDemandes) return;
    preReglagesDemandes = true;
    void api.getTessPresets().then((p) => { preReglages = p; });
  });

  // Les droits viennent du serveur : relus quand TESS est annoncé, et à chaque
  // changement de licence locale (le serveur a pu changer d'avis lui aussi).
  let jetonDroits = 0;
  $effect(() => {
    if ($capaciteTess !== 'oui') return;
    void $isPremium;
    const moi = ++jetonDroits;
    api.getTessCatalogue()
      .then((c) => { if (moi === jetonDroits) droits = c ? c.droits : null; })
      .catch(() => { /* panne : les droits connus restent */ });
  });
  const verrouDe = (id: string) => motifDuVerrou(id, droits, reponse?.catalog, $isPremium);
  /** Le motif du verrou, en clair, ou `null`. */
  function texteVerrou(id: string): string | null {
    const m = verrouDe(id);
    if (m === 'plugin_not_installed') return tr('tess.pluginNotInstalled');
    if (m === 'plugin_unavailable') return tr('tess.pluginUnavailable').replace('{name}', nom(id));
    if (m === 'premium_required') return tr('tess.premiumRequired').replace('{name}', nom(id));
    return null;
  }

  /**
   * rc14 — « Installer » : un greffon facultatif pas encore installé (base
   * neuve). `POST /plugins/{paquet}/install`, puis le catalogue et la zone
   * sont relus : le greffon devient disponible sans redémarrage. Un refus
   * (droits, administrateur) est dit tel quel, sans rien casser.
   */
  let installation = $state<string | null>(null);

  // rc14 (recette .18) : un refus s'affiche en haut de l'écran ; on l'amène
  // sous les yeux, sinon il passe inaperçu sous le chemin du signal.
  $effect(() => {
    if (!message) return;
    setTimeout(() => {
      const el = document.querySelector('[data-tess-message]') as HTMLElement | null;
      el?.scrollIntoView?.({ block: 'nearest' });
    }, 0);
  });
  async function installer(id: string, paquetDeLEtape: string | null = null) {
    // Un greffon : le paquet que nomme le catalogue. L'étage fixe de
    // suréchantillonnage : celui que nomme son étape (`params.install_package`).
    const paquet = paquetDeLEtape ?? paquetAInstaller(id, droits);
    if (!paquet || installation) return;
    installation = id;
    message = null;
    try {
      await api.installPlugin(paquet);
      const moi = ++jetonDroits;
      const c = await api.getTessCatalogue().catch(() => null);
      if (moi === jetonDroits && c) droits = c.droits;
      if (zoneId != null) await charger(zoneId);
      // Installé, mais le catalogue n'a pas pu être relu : le dire, sinon le
      // bouton resterait là sans explication.
      if (!c && !message) message = tr('tess.installedReload');
    } catch (e: any) {
      message = e?.status === 401 || e?.status === 403
        ? tr('tess.installForbidden')
        : tr('tess.installError').replace('{detail}', typeof e?.message === 'string' ? e.message : '');
    } finally {
      installation = null;
    }
  }

  const nom = (id: string) =>
    libelleOuRepli(tr(`tess.plugin.${id}`), `tess.plugin.${id}`, descripteur(reponse?.catalog, id)?.name ?? id);

  function texteRefus(r: RefusTess): string {
    // rc14 — cible DSD que la sortie ne prend pas (409) : le motif précis, en clair.
    if (r.code === 'dsd_not_supported_by_output' || r.code === 'dsd_mode_not_enabled') {
      const motifDsd = r.code === 'dsd_mode_not_enabled' ? r.code : (r.reason ?? r.detail);
      return tr('tess.refusal.dsd_not_supported_by_output').replace('{reason}', tr(cleMotifDsd(motifDsd)));
    }
    // rc14 — 402 sans greffon nommé : c'est le suréchantillonnage qui est Premium.
    if (r.code === 'premium_required' && !r.plugin_id) {
      return tr('tess.refusal.premium_required').replace('{name}', tr('tess.step.upsampling'));
    }
    // rc14 — le refus d'exclusivité des égaliseurs a sa phrase (celle du
    // crossfeed nommerait Crossfeed, Crossfeed Pro et Crosstalk).
    const code = r.code === 'mutually_exclusive' && r.plugin_id && FACADES_EGALISEUR.has(r.plugin_id)
      ? 'mutually_exclusive_equalizer'
      : r.code;
    const base = libelleOuRepli(tr(`tess.refusal.${code}`), `tess.refusal.${code}`, r.detail || tr('tess.refusal.generic'));
    return base.replace('{name}', r.plugin_id ? nom(r.plugin_id) : '');
  }

  /** Rend `true` si le serveur a accepté la chaîne (et que la zone n'a pas changé). */
  async function envoyer(chaine: ChaineTess | null, zone: number | null = zoneId, garder = false): Promise<boolean> {
    if (!chaine || zone == null || occupe) return false;
    occupe = true;
    if (!garder) message = null;
    try {
      const r = await api.putTessZone(zone, chaine);
      // Réponse d'une zone quittée entre-temps : enregistrée, mais l'écran
      // montre déjà une autre zone.
      if (zone !== zoneId) return false;
      if (r.ok) { reponse = r.reponse; return true; }
      if ('refus' in r) {
        message = texteRefus(r.refus);
        // rc14 — le 409 DSD porte les capacités à jour de la sortie : l'écran les reprend.
        if (r.refus.dsd_capabilities && reponse) reponse = { ...reponse, dsd_capabilities: r.refus.dsd_capabilities };
      } else if ('zoneInconnue' in r) { reponse = null; message = tr('tess.zoneNotFound'); }
      else { absent = true; capaciteTess.set('non'); }
    } catch {
      message = tr('tess.saveError');
    } finally {
      occupe = false;
    }
    return false;
  }

  function basculer(id: string, actif: boolean) {
    if (!reponse) return;
    const autre = actif ? conflitExclusif(reponse.chain, reponse.catalog, id) : null;
    if (autre) {
      // L'exclusivité est tenue ICI, avant le serveur : on n'envoie rien.
      message = tr(cleExclusivite(reponse.catalog, id)).replace(/\{a\}/g, nom(id)).replace(/\{b\}/g, nom(autre));
      return;
    }
    void envoyer(basculerGreffon(reponse.chain, reponse.catalog, id, actif));
  }
  function retirer(id: string) {
    if (!reponse) return;
    if (selection === id) selection = null;
    void envoyer(retirerGreffon(reponse.chain, id));
  }
  function deplacer(de: number, vers: number) {
    if (!reponse) return;
    const c = deplacerGreffon(reponse.chain, reponse.catalog, de, vers);
    if (!c) { message = tr('tess.cantMove'); return; }
    void envoyer(c);
  }
  async function ajouter(id: string) {
    if (!reponse) return;
    const c = ajouterGreffon(reponse.chain, reponse.catalog, id, verrouDe(id) === null);
    // rc14 (recette .18) : aucun échec sans message. L'ajout impossible ici
    // (déjà présent, absent du catalogue, ordre « dernier greffon ») le dit.
    if (!c) { message = tr('tess.cantAdd').replace('{name}', nom(id)); return; }
    // Verrouillé par le serveur (licence ou greffon indisponible) : ajouté éteint.
    const ok = await envoyer(c && verrouDe(id) ? { ...c, plugins: liensDe(c).map((l) => (l.id === id ? { ...l, enabled: false } : l)) } : c);
    // Le panneau ne s'ouvre que sur un greffon réellement ajouté.
    if (ok) selection = id;
  }
  function bypass(b: boolean) {
    if (reponse) void envoyer(avecBypassAll(reponse.chain, b));
  }
  // ── Suréchantillonnage : PCM ou DSD (rc14) ──────────────────────────────
  // Un choix part tout de suite, sur la chaîne entière ; refusé (402 en Free,
  // 409 cible DSD que la sortie ne prend pas), rien n'est écrit et le motif
  // s'affiche en haut de l'écran.
  function changerSurechantillonnage(up: UpsamplingTess) {
    if (reponse) void envoyer(avecUpsampling(reponse.chain, up));
  }
  /** Le réglage « DSD » de la zone (Réglages › Appareils › fiche de la zone). */
  function ouvrirReglagesDsd() {
    if (zoneId == null) return;
    v2SettingsTarget.set({ tab: 'devices', section: 'perZone', zone: zoneId, reglage: 'zone-dsd' });
    activeView.set('settings' as View);
  }
  // ── Réglages d'un greffon (lot W2) ──────────────────────────────────────
  // Un curseur ou un champ remonte des réglages complets ; on attend que la
  // main s'arrête (350 ms) puis UN `PUT` par zone part, avec la chaîne entière.
  // L'attente est tenue PAR ZONE et PAR GREFFON : deux greffons réglés dans la
  // même fenêtre partent ensemble, et rien n'est perdu ni envoyé ailleurs :
  //   - changement de zone : le geste part à la zone où il a eu lieu, sur la
  //     dernière chaîne connue de CETTE zone ;
  //   - zone en rechargement, ou envoi en cours : l'attente est réarmée ;
  //   - démontage (« Ouvrir l'écran Égaliseur ») : ce qui attend part tout de
  //     suite, sans attendre la fin de la fenêtre ;
  //   - préréglage chargé pendant l'attente : il REMPLACE la chaîne (contrat
  //     § 5), le geste d'avant est abandonné, il ne s'applique pas à la
  //     nouvelle chaîne.
  type Attente = { base: ChaineTess; reglages: Map<string, Record<string, unknown>> };
  const attentes = new Map<number, Attente>();
  let minuteurReglages: ReturnType<typeof setTimeout> | null = null;
  let garderMessage = false;
  function armer(ms: number) {
    if (minuteurReglages) clearTimeout(minuteurReglages);
    minuteurReglages = setTimeout(viderReglages, ms);
  }
  function programmerReglages(id: string, reglages: Record<string, unknown>) {
    if (zoneId == null || !reponse || reponse.zone_id !== zoneId) return;
    const a = attentes.get(zoneId) ?? { base: reponse.chain, reglages: new Map() };
    a.base = reponse.chain;
    a.reglages.set(id, reglages);
    attentes.set(zoneId, a);
    armer(350);
  }
  /** La chaîne à envoyer : la dernière reçue de la zone, avec les réglages en attente. */
  function chaineEnAttente(zone: number, a: Attente): ChaineTess {
    let c = reponse && reponse.zone_id === zone ? reponse.chain : a.base;
    for (const [id, r] of a.reglages) c = avecReglages(c, id, r);
    return c;
  }
  function viderReglages() {
    minuteurReglages = null;
    const premiere = attentes.entries().next();
    if (premiere.done) return;
    if (occupe) { armer(150); return; }
    const [zone, a] = premiere.value;
    attentes.delete(zone);
    // Après un préréglage refusé, le motif reste affiché pendant l'envoi.
    const garder = garderMessage;
    garderMessage = false;
    void envoyer(chaineEnAttente(zone, a), zone, garder).finally(() => { if (attentes.size > 0) armer(0); });
  }
  $effect(() => () => {
    if (minuteurReglages) clearTimeout(minuteurReglages);
    minuteurReglages = null;
    for (const [zone, a] of attentes) void api.putTessZone(zone, chaineEnAttente(zone, a)).catch(() => {});
    attentes.clear();
  });

  // ── Préréglages (W4 / T17) ──
  const nomDuPreReglageAffiche = (id: string | null | undefined) => {
    const p = id ? preReglages?.presets.find((x) => x.id === id) : undefined;
    return p ? nomDuPreReglage(p, tr('tess.presets.pure')) : tr('tess.presetNone');
  };
  const motif = (r: string) => libelleOuRepli(tr(`tess.reason.${r}`), `tess.reason.${r}`, r);

  /** Une erreur propre aux préréglages (pas un refus de chaîne). */
  function texteErreurPreReglage(code: string): string {
    if (code === 'preset_not_found') return tr('tess.presets.notFound');
    if (code === 'invalid_name') return tr('tess.presets.invalidName');
    if (code === 'zone_not_found') return tr('tess.zoneNotFound');
    return tr('tess.presets.error');
  }

  async function relirePreReglages() {
    const p = await api.getTessPresets();
    if (p) preReglages = p;
  }

  async function gestePreReglage<T>(
    appel: () => Promise<api.ResultatPreReglageTess<T>>, succes: (c: T) => void, echec?: (texte: string) => void,
  ) {
    if (occupe) return;
    occupe = true;
    message = null;
    avis = null;
    try {
      const r = await appel();
      if (r.ok) succes(r.corps);
      else if ('refus' in r) { message = texteRefus(r.refus); echec?.(message); }
      else {
        message = texteErreurPreReglage(r.code);
        if (r.code === 'preset_not_found') void relirePreReglages();
        echec?.(message);
      }
    } catch {
      message = tr('tess.presets.error');
      echec?.(message);
    } finally {
      occupe = false;
    }
  }

  function chargerPreReglage(id: string) {
    if (zoneId == null) return;
    const zone = zoneId;
    // Charger un préréglage REMPLACE la chaîne de la zone (contrat § 5) ; le
    // serveur vérifie les droits et dit ce qui ne s'applique pas ici. Un
    // réglage encore en attente sur cette zone n'est abandonné QUE si le
    // préréglage s'applique ; refusé ou en panne, le réglage est gardé, il
    // part sur la chaîne actuelle, et on le dit sans effacer le motif.
    void gestePreReglage(() => api.appliquerPreReglageTess(zone, id), (c) => {
      attentes.delete(zone);
      if (zoneId !== zone) return;
      reponse = c.zone;
      const absents = (c.not_applied ?? []) as NonAppliqueTess[];
      const morceaux: string[] = [];
      if (absents.length > 0) {
        // Sans greffon nommé, le motif seul (jamais « (motif) » sans nom).
        const liste = absents.map((a) => (a.plugin_id ? `${nom(a.plugin_id)} (${motif(a.reason)})` : motif(a.reason))).join(', ');
        morceaux.push(tr('tess.presets.notApplied').replace('{list}', liste));
      }
      if (c.apply_mode === 'at_next_playback') morceaux.push(tr('tess.presets.appliesAtNextPlayback'));
      // rc14 — les avertissements du serveur ne sont jamais ignorés (ex. :
      // « Pure » chargé, mais le mode PURE n'a pas été activé parce que le
      // verrou de volume est armé). Un code inconnu : texte générique.
      for (const w of Array.isArray(c.warnings) ? c.warnings : []) {
        if (typeof w !== 'string' || !w) continue;
        morceaux.push(libelleOuRepli(tr(`tess.warning.${w}`), `tess.warning.${w}`, tr('tess.warning.generic').replace('{code}', w)));
      }
      avis = morceaux.length > 0 ? morceaux.join(' ') : null;
      panneauPreReglages = false;
    }, () => {
      if (!attentes.has(zone)) return;
      garderMessage = true;
      avis = tr('tess.presets.pendingKept');
    });
  }
  function enregistrerPreReglage(nomChoisi: string) {
    if (zoneId == null) return;
    const zone = zoneId;
    void gestePreReglage(() => api.enregistrerPreReglageTess(zone, nomChoisi), (p) => {
      if (preReglages) preReglages = { ...preReglages, presets: [...preReglages.presets, p] };
      if (reponse && zoneId === zone) reponse = { ...reponse, active_preset: p.id };
      panneauPreReglages = false;
    });
  }
  function renommerPreReglage(id: string, nomChoisi: string) {
    void gestePreReglage(() => api.renommerPreReglageTess(id, nomChoisi), (p) => {
      if (preReglages) preReglages = { ...preReglages, presets: preReglages.presets.map((x) => (x.id === p.id ? p : x)) };
    });
  }
  function supprimerPreReglage(id: string) {
    void gestePreReglage(() => api.supprimerPreReglageTess(id), () => {
      if (preReglages) preReglages = { ...preReglages, presets: preReglages.presets.filter((x) => x.id !== id) };
      if (reponse?.active_preset === id) reponse = { ...reponse, active_preset: null };
    });
  }
  function reglerMode(mode: 'immediately' | 'at_next_playback') {
    void gestePreReglage(() => api.reglerModeApplicationTess(mode), (l) => { preReglages = l; });
  }

  // ── Anciens préréglages de l'écran Égaliseur (décision du 25/11) ──
  let anciensPreReglages = $state<api.EqProPreset[]>([]);
  let anciensDemandes = false;
  $effect(() => {
    if ($capaciteTess !== 'oui' || anciensDemandes) return;
    anciensDemandes = true;
    void api.listEqPresets().then((l) => { anciensPreReglages = l; }).catch(() => { /* serveur sans la route : rien à proposer */ });
  });
  async function chargerAncienPreReglage(p: api.EqProPreset) {
    if (!reponse) return;
    const r = chaineAvecAncienPreReglage(reponse.chain, reponse.catalog, p);
    if (!r) { message = tr('tess.cantAdd').replace('{name}', p.name); return; }
    const motif = texteVerrou(r.id);
    if (motif) { message = motif; return; }
    if (await envoyer(r.chaine)) {
      selection = r.id;
      panneauPreReglages = false;
      avis = tr('tess.presets.legacyLoaded').replace('{name}', p.name).replace('{plugin}', nom(r.id));
    }
  }

  // ── Headroom (refonte rc14, demande 8) ──
  /** Chaque chaîne reçue relance la lecture de la garde de préampli et de la compensation. */
  let revisionChaine = $state(0);
  $effect(() => { void reponse; untrack(() => { revisionChaine++; }); });
  function reglerHeadroom(h: HeadroomTess) {
    if (reponse) void envoyer(avecHeadroom(reponse.chain, h));
  }

  // ── Surcouche des préréglages : Échap et clic à l'extérieur la ferment ──
  let ancrePreReglages = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!panneauPreReglages) return;
    // Un Échap qui annule un geste du panneau (renommer, confirmer une
    // suppression) n'appartient qu'à ce geste : la surcouche reste ouverte.
    const GESTES = '[data-tess-prereglage-nom],[data-tess-prereglage-confirmer],[data-tess-prereglage-annuler]';
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(GESTES)) return;
      panneauPreReglages = false;
    };
    const clic = (e: MouseEvent) => {
      if (ancrePreReglages && e.target instanceof Node && !ancrePreReglages.contains(e.target)) panneauPreReglages = false;
    };
    document.addEventListener('keydown', touche);
    document.addEventListener('mousedown', clic);
    return () => { document.removeEventListener('keydown', touche); document.removeEventListener('mousedown', clic); };
  });

  const lienChoisi = $derived(reponse ? liensDe(reponse.chain).find((l) => l.id === selection) ?? null : null);
  const blocageChoisi = $derived.by(() => {
    if (!reponse || !lienChoisi || lienChoisi.enabled) return null;
    const autre = conflitExclusif(reponse.chain, reponse.catalog, lienChoisi.id);
    if (autre) return tr(cleExclusivite(reponse.catalog, lienChoisi.id)).replace(/\{a\}/g, nom(lienChoisi.id)).replace(/\{b\}/g, nom(autre));
    return texteVerrou(lienChoisi.id);
  });
  /** Greffon verrouillé par le serveur (licence, ou indisponible), avec son motif. */
  const verrouChoisi = $derived(reponse && lienChoisi ? texteVerrou(lienChoisi.id) : null);
  /**
   * « Réglages avancés » : l'écran historique du greffon (Égaliseur,
   * Crossfeed…), dont l'entrée a quitté la barre avec TESS (lot W8). Il règle
   * la zone COURANTE : le lien n'est offert que si c'est celle de l'écran
   * TESS, sinon il ouvrirait les réglages d'une autre zone. Jamais pour un
   * greffon Premium sans licence (`vueReglagesAvances`). Le libellé propre de
   * l'écran reste en infobulle.
   */
  const vueDuChoisi = $derived(lienChoisi ? vueReglagesAvances(lienChoisi.id, verrouDe(lienChoisi.id)) : null);
  /**
   * Refonte rc14 (demande 9) : un greffon SANS panneau ici (Crossfeed Pro,
   * Crosstalk, natifs tiers) se configure dans la popup de la coquille —
   * « Configurer… » à la place de « Réglages avancés ». Tant que la coquille
   * (lot 1) ne monte pas la popup, l'écran historique s'ouvre, comme avant.
   */
  const configurable = $derived(lienChoisi != null && vueDuChoisi != null && genrePanneau(lienChoisi.id) === 'ancien-ecran');
  const ecranHistorique = $derived(
    vueDuChoisi && !configurable && zoneId != null && zoneId === $currentZoneId ? tr('tess.advancedSettings') : null,
  );
  function configurer() {
    if (!vueDuChoisi) return;
    ouvrirPopupConfiguration(vueDuChoisi, zoneId);
    activeView.set(vueDuChoisi as View);
  }
  const titreEcranHistorique = $derived(
    vueDuChoisi
      ? libelleOuRepli(tr(`tess.screen.${vueDuChoisi}`), `tess.screen.${vueDuChoisi}`, '')
        || (lienChoisi ? tr('tess.screen.generic').replace('{name}', nom(lienChoisi.id)) : '')
      : '',
  );
  const badge = $derived(reponse?.badge ?? null);
  const horsTess = $derived(reponse?.applicability?.status === 'outside_tess' ? reponse.applicability : null);
</script>

<section class="v2-tess tune-v2" data-ecran-tess>
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('tess.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.tess' as any)}</h1>
      <div class="sous-titre">{$t('tess.subtitle' as any)}</div>
    </div>
    {#if !absent && preReglages}
      <!-- Refonte rc14 (demande 4) : « Apply changes » est un interrupteur, à
           la place de l'ancien sélecteur de zone. -->
      <div class="selecteurs" title={preReglages.apply_mode === 'at_next_playback' ? tr('tess.presets.helpAtNextPlayback') : tr('tess.presets.helpImmediately')}>
        <InterrupteurTess data-tess-appliquer checked={preReglages.apply_mode !== 'at_next_playback'} disabled={occupe}
                          texte={`${tr('tess.presets.applyChanges')} · ${preReglages.apply_mode === 'at_next_playback' ? tr('tess.presets.atNextPlayback') : tr('tess.presets.immediately')}`}
                          label={tr('tess.presets.applyChanges')}
                          onToggle={(v) => reglerMode(v ? 'immediately' : 'at_next_playback')} />
        <p class="aide-appliquer" data-tess-appliquer-aide>
          {preReglages.apply_mode === 'at_next_playback' ? tr('tess.presets.helpAtNextPlayback') : tr('tess.presets.helpImmediately')}
        </p>
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if absent || $capaciteTess === 'non'}
      <div class="etat" data-tess-indisponible>{$t('tess.unavailable' as any)}</div>
    {:else if zoneId == null}
      <div class="etat">{$t('tess.noZone' as any)}</div>
    {:else if !reponse}
      <div class="etat" data-tess-etat>{chargement ? $t('tess.loading' as any) : (message ?? '')}</div>
    {:else}
      {#if horsTess}
        <div class="avis" role="note" data-tess-hors={horsTess.reason ?? ''}>
          {libelleOuRepli(tr(`tess.outside.${horsTess.reason}`), `tess.outside.${horsTess.reason}`, tr('tess.outside.generic'))}
        </div>
      {/if}
      {#if badge && libelleOuRepli(tr(`tess.badge.${badge}`), `tess.badge.${badge}`, '')}
        <div class="badge" data-tess-badge={badge}>{tr(`tess.badge.${badge}`)}</div>
      {/if}
      {#if message}<div class="erreur" role="alert" data-tess-message>{message}</div>{/if}
      {#if avis}<div class="avis" role="status" data-tess-avis>{avis}</div>{/if}
      <div class="colonnes">
        <CheminTess
          {reponse}
          {verrouDe}
          {occupe}
          {selection}
          onSelect={(id) => (selection = id)}
          onToggle={basculer}
          onRemove={retirer}
          onMove={deplacer}
          onBypass={bypass}
          onAdd={ajouter}
          onInstall={installer}
          {installation}
        >
          {#snippet entete()}
            {#if preReglages}
              <div class="ancre-prereglages" bind:this={ancrePreReglages}>
                <button class="sel bouton-sel" data-tess-preset aria-expanded={panneauPreReglages} disabled={!reponse}
                        onclick={() => (panneauPreReglages = !panneauPreReglages)}>
                  <span>{$t('tess.preset' as any)}</span>
                  <strong title={nomDuPreReglageAffiche(reponse?.active_preset)}>{nomDuPreReglageAffiche(reponse?.active_preset)}</strong>
                  <span aria-hidden="true">{panneauPreReglages ? '▴' : '▾'}</span>
                </button>
                {#if panneauPreReglages && reponse}
                  <div class="panneau-prereglages" data-tess-surcouche-prereglages>
                    <PanneauPreReglages
                      liste={preReglages}
                      actif={reponse.active_preset ?? null}
                      {occupe}
                      onLoad={chargerPreReglage}
                      onSave={enregistrerPreReglage}
                      onRename={renommerPreReglage}
                      onDelete={supprimerPreReglage}
                      anciens={anciensPreReglages}
                      onLoadAncien={chargerAncienPreReglage}
                    />
                  </div>
                {/if}
              </div>
            {/if}
          {/snippet}
        </CheminTess>
        {#if selection === SELECTION_HEADROOM}
          <PanneauHeadroomTess headroom={headroomDe(reponse.chain)} effectifDb={reponse.headroom_db}
                               {zoneId} {occupe} onChange={reglerHeadroom}
                               egaliseurActif={liensDe(reponse.chain).some((l) => l.enabled && FACADES_SERIE.has(l.id))}
                               etape={reponse.signal_path.find((e) => e.code === 'headroom') ?? null}
                               revision={revisionChaine} />
        {:else if lienChoisi}
          <ReglagesGreffonTess
            lien={lienChoisi}
            nom={nom(lienChoisi.id)}
            {zoneId}
            bloque={blocageChoisi}
            {occupe}
            verrou={verrouChoisi}
            {ecranHistorique}
            {titreEcranHistorique}
            onInstall={verrouDe(lienChoisi.id) === 'plugin_not_installed' ? () => installer(lienChoisi!.id) : null}
            installation={installation === lienChoisi.id}
            onToggle={basculer}
            onRemove={retirer}
            onChange={programmerReglages}
            onOuvrirEcran={() => { if (vueDuChoisi) activeView.set(vueDuChoisi as View); }}
            bornes={bornesGain(reponse.catalog, lienChoisi.id)}
            voies={voiesQuiArrivent(reponse)}
            bornesEnceintes={bornesEnceintes(reponse.catalog)}
            onConfigurer={configurable ? configurer : null}
          />
        {:else if selection === SELECTION_SURECHANTILLONNAGE}
          <PanneauSurechantillonnageTess
            {reponse}
            {occupe}
            verrou={verrouDe(ID_SURECHANTILLONNAGE) === 'premium_required'
              ? tr('tess.premiumRequired').replace('{name}', tr('tess.step.upsampling'))
              : null}
            onChange={changerSurechantillonnage}
            onOuvrirReglagesZone={ouvrirReglagesDsd}
          />
        {:else}
          <div class="vide">{$t('tess.selectPlugin' as any)}</div>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-tess{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .sous-titre{color:var(--v2-txt2); font-size:calc(13.5px * var(--v2-txt-echelle, 1)); margin-top:4px}
  .selecteurs{display:flex; gap:10px; flex-wrap:wrap; align-items:center}
  .sel{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    padding:6px 8px 6px 14px; color:var(--v2-txt2); font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .bouton-sel{background:transparent; cursor:pointer; font:inherit; padding-right:14px}
  .bouton-sel strong{color:var(--v2-txt); font-weight:600; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .bouton-sel:disabled{opacity:.5; cursor:default}
  .ancre-prereglages{position:relative}
  .selecteurs{flex-direction:column; align-items:flex-end; max-width:360px}
  .aide-appliquer{margin:0; color:var(--v2-txt3); font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.4; text-align:right}
  .panneau-prereglages{position:absolute; z-index:6; top:calc(100% + 6px); left:0; width:min(520px, 86vw);
    box-shadow:var(--v2-sh-menu); border-radius:16px}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .etat{padding:24px 0; color:var(--v2-txt3)}
  .avis,.erreur{padding:11px 14px; border-radius:10px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5; margin-bottom:14px}
  .avis{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .erreur{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .badge{display:inline-block; font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em; text-transform:uppercase;
    color:var(--v2-txt2); border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:4px 10px; margin-bottom:12px}
  .colonnes{display:grid; grid-template-columns:minmax(300px, 520px) minmax(0, 1fr); gap:24px; align-items:start}
  .vide{border:1px dashed var(--v2-line2); border-radius:16px; padding:32px; color:var(--v2-txt3); text-align:center}
  /* Relecture de #3418 : à 375 px, la surcouche tient dans l'écran (marges de
     16 px), sans défilement horizontal ; elle défile verticalement. */
  @media (max-width: 600px){
    .panneau-prereglages{position:fixed; left:16px; right:16px; top:72px; width:auto; max-height:calc(100vh - 96px); overflow-y:auto; overflow-x:hidden}
    .selecteurs{align-items:flex-start; max-width:none}
    .aide-appliquer{text-align:left}
  }
  @media (max-width: 900px){
    .colonnes{grid-template-columns:1fr}
    .scroll{padding:6px 16px 40px}
  }
</style>
