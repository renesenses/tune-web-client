/**
 * Garde de démarrage d'`index.html` (tune-web-client#3054), exécutée pour de
 * vrai dans un bac à sable (vm) avec une fausse fenêtre.
 *
 * Constat du 15/11/2026 (.18, pré-release rc12) : après la pose du nouveau
 * serveur et du nouveau web, écran NOIR jusqu'à un Cmd+Maj+R. Quand le bundle
 * d'entrée n'arrive pas, aucun code de l'application ne tourne : ni
 * `vite:preloadError`, ni la surveillance de version. Seul un script classique
 * placé AVANT le bundle peut encore agir.
 *
 * Ce qui est gardé : UN rechargement automatique, protégé contre les boucles
 * par sessionStorage ; puis un message clair au lieu d'un écran noir ; les
 * ressources d'une autre origine (polices) ignorées ; rien après le montage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'node:vm';

const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');
const ORIGINE = 'http://tune.local:8888';

function scriptDeLaGarde(): string {
  const m = INDEX.match(/<script id="tune-garde-demarrage">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('garde de démarrage absente d’index.html');
  return m[1];
}

type Element = { id?: string; tagName: string; children: Element[]; parentNode?: Element | null; [k: string]: any };

function bac(o: { stockage?: Map<string, string> | 'refuse'; langue?: string; maintenant?: number } = {}) {
  const stockage = o.stockage ?? new Map<string, string>();
  const ecouteurs: { type: string; f: (e: any) => void; capture: boolean }[] = [];
  const minuteries: (() => void)[] = [];
  let rechargements = 0;
  const elements: Element[] = [];
  const corps: Element = {
    tagName: 'BODY',
    children: [],
    appendChild(el: Element) { el.parentNode = corps; corps.children.push(el); elements.push(el); },
    removeChild(el: Element) { corps.children = corps.children.filter((x) => x !== el); el.parentNode = null; },
  };
  const document = {
    body: corps,
    getElementById: (id: string) => corps.children.find((e) => e.id === id) ?? null,
    createElement: (tag: string): Element => ({
      tagName: tag.toUpperCase(),
      children: [],
      style: {},
      setAttribute() {},
      appendChild(this: Element, el: Element) { this.children.push(el); },
    }),
  };
  const fenetre: any = {
    document,
    navigator: { language: o.langue ?? 'fr-FR' },
    location: { origin: ORIGINE, reload: () => { rechargements++; } },
    addEventListener: (type: string, f: (e: any) => void, capture?: boolean) =>
      ecouteurs.push({ type, f, capture: !!capture }),
    setTimeout: (f: () => void) => { minuteries.push(f); return minuteries.length; },
    clearTimeout: (n: number) => { minuteries[n - 1] = () => {}; },
  };
  Object.defineProperty(fenetre, 'sessionStorage', {
    get() {
      if (stockage === 'refuse') throw new Error('SecurityError');
      return { getItem: (k: string) => stockage.get(k) ?? null, setItem: (k: string, v: string) => void stockage.set(k, v) };
    },
  });
  const DateFixe = { now: () => o.maintenant ?? 1_000_000 };
  vm.runInNewContext(scriptDeLaGarde(), { window: fenetre, Date: DateFixe, Number, String });

  const erreurDeRessource = (tagName: string, url: string) => {
    const e = { target: { tagName, src: tagName === 'SCRIPT' ? url : undefined, href: tagName === 'LINK' ? url : undefined } };
    for (const l of ecouteurs) if (l.type === 'error') l.f(e);
  };
  const message = () => document.getElementById('tune-secours-demarrage');
  const texteDuMessage = () => message()?.children[0]?.textContent as string | undefined;
  return {
    fenetre, stockage, erreurDeRessource, message, texteDuMessage, ecouteurs,
    get rechargements() { return rechargements; },
    toutesLesMinuteries: () => minuteries.forEach((f) => f()),
  };
}

describe('garde de démarrage d’index.html (#3054)', () => {
  it('est un script classique placé AVANT le bundle d’entrée', () => {
    const garde = INDEX.indexOf('id="tune-garde-demarrage"');
    expect(garde).toBeGreaterThan(-1);
    expect(INDEX.indexOf('<script type="module"')).toBeGreaterThan(garde);
    expect(INDEX).not.toMatch(/<script id="tune-garde-demarrage"[^>]*type="module"/);
  });

  it('écoute les erreurs de ressources EN CAPTURE (elles ne remontent pas)', () => {
    const b = bac();
    expect(b.ecouteurs.some((l) => l.type === 'error' && l.capture)).toBe(true);
  });

  it('bundle d’entrée introuvable : un rechargement automatique', () => {
    const b = bac();
    b.erreurDeRessource('SCRIPT', `${ORIGINE}/assets/index-ANCIEN.js`);
    expect(b.rechargements).toBe(1);
    expect(b.message()).toBeNull();
    expect(b.stockage instanceof Map && b.stockage.get('tune-rechargement-demarrage')).toBe('1000000');
  });

  it('nouvel échec après le rechargement : message, pas de boucle', () => {
    const stockage = new Map([['tune-rechargement-demarrage', '990000']]);
    const b = bac({ stockage, maintenant: 1_000_000 });
    b.erreurDeRessource('SCRIPT', `${ORIGINE}/assets/index-ANCIEN.js`);
    expect(b.rechargements).toBe(0);
    expect(b.texteDuMessage()).toBe('Nouvelle version de Tune : rechargez la page.');
    // Un second échec n'empile pas un second message.
    b.erreurDeRessource('LINK', `${ORIGINE}/assets/index-ANCIEN.css`);
    expect(b.fenetre.document.body.children).toHaveLength(1);
  });

  it('hors de la fenêtre anti-boucle (mise à jour suivante) : recharge de nouveau', () => {
    const stockage = new Map([['tune-rechargement-demarrage', '1']]);
    const b = bac({ stockage, maintenant: 1_000_000 });
    b.erreurDeRessource('SCRIPT', `${ORIGINE}/assets/index-X.js`);
    expect(b.rechargements).toBe(1);
  });

  it('sans sessionStorage utilisable : jamais de rechargement, le message', () => {
    const b = bac({ stockage: 'refuse' });
    b.erreurDeRessource('SCRIPT', `${ORIGINE}/assets/index-X.js`);
    expect(b.rechargements).toBe(0);
    expect(b.message()).not.toBeNull();
  });

  it('une ressource d’une autre origine (polices Google) ne déclenche rien', () => {
    const b = bac();
    b.erreurDeRessource('LINK', 'https://fonts.googleapis.com/css2?family=Lato');
    expect(b.rechargements).toBe(0);
    expect(b.message()).toBeNull();
  });

  it('après le montage, plus rien : l’application gère ses propres erreurs', () => {
    const b = bac();
    b.fenetre.__tuneDemarrage.monte();
    b.erreurDeRessource('SCRIPT', `${ORIGINE}/assets/Bibliotheque-X.js`);
    b.toutesLesMinuteries();
    expect(b.rechargements).toBe(0);
    expect(b.message()).toBeNull();
  });

  it('échec signalé par main.ts : même chemin (rechargement, puis message)', () => {
    const b = bac();
    b.fenetre.__tuneDemarrage.echec();
    expect(b.rechargements).toBe(1);
    b.fenetre.__tuneDemarrage.echec();
    expect(b.rechargements).toBe(1);
    expect(b.message()).not.toBeNull();
  });

  it('démarrage muet (rien monté) : la minuterie affiche le message, que le montage retire', () => {
    const b = bac();
    b.toutesLesMinuteries();
    expect(b.message()).not.toBeNull();
    b.fenetre.__tuneDemarrage.monte();
    expect(b.message()).toBeNull();
  });

  it('le bouton recharge ; message en anglais hors français', () => {
    const b = bac({ langue: 'en-US' });
    b.fenetre.__tuneDemarrage.message();
    expect(b.texteDuMessage()).toBe('New version of Tune: please reload the page.');
    b.message()!.children[1].onclick();
    expect(b.rechargements).toBe(1);
  });
});
