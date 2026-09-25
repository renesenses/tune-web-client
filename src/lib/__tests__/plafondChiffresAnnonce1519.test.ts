// @vitest-environment jsdom
//
// #1519 — LE PLAFOND DE LA LIGNE DE CHIFFRES SE DIT, IL NE SE DEVINE PAS.
//
// Le défaut, en une ligne de `basculer` :
//
//   if (ids.length >= maximum) return [...ids];
//
// Cocher un septième chiffre rendait la liste INCHANGÉE. Aucune erreur, aucun
// message : la case cochée revenait d'elle-même à sa place et l'écran restait
// identique. Du point de vue de l'utilisateur, le clic n'a rien fait — et rien
// ne lui disait pourquoi.
//
// 🔴 POURQUOI CELA ALLAIT FAIRE MAL MAINTENANT, ET C'EST NOUS.
//
// Jusqu'au 24/09/2026 le défaut tenait CINQ cartes : il restait toujours une
// place libre, et personne ne rencontrait le plafond — jfpaquet (fil 1918) a
// ajouté « titres » sans jamais le toucher. Depuis #1541 le défaut en tient
// SIX : un profil neuf arrive PLEIN. Et #1542 a ajouté quatre cartes au
// catalogue (titres/albums, locaux et réseau). Plus de choix que jamais, et
// aucune place pour en essayer un seul.
//
// 🔴 LE REMÈDE ARBITRÉ PAR BERTRAND : DIRE LE PLAFOND, PAS LE LEVER.
//
// Le plafond reste à six. Pas de « remplacer le plus ancien » non plus : un
// chiffre choisi ne disparaît pas sans qu'on l'ait demandé. Ce qui change est
// que la ligne pleine le DIT, et que les cases qu'on ne peut pas cocher sont
// grisées — elles ne font plus semblant d'être cochables.
//
// ⚠️ CE QUE CE BANC REGARDE, ET POURQUOI.
//
// Il monte la vraie page, entre en édition et lit l'écran. Il ne lit pas le
// code : une garde de texte serait satisfaite par n'importe quelle chaîne
// contenant `disabled`, y compris posée sur la mauvaise case. Ici, ce sont
// les cases elles-mêmes qui répondent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import {
  CHIFFRES,
  CHOIX_DEFAUT,
  MAXIMUM_CHIFFRES,
  ajoutRefuse,
  basculer,
  ligneComplete,
} from '../chiffresAccueil';

/* ------------------------------------------------------------------ */
/* La règle, sans écran                                               */
/* ------------------------------------------------------------------ */

