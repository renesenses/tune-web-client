// @vitest-environment jsdom
//
// jsdom, et pas `node` : ce fichier MONTE le composant réel. Sans `window`, le
// runtime client de Svelte n'installe pas son ordonnanceur et « l'indicateur
// s'affiche » passerait au vert sans avoir rien rendu.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// `renesenses/tune-server-rust#1845` — « un indicateur "en cours de lecture"
// sur le titre joué », demandé sur le forum par Didier (fil 1451, 16/08/2026) :
// « savoir ce qui joue sans avoir à passer dans la vue lecture en cours ».
//
// Le client ACTUEL le fait depuis la v0.9.93 (`LibraryView`). Le NOUVEAU ne le
// faisait qu'à moitié : `piste.id === $currentTrackId` posait une couleur
// d'accent sur le titre, et rien d'autre. Trois manques, tous visibles :
//
//   1. une COULEUR SEULE — invisible pour un daltonisme rouge-vert, muette pour
//      un lecteur d'écran ;
//   2. aucune trace de la PAUSE : une piste en pause s'affichait exactement
//      comme une piste qui joue ;
//   3. les pistes de STREAMING n'étaient jamais marquées — elles n'ont pas
//      d'identifiant local, et la comparaison ne connaissait que celui-là.
//
// Ce que cette garde tient : les trois états sont rendus par le COMPOSANT réel,
// chacun avec sa forme ET son nom accessible ; `etatDeLaLigne` tranche les trois
// cas ci-dessus ; les onze langues portent les clés.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import IndicateurLecture from '../../components/v2/IndicateurLecture.svelte';
import { etatDeLaLigne } from '../stores/nowPlaying';
import { locale } from '../i18n';
import type { NowPlaying } from '../types';
// Tous préfixés `l` : `import it from '../locales/it'` écraserait le `it` de
// Vitest.
import lFr from '../locales/fr';
import lDe from '../locales/de';
import lEn from '../locales/en';
import lEs from '../locales/es';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lZh from '../locales/zh';

const fr = lFr as Record<string, string>;
const CLES = ['v2.piste.enLecture', 'v2.piste.enPause', 'v2.piste.arretee'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(IndicateurLecture, { target: hote, props });
  return hote;
}
function demonter() {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
}
afterEach(() => {
  demonter();
  locale.set('fr');
});

