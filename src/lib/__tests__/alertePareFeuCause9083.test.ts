// @vitest-environment jsdom
//
// tune-server-rust#9083 — Thierry (fil 2926, rc12 Windows) : l'écran Zones
// affichait « Le pare-feu de Windows filtre Tune sur ce réseau » avec « Passez
// le réseau en Privé » et « autorisez tune-server.exe », alors que le réseau
// était Privé et tune-server.exe déjà autorisé. Le serveur nomme désormais la
// cause (`releve.cause`) ; le bandeau la dit, et ne répète plus une consigne
// déjà suivie.
//
// 🔴 Le témoin principal MONTE le bandeau, `fetch` bouchonné, et lit le texte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlertePareFeu from '../../components/v2/AlertePareFeu.svelte';
import { locale } from '../i18n';
import { alertePareFeu, texteAlertePareFeu, type ProfilReseau } from '../alertePareFeu';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import de from '../locales/de';
import el from '../locales/el';
import es from '../locales/es';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import pl from '../locales/pl';
import ro from '../locales/ro';
import sv from '../locales/sv';
import tr from '../locales/tr';
import vi_ from '../locales/vi';
import zh from '../locales/zh';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;
const PROFIL: Record<ProfilReseau, string> = { domaine: 'Domaine', prive: 'Privé', public: 'Public' };
const tFr = (k: string) => fr[k] ?? k;

const EXE = 'C:\\Users\\thierry\\AppData\\Local\\Programs\\Tune Server\\tune-server.exe';

const charge = (releve: Record<string, unknown>) => ({
  windows: true,
  alerte: true,
  releve: { profils_actifs: ['prive'], profils_non_couverts: ['prive'], programme: EXE, ...releve },
});

const BLOCAGE = charge({
  regle_presente: true, cause: 'regle_de_blocage',
  regles_bloquantes: ['Tune Server (bloqué)'], chemins_autorises_ailleurs: [],
});
const AUTRE_CHEMIN = charge({
  regle_presente: false, cause: 'autre_chemin', regles_bloquantes: [],
  chemins_autorises_ailleurs: ['C:\\Program Files\\Tune\\tune-server.exe'],
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let reponse: unknown = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(reponse),
    json: async () => reponse,
  }) as unknown as Response));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function monter(c: unknown): Promise<string> {
  reponse = c;
  monte = mount(AlertePareFeu, { target: hote!, props: {} });
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  return hote!.textContent ?? '';
}

describe('#9083 — le bandeau nomme la cause', () => {
  it('🔴 règle de blocage : nommée, et où la supprimer ; pas de « passez en Privé »', async () => {
    const texte = await monter(BLOCAGE);
    expect(texte).toContain('Tune Server (bloqué)');
    expect(texte).toContain('Règles de trafic entrant');
    expect(texte).not.toContain(fr['pareFeu.etapePrive']);
    expect(texte).not.toContain(fr['pareFeu.etapeAutoriser']);
    expect(hote!.querySelector('[data-cause="regle_de_blocage"]')).toBeTruthy();
  });

  it('🔴 autre chemin : le programme lancé ET le chemin autorisé sont montrés', async () => {
    const texte = await monter(AUTRE_CHEMIN);
    expect(texte).toContain(`Programme lancé : ${EXE}`);
    expect(texte).toContain('Autorisé : C:\\Program Files\\Tune\\tune-server.exe');
    expect(texte).toContain(`Autoriser une autre application… ▸ ${EXE}`);
    expect(texte).not.toContain(fr['pareFeu.etapePrive']);
  });

  it('🔴 réseau déjà Privé, aucune règle : jamais « Passez le réseau en Privé »', () => {
    const a = alertePareFeu(charge({ regle_presente: false, cause: 'aucune_regle' }))!;
    const x = texteAlertePareFeu(a, tFr, (p) => PROFIL[p]);
    expect(x.etapes).not.toContain(fr['pareFeu.etapePrive']);
    expect(x.etapes).toContain(fr['pareFeu.etapeAutoriser']);
  });

  it('réseau Public (#7371) : les deux remèdes restent', () => {
    const a = alertePareFeu({
      windows: true, alerte: true,
      releve: { profils_non_couverts: ['public'], regle_presente: true, cause: 'profil_non_couvert' },
    })!;
    const x = texteAlertePareFeu(a, tFr, (p) => PROFIL[p]);
    expect(x.corps).toContain('Public');
    expect(x.etapes).toEqual([fr['pareFeu.etapePrive'], fr['pareFeu.etapeAutoriser'], fr['pareFeu.etapeRedemarrer']]);
  });

  it('serveur antérieur à #9083 (pas de cause) : consigne générale', () => {
    const a = alertePareFeu({ windows: true, alerte: true, releve: { profils_non_couverts: ['public'], regle_presente: false } })!;
    expect(a.cause).toBeNull();
    expect(a.reglesBloquantes).toEqual([]);
    expect(texteAlertePareFeu(a, tFr, (p) => PROFIL[p]).corps).toContain('Public');
  });

  it('une cause inconnue ou sans données retombe sur la consigne générale', () => {
    const a = alertePareFeu(charge({ cause: 'martienne' }))!;
    expect(a.cause).toBeNull();
    const b = alertePareFeu(charge({ cause: 'regle_de_blocage', regles_bloquantes: [] }))!;
    expect(texteAlertePareFeu(b, tFr, (p) => PROFIL[p]).etapes).toContain(fr['pareFeu.etapeAutoriser']);
  });
});

describe('#9083 — les clés existent dans les 16 langues, avec leurs jetons', () => {
  const langues = { fr, en, de, el, es, hu, it: it_, ja, ko, nb, pl, ro, sv, tr, vi: vi_, zh } as Record<string, Record<string, string>>;
  const JETONS: Record<string, string[]> = {
    'pareFeu.corpsBlocage': ['{profils}', '{regles}'],
    'pareFeu.etapeSupprimerBlocage': ['{regles}'],
    'pareFeu.corpsAutreChemin': ['{profils}'],
    'pareFeu.programmeLance': ['{chemin}'],
    'pareFeu.cheminsAutorises': ['{chemins}'],
    'pareFeu.etapeAutoriserLance': ['{chemin}'],
  };
  it('16 langues', () => expect(Object.keys(langues)).toHaveLength(16));
  for (const [cle, jetons] of Object.entries(JETONS)) {
    it(cle, () => {
      for (const [l, dico] of Object.entries(langues)) {
        expect(typeof dico[cle], `${l} : ${cle}`).toBe('string');
        for (const j of jetons) expect(dico[cle], `${l} : ${cle} sans ${j}`).toContain(j);
        // Le pare-feu Windows laisse SORTIR par défaut : ces textes ne parlent
        // que de l'entrant, jamais d'une connexion sortante.
        expect(dico[cle].toLowerCase(), `${l} : ${cle}`).not.toMatch(/sortant|outbound|chromecast/);
      }
    });
  }
  it('anglais : les mêmes sens', () => {
    expect(en['pareFeu.etapeSupprimerBlocage']).toContain('Inbound Rules');
    expect(en['pareFeu.programmeLance']).toBe('Running program: {chemin}');
  });
});
