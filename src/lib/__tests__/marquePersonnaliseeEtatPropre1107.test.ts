// @vitest-environment jsdom
//
// #1107 — « si pour la marque on choisit "Autre" et que l'on efface le mot
// autre pour mettre le nom voulu, la zone revient à "Choisir une marque" et on
// ne peut plus entrer le texte voulu. » (Gros Bidon, forum fil 1828, 17/09).
//
// Le mode « saisie libre » n'avait pas d'état propre : il se DÉDUISAIT du
// contenu du champ (`brandIsCustom = $derived(selectedBrand === 'Autre' || …)`).
// Or c'est ce même champ que l'utilisateur vide pour taper son texte : à la
// dernière lettre effacée, la condition retombe à faux, le `<input>` quitte le
// DOM et le `<select>` le remplace sur « — Choisir une marque — ». La saisie en
// cours est perdue et il n'y a plus nulle part où taper.
//
// 🔴 CE TÉMOIN MONTE L'ÉDITEUR ET TAPE DEDANS. Il ne cherche aucune variable
// dans le source : il joue la séquence du testeur sur le DOM réel — choisir
// « Autre… », saisir, TOUT EFFACER — et regarde quel contrôle est à l'écran.
// Une garde qui vérifierait la présence d'un `$state` passerait au vert devant
// un état propre mal branché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ZoneDeviceEditor from '../../components/partages/ZoneDeviceEditor.svelte';
import { locale } from '../i18n';
import type { Zone } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

interface Requete {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

let requetes: Requete[] = [];

/** Un catalogue NON VIDE : sans lui, la liste n'a rien à proposer. */
const CATALOGUE = {
  version: 1,
  brands: [
    { name: 'Eversolo', models: [{ name: 'DMP-A6' }] },
    { name: 'Tascam', models: [{ name: 'US-2x2' }] },
  ],
};

/** Une zone nue : ni override, ni détection. L'écran ouvre donc sur la liste. */
const ZONE_NUE = (): Zone =>
  ({
    id: 7,
    name: 'Sortie TASCAM',
    brand: null,
    model: null,
    detected_manufacturer: null,
    detected_model: null,
    identite_appareil_effacee: false,
  }) as unknown as Zone;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

beforeEach(() => {
  requetes = [];
  locale.set('fr');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: Record<string, unknown> | null = null;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = null;
        }
      }
      requetes.push({ method, url, body });
      let charge: unknown = {};
      if (url.includes('/devices/catalog')) charge = CATALOGUE;
      // Le serveur rend la fiche complète ; il retient ce qu'on lui a envoyé.
      if (method === 'PATCH' && /\/zones\/\d+$/.test(url)) {
        charge = { ...ZONE_NUE(), brand: body?.brand ?? null, model: body?.model ?? null };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte, { outro: false });
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function poser(zone: Zone) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ZoneDeviceEditor, { target: hote, props: { zone } });
  await souffler();
  return hote;
}

/** Le bloc d'un champ, trouvé par son intitulé affiché (Marque / Modèle). */
function bloc(intitule: string): HTMLElement {
  const etiquette = [...hote!.querySelectorAll('span')].find(
    (e) => (e.textContent ?? '').trim() === intitule,
  );
  expect(etiquette, `intitulé « ${intitule} » absent de l’éditeur`).toBeTruthy();
  const parent = (etiquette as HTMLElement).parentElement;
  expect(parent).toBeTruthy();
  return parent as HTMLElement;
}

const champTexte = (intitule: string) =>
  bloc(intitule).querySelector('input[type="text"]') as HTMLInputElement | null;
const listeDeroulante = (intitule: string) =>
  bloc(intitule).querySelector('select') as HTMLSelectElement | null;

const MARQUE = () => fr['zoneConfig.brand'];
const MODELE = () => fr['zoneConfig.model'];