describe('l’indicateur « en cours de lecture » (#1845)', () => {
  it('en LECTURE : une icône animée, et un nom pour qui ne voit pas la couleur', () => {
    const el = poser({ etat: 'lecture' });
    const ind = el.querySelector('.il');
    expect(ind).not.toBeNull();
    // 🔴 Le cœur du ticket : le repère ne repose PAS sur la seule couleur.
    expect(ind?.getAttribute('aria-label')).toBe(fr['v2.piste.enLecture']);
    expect(ind?.getAttribute('title')).toBe(fr['v2.piste.enLecture']);
    expect(el.querySelector('svg')).not.toBeNull();
    // Les barres s'agitent : c'est ce qui distingue « joue » de « en pause »
    // avant même qu'on lise la forme.
    expect(ind?.classList.contains('joue')).toBe(true);
    expect(el.querySelectorAll('.b')).toHaveLength(3);
  });

  it('en PAUSE : même famille de forme, mais figée, et un AUTRE nom', () => {
    const el = poser({ etat: 'pause' });
    const ind = el.querySelector('.il');
    expect(ind).not.toBeNull();
    expect(ind?.getAttribute('aria-label')).toBe(fr['v2.piste.enPause']);
    // Contre-épreuve du cas précédent : sans cette assertion, un indicateur qui
    // dirait toujours « en lecture » passerait les deux tests.
    expect(ind?.getAttribute('aria-label')).not.toBe(fr['v2.piste.enLecture']);
    expect(ind?.classList.contains('joue')).toBe(false);
  });

  it('à l’ARRÊT : une forme différente, et un troisième nom', () => {
    const el = poser({ etat: 'arret' });
    const ind = el.querySelector('.il');
    expect(ind?.getAttribute('aria-label')).toBe(fr['v2.piste.arretee']);
    // Le carré, pas les barres : deux dessins qu'on ne confond pas.
    expect(el.querySelectorAll('.b')).toHaveLength(0);
    expect(el.querySelector('rect')).not.toBeNull();
  });

  it('sans état, il ne rend RIEN — une ligne ordinaire n’est pas décorée', () => {
    for (const props of [{}, { etat: null }]) {
      const el = poser(props);
      expect(el.querySelector('.il')).toBeNull();
      expect(el.textContent?.trim()).toBe('');
      demonter();
    }
    // Contre-épreuve : le même montage AVEC un état rend bien quelque chose.
    expect(poser({ etat: 'lecture' }).querySelector('.il')).not.toBeNull();
  });

  it('suit la langue, et l’anglais ne retombe pas sur le nom de la clé', () => {
    locale.set('en');
    const attendu = (lEn as Record<string, string>)['v2.piste.enLecture'];
    expect(attendu).not.toBe('v2.piste.enLecture');
    expect(poser({ etat: 'lecture' }).querySelector('.il')?.getAttribute('aria-label'))
      .toBe(attendu);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La DÉCISION — quelle ligne porte quel état.
// ─────────────────────────────────────────────────────────────────────────────
const np = (o: Partial<NowPlaying>): NowPlaying => ({ title: 'x', ...o }) as NowPlaying;

describe('etatDeLaLigne — quelle ligne, et dans quel état (#1845)', () => {
  it('la piste de bibliothèque qui joue', () => {
    expect(etatDeLaLigne({ id: 42 }, 42, np({ track_id: 42 }), 'playing')).toBe('lecture');
  });

  // 🔴 Le cas que le ticket demandait explicitement, et que la comparaison
  // d'identifiants ne pouvait pas rendre : elle ignorait l'état du transport.
  it('la MÊME piste, mise en pause, ne dit plus qu’elle joue', () => {
    expect(etatDeLaLigne({ id: 42 }, 42, np({ track_id: 42 }), 'paused')).toBe('pause');
  });

  // Une zone arrêtée pointe toujours sur sa piste : retirer le repère ferait
  // perdre sa place à l'utilisateur, ce que ce ticket corrige justement.
  it('à l’arrêt, la ligne reste repérée — mais autrement nommée', () => {
    expect(etatDeLaLigne({ id: 42 }, 42, np({ track_id: 42 }), 'stopped')).toBe('arret');
  });

  it('une piste de STREAMING est reconnue par sa paire source + source_id', () => {
    const piste = { id: null, source: 'qobuz' as const, source_id: '1234' };
    expect(etatDeLaLigne(piste, null, np({ source: 'qobuz', source_id: '1234' }), 'playing'))
      .toBe('lecture');
    // Deux services peuvent numéroter une piste pareil : la source doit concorder.
    expect(etatDeLaLigne(piste, null, np({ source: 'tidal', source_id: '1234' }), 'playing'))
      .toBeNull();
  });

  it('les autres lignes ne disent rien', () => {
    expect(etatDeLaLigne({ id: 43 }, 42, np({ track_id: 42 }), 'playing')).toBeNull();
    // Le garde historique : sans `id != null`, toutes les lignes sans
    // identifiant s'allumeraient ensemble.
    expect(etatDeLaLigne({ id: null }, null, null, 'playing')).toBeNull();
  });
});

describe('les onze langues portent les clés de l’indicateur', () => {
  const langues: [string, Record<string, string>][] = [
    ['fr', lFr], ['en', lEn], ['de', lDe], ['es', lEs], ['hu', lHu], ['it', lIt],
    ['ja', lJa], ['ko', lKo], ['ro', lRo], ['sv', lSv], ['zh', lZh],
  ];
  it('onze fichiers, trois clés chacun, aucune valeur vide', () => {
    expect(langues).toHaveLength(11);
    for (const [nom, dict] of langues) {
      for (const cle of CLES) {
        expect(`${nom}/${cle}`, `${nom} n’a pas ${cle}`).toBeDefined();
        expect((dict[cle] ?? '').length).toBeGreaterThan(1);
      }
    }
  });
});
