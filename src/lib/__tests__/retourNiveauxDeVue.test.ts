import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  declarerPorteeDeVue,
  finDuRetourProgrammatique,
  niveauDeVue,
  opPourFiche,
  ouvrirNiveau,
  instantaneSerialisable,
  ouvrirNiveauDepuisEntree,
  reculerDansLaVue,
  refermerNiveau,
  vuesDeclarees,
} from '../historiqueNavigation';

/**
 * Le contexte d'historique ne portait que quatre champs (`view`, `albumId`,
 * `artistId`, `tab`) : tout ce qui n'est pas la Bibliothèque restait dehors.
 * Les `goBack()` de Streaming, Playlists, Podcasts et Serveurs multimédia ne
 * touchent PAS à `history` — lu dans leurs sources : ils remettent des
 * variables locales à zéro, et rien d'autre. Le bouton du NAVIGATEUR, lui,
 * quitte alors la vue entière au lieu de refermer le niveau ouvert.
 *
 * Ces tests rejouent le trajet complet avec une vraie pile d'historique et les
 * vraies fonctions du module — pas une reformulation de la règle.
 */

/** Une pile d'historique jouable, `state` compris. */
function historiqueJouable(etatInitial: unknown = { view: 'home' }) {
  const pile: Array<{ url: string; state: unknown }> = [{ url: '#home', state: etatInitial }];
  let curseur = 0;
  const ops: string[] = [];
  return {
    ops,
    entree: () => pile[curseur],
    push(state: unknown, url: string) {
      ops.push(`push ${url}`);
      pile.splice(curseur + 1);
      pile.push({ url, state });
      curseur = pile.length - 1;
    },
    replace(state: unknown, url: string) {
      ops.push(`replace ${url}`);
      pile[curseur] = { url, state };
    },
    back() {
      ops.push('back()');
      if (curseur > 0) curseur--;
      this.enAttente = true;
    },
    enAttente: false,
    /** Livre le `popstate` que le `back()` a provoqué, et rend son `state`. */
    livrerPopstate(): unknown {
      if (!this.enAttente) return undefined;
      this.enAttente = false;
      ops.push(`POP ${pile[curseur].url}`);
      finDuRetourProgrammatique();
      return pile[curseur].state;
    },
  };
}

/**
 * App.svelte réduit à son rôle : seule à écrire dans l'historique, elle suit le
 * niveau publié par la vue et applique la même décision que pour une fiche.
 */
function appSvelte(h: ReturnType<typeof historiqueJouable>, vueCourante = 'podcasts') {
  // `subscribe` appelle tout de suite : on reste muet le temps de l'abonnement,
  // comme App.svelte qui attend `_viewInitialized` avant d'ecrire.
  let silence = true;
  const desabonner = niveauDeVue.subscribe(niveau => {
    if (silence) return;
    const op = opPourFiche(niveau !== null);
    const ctx = { view: vueCourante, niveau };
    if (op === 'push') h.push(ctx, `#${niveau!.adresse ?? vueCourante}`);
    else if (op === 'replace') h.replace(ctx, `#${vueCourante}`);
  });
  silence = false;
  return {
    desabonner,
    /** L'écouteur `popstate` : rend son instantané à la vue atteinte. */
    surPopstate(state: any) {
      silence = true;
      niveauDeVue.set(state?.niveau ?? null);
      if (state?.niveau) ouvrirNiveauDepuisEntree(state.niveau);
      else refermerNiveau(vueCourante);
      silence = false;
    },
  };
}

/** Une vue avec un seul niveau : la fiche d'un podcast. */
function vuePodcasts() {
  const journal: Array<string> = [];
  let ouvert: number | null = null;
  const retrait = declarerPorteeDeVue('podcasts', {
    retablir(etat: any) {
      ouvert = etat?.podcastId ?? null;
      journal.push(ouvert === null ? 'racine' : `rouvre ${ouvert}`);
    },
  });
  return {
    journal,
    retrait,
    ouvert: () => ouvert,
    ouvrir(id: number) {
      ouvert = id;
      ouvrirNiveau('podcasts', { podcastId: id }, `podcast/${id}`);
    },
    retour(h: ReturnType<typeof historiqueJouable>) {
      reculerDansLaVue(() => { ouvert = null; }, { historique: h, programmerFilet: () => {} });
    },
  };
}

