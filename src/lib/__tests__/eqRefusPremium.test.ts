import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estRefusPremium } from '../premiumRefus';
import * as locales from '../locales';

/**
 * Un refus d'offre ne doit pas se lire comme une panne (#2419).
 *
 * Le panneau « Égaliseur » de l'écran Lecture en cours affiche sept
 * préréglages, sans la moindre condition de licence. La route qu'ils
 * appellent, `POST /zones/{id}/eq`, est gardée côté serveur par
 * `require_premium(…, Feature::DspEq)` et répond **402 Payment Required** à un
 * serveur sans licence. `setEqPreset` finissait sur :
 *
 *     catch (e) { console.error('EQ error:', e); }
 *
 * Du point de vue de l'auditeur : le bouton se clique, et il ne se passe rien.
 * C'est le signalement de Daniel POUCHON (fil forum 1364, 11/08/2026) —
 * « Toujours du mal à activer/désactiver l'égaliseur ».
 *
 * NUANCE ÉTABLIE EN LISANT LE CODE, et qui corrige le corps de l'issue : le
 * refus n'était pas totalement muet. `fetchJSON` lève une notification sur
 * tout 402 depuis juin (`api.ts`, bloc `status === 402`). Mais elle affiche en
 * priorité le `message` du serveur — « Parametric EQ requires Tune Premium »,
 * en ANGLAIS, `premium_guard.rs` le construit avec `feature.display_name()` —
 * dans une interface qui peut être en dix autres langues ; elle s'efface au
 * bout de cinq secondes ; et le panneau, lui, continue d'offrir sept boutons
 * qui ne feront jamais rien.
 *
 * Le contrat protégé ici tient en trois points :
 *
 *  1. le client sait RECONNAÎTRE un refus premium, sous les deux formes que
 *     la couche API lui donne ;
 *  2. le panneau se VERROUILLE et le DIT, au lieu de laisser cliquer ;
 *  3. plus aucun échec d'écriture de l'égaliseur ne meurt en silence.
 *
 * Reste en environnement `node` : hors du test unitaire, on ne lit que du
 * texte.
 */

const NOW_PLAYING = readFileSync(
  resolve(process.cwd(), 'src/components/NowPlaying.svelte'),
  'utf-8',
);
const PANNEAU = readFileSync(
  resolve(process.cwd(), 'src/components/NowPlayingEqPanel.svelte'),
  'utf-8',
);
const API = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');