describe('#1519 — la règle du plafond, et le fait qu’elle ne bouge PAS', () => {
  const SIX = ['albums', 'artistes', 'titres', 'genres', 'duree', 'taille'];

  it('🔴 le plafond reste à SIX — on le dit, on ne le lève pas', () => {
    expect(MAXIMUM_CHIFFRES).toBe(6);
    expect(basculer(SIX, 'lectures')).toEqual(SIX);
    expect(basculer(SIX, 'lectures')).toHaveLength(6);
  });

  it('🔴 et on ne remplace PAS le plus ancien : aucun chiffre choisi ne s’évapore', () => {
    // Le dessin écarté. Si un jour `basculer` se mettait à faire de la place,
    // la liste changerait de contenu à longueur constante — ce témoin le voit.
    expect(basculer(SIX, 'lectures')).toEqual(SIX);
    expect(basculer(SIX, 'lectures')).not.toContain('lectures');
  });

  it('`ligneComplete` dit exactement quand la ligne est pleine', () => {
    expect(ligneComplete([])).toBe(false);
    expect(ligneComplete(SIX.slice(0, 5))).toBe(false);
    expect(ligneComplete(SIX)).toBe(true);
  });

  it('🔴 `ajoutRefuse` refuse EXACTEMENT ce que `basculer` refuse', () => {
    // Le point de la mise en commun : la case grisée et le refus réel sont le
    // même prédicat. Une case grisée que `basculer` accepterait, ou une case
    // vive qui ne fait rien, sont deux défauts — et le second est celui-ci.
    for (const partiel of [[], SIX.slice(0, 3), SIX.slice(0, 5), SIX]) {
      for (const c of CHIFFRES) {
        // Un chiffre DÉJÀ dans la ligne n'est pas un ajout : c'est un
        // retrait, traité par le témoin suivant. On compare ici ce que le
        // sélecteur grise à ce que `basculer` ajoute VRAIMENT.
        if (partiel.includes(c.id)) continue;
        const refuse = ajoutRefuse(partiel, c.id);
        const apres = basculer(partiel, c.id);
        const aEteAjoute = apres.includes(c.id);
        expect(
          aEteAjoute,
          `« ${c.id} » sur ${partiel.length} chiffre(s) : le sélecteur grise ${refuse}, basculer ajoute ${aEteAjoute}`,
        ).toBe(!refuse);
      }
    }
  });

  it('🔴 décocher n’est JAMAIS refusé, même ligne pleine', () => {
    for (const id of SIX) {
      expect(ajoutRefuse(SIX, id), `« ${id} » est déjà dans la ligne : le retirer doit rester possible`).toBe(false);
      expect(basculer(SIX, id)).toHaveLength(5);
    }
  });

  it('le défaut livré remplit la ligne — c’est pour cela que le message est urgent', () => {
    // #1541. Un profil neuf n'a plus une seule place libre : sans message, sa
    // toute première tentative de composer sa ligne ne fait rien.
    expect(CHOIX_DEFAUT).toHaveLength(MAXIMUM_CHIFFRES);
    expect(ligneComplete(CHOIX_DEFAUT)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* L'écran                                                            */
/* ------------------------------------------------------------------ */

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Préférences vides : la page part du défaut — donc PLEINE — et écrit dans le vide. */
function poserLeServeur() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
}

beforeEach(() => {
  poserLeServeur();
  currentProfileId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Un widget de chiffres de témoin, qui note chaque choix qu'on lui passe. */
function ligneDeTemoin() {
  const appels: string[][] = [];
  return {
    appels,
    widget: {
      id: 'temoin',
      cleTitre: 'v2.home.title',
      forme: 'chiffres' as const,
      chiffresComposables: true,
      charger: async () => [],
      chiffres: async (ctx: any) => {
        const ids: string[] = [...(ctx.chiffresChoisis ?? [])];
        appels.push(ids);
        return ids.map((id) => ({ cle: 'v2.home.title', valeur: `#${id}`, id, icone: '' }));
      },
    },
  };
}

async function poserLaPage(widget: any) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: {
      catalogue: [widget],
      dispositionDefaut: ['temoin'],
      cle: 'temoin_widgets',
      cleChiffres: 'temoin_chiffres',
      cleChiffresMigre: 'temoin_chiffres_migre',
    },
  });
  flushSync();
  await souffler(100);
  flushSync();
  return hote;
}

/** Le bouton « Modifier » : le dernier de l'en-tête. */
function entrerEnEdition(page: HTMLElement) {
  const boutons = Array.from(page.querySelectorAll('.v2-actions button')) as HTMLButtonElement[];
  boutons[boutons.length - 1].click();
  flushSync();
}

const cases = (page: HTMLElement) =>
  Array.from(page.querySelectorAll('.choix-chiffres .opt input')) as HTMLInputElement[];
const cochees = (page: HTMLElement) => cases(page).filter((o) => o.closest('.opt')!.classList.contains('on'));
const libres = (page: HTMLElement) => cases(page).filter((o) => !o.closest('.opt')!.classList.contains('on'));
const annonce = (page: HTMLElement) => page.querySelector('.choix-chiffres .plein') as HTMLElement | null;

describe('#1519 — la ligne pleine le DIT, à l’écran', () => {
  it('🔴 ligne pleine : le septième ne se coche pas, ET l’utilisateur sait pourquoi', async () => {
    const { appels, widget } = ligneDeTemoin();
    const page = await poserLaPage(widget);
    entrerEnEdition(page);

    // La page part du défaut : six cartes, donc pleine dès l'ouverture.
    expect(cochees(page).length, 'la ligne ne part pas pleine : ce banc ne prouve rien').toBe(MAXIMUM_CHIFFRES);
    const restantes = libres(page);
    expect(restantes.length, 'le catalogue n’offre aucune carte de plus').toBeGreaterThan(0);

    // 1. LE MESSAGE EST LÀ, il nomme le nombre, et il n'est pas du jargon.
    const p = annonce(page);
    expect(p, 'la région d’annonce du plafond n’existe pas dans le sélecteur').toBeTruthy();
    const texte = (p!.textContent ?? '').trim();
    expect(texte, 'la ligne est pleine et rien ne le dit — c’est le défaut #1519').not.toBe('');
    expect(texte, 'le message ne nomme pas le nombre de chiffres').toContain(String(MAXIMUM_CHIFFRES));
    expect(texte, 'le message ne montre pas la sortie : décocher').toMatch(/décoch/i);
    expect(p!.getAttribute('role'), 'le message n’est pas une région d’annonce : un lecteur d’écran ne le verra pas venir').toBe('status');

    // 2. LES CASES QU'ON NE PEUT PAS COCHER SONT GRISÉES, et ça se voit.
    for (const o of restantes) {
      expect(o.disabled, 'une carte non retenue reste cochable alors que la ligne est pleine').toBe(true);
      expect(
        o.closest('.opt')!.classList.contains('sourd'),
        'la case est refusée mais rien ne le montre à l’œil',
      ).toBe(true);
    }

    // 3. LE CLAVIER ENTEND CE QUE LA SOURIS VOIT. Une case `disabled` sort du
    //    parcours du clavier : ce sont les cases ENCORE atteignables — les
    //    cochées — qui doivent porter le renvoi vers le message.
    for (const o of cochees(page)) {
      expect(
        o.getAttribute('aria-describedby'),
        'une case atteignable au clavier ne renvoie pas au message : le motif du grisé ne s’entend pas',
      ).toBe(p!.id);
    }
    expect(p!.id, 'la région d’annonce n’a pas d’identifiant à citer').toBeTruthy();

    // 4. ET LE SEPTIÈME CLIC NE FAIT TOUJOURS RIEN — c'est voulu : le plafond
    //    n'a pas bougé. Une case `disabled` n'émet pas d'évènement.
    const avant = appels.length;
    const choixAvant = [...appels[appels.length - 1]];
    restantes[0].click();
    await souffler(120);
    flushSync();
    expect(appels.length, 'cliquer une carte grisée a recomposé la ligne : le plafond a été levé').toBe(avant);
    expect(appels[appels.length - 1], 'le choix a changé alors que la ligne était pleine').toEqual(choixAvant);
    expect(cochees(page).length, 'un septième chiffre est entré dans la ligne').toBe(MAXIMUM_CHIFFRES);
  });

  it('🔴 décocher libère une place, et le message s’en va aussitôt', async () => {
    const { widget } = ligneDeTemoin();
    const page = await poserLaPage(widget);
    entrerEnEdition(page);

    expect((annonce(page)!.textContent ?? '').trim(), 'la ligne pleine ne dit rien au départ').not.toBe('');

    // Décocher passe TOUJOURS, plafond ou pas : c'est la porte de sortie que
    // le message désigne. Si elle était grisée elle aussi, la ligne serait
    // définitivement figée.
    const aRetirer = cochees(page)[0];
    expect(aRetirer.disabled, 'une carte DÉJÀ choisie est grisée : la ligne pleine ne pourrait plus jamais changer').toBe(false);
    aRetirer.click();
    await souffler(120);
    flushSync();

    expect(cochees(page).length, 'décocher n’a rien retiré').toBe(MAXIMUM_CHIFFRES - 1);
    expect(
      (annonce(page)!.textContent ?? '').trim(),
      'une place est libre et le message du plafond est toujours affiché',
    ).toBe('');
    for (const o of cases(page)) {
      expect(o.disabled, 'une place est libre et une carte reste grisée').toBe(false);
      expect(
        o.getAttribute('aria-describedby'),
        'une place est libre et une case renvoie encore au message du plafond',
      ).toBeNull();
    }
  });

  it('le sélecteur montre le catalogue ENTIER, cartes locales et réseau comprises', async () => {
    // #1542. Elles ne sont jamais masquées dans la liste de choix — c'est
    // leur VALEUR qui peut manquer, et la carte est alors écartée de la ligne
    // affichée, pas du choix. Sans cela, « aucune place » n'aurait même pas de
    // sens : il n'y aurait rien à choisir.
    const { widget } = ligneDeTemoin();
    const page = await poserLaPage(widget);
    entrerEnEdition(page);
    expect(cases(page).length, 'le sélecteur ne propose pas tout le catalogue').toBe(CHIFFRES.length);
    for (const id of ['titres-locaux', 'titres-reseau', 'albums-locaux', 'albums-reseau']) {
      expect(CHIFFRES.some((c) => c.id === id), `« ${id} » a disparu du catalogue`).toBe(true);
    }
  });
});