describe('une vue dépose son niveau dans l’historique', () => {
  beforeEach(() => {
    finDuRetourProgrammatique();
    niveauDeVue.set(null);
  });

  it('le bouton du navigateur referme le niveau au lieu de quitter la vue', () => {
    const h = historiqueJouable();
    const app = appSvelte(h);
    const vue = vuePodcasts();

    vue.ouvrir(42);
    expect(h.ops).toEqual(['push #podcast/42']);
    expect(h.entree().state).toMatchObject({ view: 'podcasts', niveau: { vue: 'podcasts', etat: { podcastId: 42 } } });

    // Retour NAVIGATEUR : personne n'a appelé `goBack()`.
    h.back();
    app.surPopstate(h.livrerPopstate());

    expect(vue.ouvert()).toBeNull();
    expect(vue.journal).toEqual(['racine']);
    app.desabonner();
    vue.retrait();
  });

  it('contre-épreuve : sans instantané dans l’entrée, le retour ne sait rien reposer', () => {
    const h = historiqueJouable();
    const app = appSvelte(h);
    const vue = vuePodcasts();

    vue.ouvrir(42);
    // Une entrée d'AVANT : quatre champs, pas de niveau.
    app.surPopstate({ view: 'podcasts', albumId: null, artistId: null, tab: null });
    expect(vue.journal).toEqual(['racine']);
    // Rien ne permet de rouvrir la fiche : l'information n'était pas dans l'entrée.
    expect(vue.ouvert()).toBeNull();

    app.desabonner();
    vue.retrait();
  });

  it('« suivant » rouvre le niveau : l’instantané voyage avec l’entrée', () => {
    const h = historiqueJouable();
    const app = appSvelte(h);
    const vue = vuePodcasts();

    vue.ouvrir(42);
    const entreeDuNiveau = h.entree().state;
    h.back();
    app.surPopstate(h.livrerPopstate());
    expect(vue.ouvert()).toBeNull();

    // history.forward() ramène l'entrée du niveau, intacte.
    app.surPopstate(entreeDuNiveau);
    expect(vue.ouvert()).toBe(42);
    expect(vue.journal).toEqual(['racine', 'rouvre 42']);

    app.desabonner();
    vue.retrait();
  });

  it('le goBack() de la vue recule d’un cran, sans écraser l’entrée quittée', () => {
    const h = historiqueJouable();
    const app = appSvelte(h);
    const vue = vuePodcasts();

    vue.ouvrir(42);
    vue.retour(h);
    app.surPopstate(h.livrerPopstate());

    expect(h.ops).toEqual(['push #podcast/42', 'back()', 'POP #home']);
    expect(vue.ouvert()).toBeNull();

    app.desabonner();
    vue.retrait();
  });

  it('deux niveaux successifs se dépilent un par un', () => {
    const h = historiqueJouable();
    const app = appSvelte(h);
    const vue = vuePodcasts();

    vue.ouvrir(42);
    vue.ouvrir(77);
    expect(h.ops).toEqual(['push #podcast/42', 'push #podcast/77']);

    h.back();
    app.surPopstate(h.livrerPopstate());
    expect(vue.ouvert()).toBe(42);

    h.back();
    app.surPopstate(h.livrerPopstate());
    expect(vue.ouvert()).toBeNull();

    app.desabonner();
    vue.retrait();
  });
});

describe('le registre des vues', () => {
  beforeEach(() => { niveauDeVue.set(null); });

  it('une vue démontée ne reçoit plus rien', () => {
    const vue = vuePodcasts();
    expect(vuesDeclarees()).toContain('podcasts');
    vue.retrait();
    expect(vuesDeclarees()).not.toContain('podcasts');
    // L'appelant est prévenu qu'il n'a pas pu reposer l'état.
    expect(ouvrirNiveauDepuisEntree({ vue: 'podcasts', etat: { podcastId: 1 } })).toBe(false);
  });

  it('un retrait périmé n’efface pas la déclaration de la vue remontée', () => {
    const premier = declarerPorteeDeVue('podcasts', { retablir() {} });
    const journal: string[] = [];
    declarerPorteeDeVue('podcasts', { retablir: () => journal.push('remontée') });
    premier(); // le démontage du PREMIER arrive après le montage du second
    expect(vuesDeclarees()).toContain('podcasts');
    ouvrirNiveauDepuisEntree({ vue: 'podcasts', etat: null });
    expect(journal).toEqual(['remontée']);
  });

  it('une entrée sans niveau est reposable sans rien faire', () => {
    expect(ouvrirNiveauDepuisEntree(null)).toBe(true);
  });

  it('reculerDansLaVue efface le niveau publié avant de reculer', () => {
    const h = historiqueJouable();
    ouvrirNiveau('podcasts', { podcastId: 5 });
    expect(get(niveauDeVue)).not.toBeNull();
    reculerDansLaVue(() => {}, { historique: h, programmerFilet: () => {} });
    expect(get(niveauDeVue)).toBeNull();
    expect(h.ops).toEqual(['back()']);
  });
});