/** Choisir une option dans la liste, comme un clic d'utilisateur. */
function choisir(intitule: string, valeur: string) {
  const sel = listeDeroulante(intitule);
  expect(sel, `pas de liste pour « ${intitule} »`).toBeTruthy();
  sel!.value = valeur;
  expect(sel!.value, `l’option « ${valeur} » n’existe pas dans la liste`).toBe(valeur);
  sel!.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

/** Taper (ou tout effacer) dans le champ libre. */
function taper(intitule: string, texte: string) {
  const inp = champTexte(intitule);
  expect(inp, `pas de champ texte pour « ${intitule} » — rien où taper`).toBeTruthy();
  inp!.value = texte;
  inp!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

/** La valeur de l'option « Autre… » dans la liste, telle que le DOM la porte. */
function valeurAutre(intitule: string): string {
  const sel = listeDeroulante(intitule)!;
  const opt = [...sel.options].find((o) => o.textContent?.trim() === fr['zoneConfig.other']);
  expect(opt, `option « ${fr['zoneConfig.other']} » absente de la liste`).toBeTruthy();
  return opt!.value;
}

function patchsDeZone(): Requete[] {
  return requetes.filter((r) => r.method === 'PATCH' && /\/zones\/\d+$/.test(r.url));
}

function boutonAppliquer(): HTMLButtonElement | null {
  return (
    ([...hote!.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === fr['common.apply'],
    ) as HTMLButtonElement) ?? null
  );
}

describe('#1107 — la séquence du testeur, jouée sur le DOM', () => {
  it('choisir « Autre… », saisir, TOUT EFFACER : le champ libre RESTE', async () => {
    await poser(ZONE_NUE());

    // 1. L'écran ouvre bien sur la liste.
    expect(listeDeroulante(MARQUE()), 'l’écran doit ouvrir sur la liste').toBeTruthy();

    // 2. « Autre… » → le champ libre apparaît.
    choisir(MARQUE(), valeurAutre(MARQUE()));
    expect(champTexte(MARQUE()), '« Autre… » doit ouvrir un champ de saisie').toBeTruthy();

    // 3. On saisit.
    taper(MARQUE(), 'US-366');
    expect(champTexte(MARQUE())!.value).toBe('US-366');

    // 4. On EFFACE TOUT — le geste du testeur.
    taper(MARQUE(), '');

    // 5. 🔴 Le champ libre doit être toujours là, et la liste absente.
    expect(
      champTexte(MARQUE()),
      'champ vidé : le champ de saisie a disparu, il n’y a plus nulle part où taper (#1107)',
    ).toBeTruthy();
    expect(
      listeDeroulante(MARQUE()),
      'champ vidé : la liste « Choisir une marque » est revenue toute seule (#1107)',
    ).toBeNull();
  });

  it('après avoir tout effacé, on peut taper le nom voulu D’UN COUP', async () => {
    // Le contournement du testeur — taper après le mot « Autre » puis effacer
    // ce mot — ne doit plus être nécessaire.
    await poser(ZONE_NUE());
    choisir(MARQUE(), valeurAutre(MARQUE()));
    taper(MARQUE(), '');

    taper(MARQUE(), 'Gros Bidon Audio');
    expect(champTexte(MARQUE())).toBeTruthy();
    expect(champTexte(MARQUE())!.value).toBe('Gros Bidon Audio');
  });

  it('taper un nom du catalogue ne confisque pas le champ en pleine frappe', async () => {
    // Même famille : la déduction basculait aussi sur « Eversolo » tapé à la
    // main, en plein milieu d'une saisie libre.
    await poser(ZONE_NUE());
    choisir(MARQUE(), valeurAutre(MARQUE()));
    taper(MARQUE(), '');
    taper(MARQUE(), 'Eversolo');

    expect(
      champTexte(MARQUE()),
      'le champ a été confisqué parce que le texte tapé figure au catalogue',
    ).toBeTruthy();
    expect(champTexte(MARQUE())!.value).toBe('Eversolo');
  });

  it('le Modèle souffre du même défaut, et ne doit pas non plus retomber', async () => {
    await poser(ZONE_NUE());
    // Marque prise AU CATALOGUE : le modèle a donc sa propre liste.
    choisir(MARQUE(), 'Tascam');
    await souffler(2);
    expect(listeDeroulante(MODELE()), 'le modèle doit proposer une liste').toBeTruthy();

    choisir(MODELE(), valeurAutre(MODELE()));
    taper(MODELE(), 'US-366');
    taper(MODELE(), '');

    expect(
      champTexte(MODELE()),
      'modèle vidé : le champ de saisie a disparu (même défaut que #1107)',
    ).toBeTruthy();
    expect(listeDeroulante(MODELE())).toBeNull();
  });
});

describe('#1107 — le CONTRAT serveur ne bouge pas', () => {
  it('une marque personnalisée part en `PATCH /zones/7 {brand, model}`, texte brut', async () => {
    await poser(ZONE_NUE());
    choisir(MARQUE(), valeurAutre(MARQUE()));
    taper(MARQUE(), '');
    taper(MARQUE(), '  Gros Bidon Audio  ');
    taper(MODELE(), 'US-366');

    const bouton = boutonAppliquer();
    expect(bouton, 'rien à appliquer alors que la marque a changé').toBeTruthy();
    bouton!.click();
    await souffler(8);

    const patchs = patchsDeZone();
    expect(patchs.length, `aucun PATCH. Vu : ${requetes.map((r) => `${r.method} ${r.url}`).join(' | ')}`).toBe(1);
    expect(patchs[0].url).toMatch(/\/zones\/7$/);
    // 🔴 Deux champs, deux chaînes, taillées aux extrémités. Aucun drapeau de
    // mode, aucun sentinelle : le mode de saisie est affaire d'écran.
    expect(patchs[0].body).toEqual({ brand: 'Gros Bidon Audio', model: 'US-366' });
  });

  it('une marque prise AU CATALOGUE part sous la même forme', async () => {
    await poser(ZONE_NUE());
    choisir(MARQUE(), 'Eversolo');
    await souffler(2);
    choisir(MODELE(), 'DMP-A6');

    boutonAppliquer()!.click();
    await souffler(8);

    expect(patchsDeZone()[0].body).toEqual({ brand: 'Eversolo', model: 'DMP-A6' });
  });

  it('le mot « Autre » n’est jamais envoyé comme nom de marque', async () => {
    // Il désigne un MODE de saisie, pas un fabricant : le laisser partir
    // écrirait « Autre » dans l'identité de l'appareil.
    await poser(ZONE_NUE());
    choisir(MARQUE(), valeurAutre(MARQUE()));
    taper(MARQUE(), 'Tascam Pro');

    boutonAppliquer()!.click();
    await souffler(8);

    expect(patchsDeZone()[0].body).toEqual({ brand: 'Tascam Pro', model: '' });
  });
});

describe('#1107 — ce que l’état propre ne doit PAS casser', () => {
  it('une marque hors catalogue ouvre en saisie libre, catalogue chargé', async () => {
    const zone = ZONE_NUE();
    zone.brand = 'Gros Bidon Audio';
    await poser(zone);
    await souffler(4);

    expect(champTexte(MARQUE()), 'une marque hors catalogue doit s’afficher en saisie libre').toBeTruthy();
    expect(champTexte(MARQUE())!.value).toBe('Gros Bidon Audio');
  });

  it('une marque DU catalogue ouvre sur la liste, positionnée dessus', async () => {
    const zone = ZONE_NUE();
    zone.brand = 'Eversolo';
    await poser(zone);
    await souffler(4);

    const sel = listeDeroulante(MARQUE());
    expect(sel, 'une marque du catalogue doit s’afficher dans la liste').toBeTruthy();
    expect(sel!.value).toBe('Eversolo');
  });

  it('on revient à la liste par un GESTE, sans avoir à remonter l’écran', async () => {
    await poser(ZONE_NUE());
    choisir(MARQUE(), valeurAutre(MARQUE()));
    taper(MARQUE(), '');
    expect(champTexte(MARQUE())).toBeTruthy();

    const retour = [...bloc(MARQUE()).parentElement!.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === fr['zoneConfig.backToList'],
    ) as HTMLButtonElement | undefined;
    expect(
      retour,
      'aucun chemin de retour : une fois en saisie libre, l’utilisateur y serait enfermé',
    ).toBeTruthy();

    retour!.click();
    await souffler(2);
    expect(listeDeroulante(MARQUE()), 'le geste explicite doit rendre la liste').toBeTruthy();
  });
});

describe('#1107 — l’intitulé du retour, dans les onze langues', () => {
  it('`zoneConfig.backToList` existe partout et n’est pas vide', async () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    for (const code of langues) {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      expect(dico['zoneConfig.backToList'], `${code} / zoneConfig.backToList`).toBeTruthy();
    }
  });
});