/** Le corps d'une fonction `async function <nom>` du bloc script. */
function corpsDeFonction(source: string, nom: string): string {
  const debut = source.indexOf(`async function ${nom}`);
  expect(debut, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  const fin = source.indexOf('\n  }', debut);
  expect(fin, `fin de ${nom} introuvable`).toBeGreaterThan(debut);
  return source.slice(debut, fin);
}

describe('reconnaître un refus premium', () => {
  /**
   * Deux formes, parce que la couche API en produit deux. Sur un 402,
   * `fetchJSON` lève un `Error` NU dont le seul signe distinctif est le
   * message `premium_required` — il n'a ni `status` ni `code`. Les autres
   * chemins passent par `apiError()`, qui construit un `ApiError` portant
   * `status` et `code`. Un appelant qui ne saurait lire qu'une seule des deux
   * traiterait la moitié des refus comme des pannes.
   */
  it('reconnaît l’erreur nue que `fetchJSON` lève sur un 402', () => {
    expect(estRefusPremium(new Error('premium_required'))).toBe(true);
  });

  it('reconnaît un ApiError portant le statut 402', () => {
    const e = Object.assign(new Error('Parametric EQ requires Tune Premium'), {
      status: 402,
    });
    expect(estRefusPremium(e)).toBe(true);
  });

  it('reconnaît un ApiError portant le code `premium_required`', () => {
    const e = Object.assign(new Error('nope'), { code: 'premium_required' });
    expect(estRefusPremium(e)).toBe(true);
  });

  /**
   * La contre-épreuve du reconnaisseur : s'il disait « oui » à tout, les
   * tests ci-dessus passeraient sans rien prouver, et une vraie panne serait
   * présentée à l'auditeur comme une invitation à payer.
   */
  it('ne prend pas une panne pour une limite d’offre', () => {
    expect(estRefusPremium(new Error('Network request failed'))).toBe(false);
    expect(
      estRefusPremium(Object.assign(new Error('boom'), { status: 500 })),
    ).toBe(false);
    expect(
      estRefusPremium(Object.assign(new Error('nope'), { code: 'zone_not_found' })),
    ).toBe(false);
    expect(estRefusPremium(undefined)).toBe(false);
    expect(estRefusPremium(null)).toBe(false);
    expect(estRefusPremium('premium_required')).toBe(false);
  });
});

describe('le panneau EQ de Lecture en cours devant une licence absente', () => {
  it('reçoit l’état de licence — `isPremium` ne peut plus être absent du fichier', () => {
    expect(
      NOW_PLAYING.includes("from '../lib/stores/license'"),
      'NowPlaying.svelte n’importe toujours pas l’état de licence',
    ).toBe(true);
    expect(NOW_PLAYING).toMatch(/\$isPremium/);
  });

  it('transmet le verrou au panneau', () => {
    const debut = NOW_PLAYING.indexOf('<NowPlayingEqPanel');
    expect(debut).toBeGreaterThan(-1);
    const balise = NOW_PLAYING.slice(debut, NOW_PLAYING.indexOf('/>', debut));
    expect(balise, 'le panneau EQ ne reçoit aucun verrou de licence').toMatch(
      /\blocked=\{/,
    );
  });

  /**
   * Le point central. Le serveur est l'AUTORITÉ : `$isPremium` est lu au
   * démarrage et peut mentir (licence active ailleurs, fonction absente du
   * palier, statut jamais rechargé). Un 402 reçu doit donc verrouiller le
   * panneau à son tour — sinon on aurait remplacé un clic muet par un clic
   * muet mieux décoré.
   */
  it('un 402 reçu verrouille le panneau au lieu de partir dans la console', () => {
    const corps = corpsDeFonction(NOW_PLAYING, 'setEqPreset');
    expect(corps, 'setEqPreset avale encore son échec dans console.error').not.toContain(
      'console.error',
    );
    expect(corps, 'setEqPreset ne distingue pas un refus premium d’une panne').toContain(
      'estRefusPremium',
    );
  });

  it('un échec qui n’est PAS un refus premium se dit quand même à l’écran', () => {
    const corps = corpsDeFonction(NOW_PLAYING, 'setEqPreset');
    expect(corps, 'une panne d’écriture EQ reste silencieuse').toMatch(
      /notifications\.error\(/,
    );
  });
});

describe('le panneau verrouillé dit ce qu’il refuse', () => {
  it('n’offre plus des boutons qui ne feront rien', () => {
    const debut = PANNEAU.indexOf('class="eq-preset"');
    expect(debut, 'les boutons de préréglage sont introuvables').toBeGreaterThan(-1);
    const bouton = PANNEAU.slice(debut, PANNEAU.indexOf('</button>', debut));
    expect(bouton, 'les préréglages restent cliquables sans licence').toMatch(
      /disabled=\{/,
    );
  });

  it('affiche un texte traduit, jamais du français en dur', () => {
    expect(PANNEAU).toMatch(/\$t\('nowplaying\.eqPremium'\)/);
  });

  it('accepte le verrou en propriété', () => {
    expect(PANNEAU).toMatch(/locked\??\s*:\s*boolean/);
  });
});

describe('la notification de 402 parle la langue de l’interface', () => {
  /**
   * `premium_guard.rs` compose son `message` avec `feature.display_name()` :
   * « Parametric EQ requires Tune Premium ». Le montrer tel quel affiche de
   * l'anglais à un utilisateur français, hongrois ou japonais. La chaîne de
   * repli codée en dur dans `api.ts`, elle, était du français montré à un
   * anglophone. Les deux sont le même défaut.
   */
  it('n’affiche plus le message anglais du serveur ni un repli en dur', () => {
    const debut = API.indexOf('response.status === 402');
    expect(debut).toBeGreaterThan(-1);
    const bloc = API.slice(debut, debut + 600);
    expect(bloc, 'le message anglais du serveur est encore affiché tel quel').not.toContain(
      'body?.message',
    );
    expect(bloc, 'une chaîne française est encore codée en dur').not.toContain(
      'Tune Premium requis',
    );
    expect(bloc, 'la notification de 402 n’est pas traduite').toMatch(
      /get\(t\)\('premium\.required'\)/,
    );
  });
});

describe('les onze langues', () => {
  const LANGUES = {
    fr: locales.fr,
    en: locales.en,
    de: locales.de,
    es: locales.es,
    it: locales.it,
    zh: locales.zh,
    ja: locales.ja,
    ko: locales.ko,
    ro: locales.ro,
    sv: locales.sv,
    hu: locales.hu,
  } as Record<string, Record<string, string>>;

  const NOUVELLES = ['nowplaying.eqPremium', 'nowplaying.eqError', 'premium.required'];

  for (const [code, dict] of Object.entries(LANGUES)) {
    for (const cle of NOUVELLES) {
      it(`${code} traduit ${cle}`, () => {
        expect(dict[cle], `clé absente en ${code} : ${cle}`).toBeTruthy();
      });
    }
  }

  /**
   * Une traduction qui n'est que la copie du français n'est pas une
   * traduction — sauf pour le français lui-même. On ne vérifie pas la qualité,
   * seulement qu'un effort a eu lieu.
   */
  it('aucune langue ne se contente de recopier le français', () => {
    for (const cle of NOUVELLES) {
      for (const [code, dict] of Object.entries(LANGUES)) {
        if (code === 'fr') continue;
        expect(dict[cle], `${code} recopie le français pour ${cle}`).not.toBe(
          LANGUES.fr[cle],
        );
      }
    }
  });
});