describe('les vues sont câblées sur le mécanisme', () => {
  const source = (chemin: string) => readFileSync(resolve(__dirname, '../..', chemin), 'utf-8');

  it('App.svelte suit le niveau publié et le repose au retour', () => {
    const app = source('App.svelte');
    expect(app).toMatch(/niveauDeVue\.subscribe/);
    expect(app).toMatch(/ouvrirNiveauDepuisEntree/);
  });

  it('Podcasts publie son niveau et délègue son retour', () => {
    const vue = source('components/PodcastsView.svelte');
    expect(vue).toMatch(/declarerPorteeDeVue\('podcasts'/);
    expect(vue).toMatch(/ouvrirNiveau\('podcasts'/);
    expect(vue).toMatch(/reculerDansLaVue/);
  });

  it('Playlists publie son niveau et délègue son retour', () => {
    const vue = source('components/PlaylistsView.svelte');
    expect(vue).toMatch(/declarerPorteeDeVue\('playlists'/);
    expect(vue).toMatch(/ouvrirNiveau\('playlists'/);
    expect(vue).toMatch(/reculerDansLaVue/);
  });
});

describe('l’instantané doit survivre à `history.pushState`', () => {
  /**
   * 🔴 Défaut attrapé dans le NAVIGATEUR, pas par les tests : publier
   * directement l'état d'une vue Svelte 5 fait jeter `pushState` avec
   * `DataCloneError: #<Object> could not be cloned` — les `$state` sont des
   * proxies, que l'algorithme de clonage structuré refuse. L'entrée n'était
   * jamais écrite, et le niveau ne survivait pas au retour, en silence.
   *
   * La pile jouable des tests précédents gardait l'objet tel quel : elle ne
   * pouvait pas voir ce défaut. Ici on passe par le vrai `structuredClone`,
   * qui est ce que fait le navigateur.
   */
  beforeEach(() => { niveauDeVue.set(null); });

  /** Ce que Svelte 5 donne à lire : un proxy autour d'un objet nu. */
  const commeDuState = <T extends object>(objet: T): T =>
    new Proxy(objet, { get: (c, p) => (c as any)[p] });

  it('contre-épreuve : un état de vue Svelte tel quel fait jeter le navigateur', () => {
    const etat = { podcast: commeDuState({ name: 'Le Masque', feed_url: 'https://…' }) };
    expect(() => structuredClone(etat)).toThrow(/clone/i);
  });

  it('le niveau publié, lui, passe le clonage structuré', () => {
    ouvrirNiveau('podcasts', { podcast: commeDuState({ name: 'Le Masque', feed_url: 'https://…' }) });
    const niveau = get(niveauDeVue);
    expect(() => structuredClone(niveau)).not.toThrow();
    // Et il transporte bien la même information.
    expect(niveau).toMatchObject({ vue: 'podcasts', etat: { podcast: { name: 'Le Masque' } } });
  });

  it('un objet déjà nu traverse sans être abîmé', () => {
    ouvrirNiveau('playlists', { playlist: { id: 7, name: 'Nuit' } });
    expect(get(niveauDeVue)!.etat).toEqual({ playlist: { id: 7, name: 'Nuit' } });
  });

  it('les valeurs simples ne sont pas touchées', () => {
    expect(instantaneSerialisable(42)).toBe(42);
    expect(instantaneSerialisable(null)).toBeNull();
    expect(instantaneSerialisable('texte')).toBe('texte');
  });

  it('un cycle ne fait pas exploser l’ouverture d’un niveau', () => {
    const cycle: any = { nom: 'boucle' };
    cycle.moi = cycle;
    expect(() => ouvrirNiveau('podcasts', cycle)).not.toThrow();
    expect(get(niveauDeVue)!.etat).toBeNull();
  });
});
