/**
 * Les plafonds d'indexation UPnP, et l'annonce de la troncature (#4154).
 *
 * ## Le défaut
 *
 * Le plafond de titres valait 50 000, calé sur les 22 331 pistes d'Asset. La
 * bibliothèque locale de Bertrand en compte **47 056** : 6 % de marge. Et la
 * troncature était MUETTE — l'utilisateur cherche un album jamais indexé, ne le
 * trouve pas, et croit à un bug de recherche.
 *
 * Côté client, il y avait pire : **aucun appel à la route d'indexation dans
 * tout le dépôt**. La route existait et personne ne pouvait l'appeler ; les
 * réglages non plus, donc le plafond mal calé était impossible à relever.
 *
 * ## Ce que cette épreuve garde
 *
 * Deux choses, et elles ne se remplacent pas :
 *
 *  1. la **lecture et l'écriture des trois plafonds**, et la traduction d'une
 *     réponse d'indexation en verdict — sur des données, pas sur du balisage ;
 *  2. la **présence effective du geste et du bilan** dans la source de
 *     `MediaServersV2` — un module juste que personne n'appelle n'indexe rien.
 *     Même patron que `bibliothequeFiltresAtteignables.test.ts`, et même
 *     réserve : lire la source empêche la régression, cela ne prouve pas le
 *     rendu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dictionnaire } from './onzeDictionnaires';
import {
  CLES, PALIERS, DEFAUTS, lirePlafonds, versPatch, axeDeLaCle, libellePalier, verdictDe,
} from '../indexationUpnp';

/** La bibliothèque qui a démasqué le défaut, et le plafond qui la laissait
 *  passer d'un cheveu. */
const BIBLIOTHEQUE_DE_BERTRAND = 47_056;
const ANCIEN_PLAFOND = 50_000;

/**
 * Plancher du détecteur : si le défaut redescendait au plafond mal calé, tout
 * le reste du fichier resterait vert — les fonctions marcheraient très bien
 * avec un mauvais chiffre.
 */
it('le défaut laisse une VRAIE marge sur la bibliothèque mesurée', () => {
  expect(
    ANCIEN_PLAFOND / BIBLIOTHEQUE_DE_BERTRAND,
    'le contrôle lui-même a dérivé : 50 000 doit bien être une marge étroite',
  ).toBeLessThan(1.1);
  expect(
    DEFAUTS.pistes,
    `le défaut est retombé à ${DEFAUTS.pistes} : il doit dépasser largement les ${BIBLIOTHEQUE_DE_BERTRAND} pistes mesurées`,
  ).toBeGreaterThanOrEqual(2 * BIBLIOTHEQUE_DE_BERTRAND);
});

describe('lirePlafonds — ce que l’écran montre', () => {
  it('lit les trois valeurs publiées', () => {
    expect(
      lirePlafonds({
        [CLES.pistes]: 500_000,
        [CLES.conteneurs]: 5_000,
        [CLES.profondeur]: 12,
      }),
    ).toEqual({ pistes: 500_000, conteneurs: 5_000, profondeur: 12 });
  });

  it('`null` publié = sans limite', () => {
    expect(lirePlafonds({ [CLES.pistes]: null }).pistes).toBeNull();
  });

  it('`0` persisté = sans limite, lui aussi', () => {
    // Le serveur republie `null`, mais une base écrite à la main porte le zéro.
    expect(lirePlafonds({ [CLES.pistes]: 0 }).pistes).toBeNull();
    expect(lirePlafonds({ [CLES.pistes]: '0' }).pistes).toBeNull();
  });

  it('une clé ABSENTE retombe sur le défaut, pas sur une case vide', () => {
    // Un serveur antérieur à #4154 ne publie pas ces clés : l'écran doit
    // montrer ce que CE serveur-là appliquera.
    expect(lirePlafonds({})).toEqual(DEFAUTS);
    expect(lirePlafonds(null)).toEqual(DEFAUTS);
  });

  it('une valeur illisible retombe sur le défaut, jamais sur NaN', () => {
    expect(lirePlafonds({ [CLES.pistes]: 'beaucoup' }).pistes).toBe(DEFAUTS.pistes);
    expect(lirePlafonds({ [CLES.pistes]: -5 }).pistes).toBe(DEFAUTS.pistes);
  });
});

describe('versPatch — ce qu’on renvoie au serveur', () => {
  it('un axe, une clé', () => {
    expect(versPatch('pistes', 500_000)).toEqual({ [CLES.pistes]: 500_000 });
    expect(versPatch('profondeur', 12)).toEqual({ [CLES.profondeur]: 12 });
  });

  it('« sans limite » part en `null`, et pas en 0 ni en chaîne vide', () => {
    // C'est `null` que le serveur traduit en « sans limite ». Un `0` marcherait
    // aussi, mais c'est `null` qu'il PUBLIE : l'aller-retour doit être exact,
    // sinon un client qui relit puis renvoie la config change un réglage sans
    // le vouloir.
    expect(versPatch('pistes', null)).toEqual({ [CLES.pistes]: null });
  });
});

describe('les paliers', () => {
  it('les titres portent ceux que Bertrand a cités, et « sans limite »', () => {
    expect(PALIERS.pistes).toEqual([50_000, 100_000, 500_000, 1_000_000, null]);
  });

  it('le défaut est un palier proposé — sinon le menu afficherait autre chose', () => {
    for (const axe of ['pistes', 'conteneurs', 'profondeur'] as const) {
      expect(PALIERS[axe], `le défaut de ${axe} doit être proposé`).toContain(DEFAUTS[axe]);
    }
  });

  it('🔴 la PROFONDEUR n’offre pas « sans limite »', () => {
    // Le serveur borne de toute façon à 64 : une descente non bornée sur un
    // serveur qui frappe un identifiant neuf à chaque visite ne se terminerait
    // jamais. Proposer un choix que le serveur ramène ensuite en silence
    // afficherait un réglage faux.
    expect(PALIERS.profondeur).not.toContain(null);
  });

  it('« sans limite » s’écrit en toutes lettres, jamais en nombre', () => {
    expect(libellePalier(null, 'Sans limite')).toBe('Sans limite');
    expect(libellePalier(1_000, 'Sans limite')).not.toBe('Sans limite');
  });
});

describe('verdictDe — la troncature n’est jamais avalée', () => {
  const coupee = {
    parcours: {
      plafond_atteint: 'pistes',
      plafond: {
        nature: 'pistes',
        valeur: 2,
        reglage: CLES.pistes,
        message: 'plafond de PISTES atteint (2) : … relever le réglage « upnp_index_max_pistes »',
      },
    },
    pistes: { distinctes: 2 },
    albums_ajoutes: 2,
  };

  it('une passe entière ne signale rien', () => {
    const v = verdictDe({ parcours: { plafond_atteint: null, plafond: null }, pistes: { distinctes: 6 }, albums_ajoutes: 6 });
    expect(v.troncature).toBeNull();
    expect(v.pistes).toBe(6);
  });

  it('une passe COUPÉE le dit, et désigne l’axe à relever', () => {
    // Sans cela, « 2 titres indexés » serait un succès apparent — le silence
    // exact que #4154 referme.
    const v = verdictDe(coupee);
    expect(v.troncature).not.toBeNull();
    expect(v.troncature?.axe).toBe('pistes');
    expect(v.troncature?.message).toContain(CLES.pistes);
  });

  it('un manque de CONTENEURS envoie vers l’axe des conteneurs, pas des titres', () => {
    const v = verdictDe({
      parcours: {
        plafond_atteint: 'conteneurs',
        plafond: { nature: 'conteneurs', reglage: CLES.conteneurs, message: '…' },
      },
    });
    expect(v.troncature?.axe).toBe('conteneurs');
  });

  it('un serveur ANTÉRIEUR à #4154 ne tait pas la troncature pour autant', () => {
    // Il ne porte ni `plafond.message` ni `plafond.reglage` : on dit au moins
    // CE QUI a coupé, plutôt que d'afficher un succès.
    const v = verdictDe({ parcours: { plafond_atteint: 'pistes' }, pistes: { distinctes: 50_000 } });
    expect(v.troncature?.nature).toBe('pistes');
    expect(v.troncature?.axe).toBe('pistes');
    expect(v.troncature?.message).toContain('pistes');
  });

  it('une réponse vide ne plante pas et n’invente aucune troncature', () => {
    expect(verdictDe(null)).toEqual({ pistes: 0, albums: 0, troncature: null, erreurs: [] });
  });
});

describe('axeDeLaCle', () => {
  it('retrouve l’axe de chacune des trois clés', () => {
    expect(axeDeLaCle(CLES.pistes)).toBe('pistes');
    expect(axeDeLaCle(CLES.conteneurs)).toBe('conteneurs');
    expect(axeDeLaCle(CLES.profondeur)).toBe('profondeur');
  });

  it('une clé inconnue ne désigne rien', () => {
    expect(axeDeLaCle('upnp_index_autre_chose')).toBeNull();
    expect(axeDeLaCle(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le geste existe, et le bilan est montré.
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE = readFileSync(
  fileURLToPath(new URL('../../components/v2/MediaServersV2.svelte', import.meta.url)),
  'utf8',
);

describe('l’écran Serveurs multimédia', () => {
  it('🔴 appelle bien la route d’indexation — elle n’avait AUCUN appelant', () => {
    expect(SOURCE).toContain('api.indexerServeurMedia(');
  });

  it('indexe DEPUIS LE DOSSIER AFFICHÉ, pas systématiquement la racine', () => {
    // C'est ce que le serveur conseille quand un plafond a mordu : repartir
    // d'un conteneur plus précis plutôt que de tout relever.
    expect(SOURCE).toMatch(/indexerServeurMedia\(s\.id, objetCourant/);
  });

  it('montre le bilan, et la troncature quand il y en a une', () => {
    expect(SOURCE).toContain('verdict.troncature.message');
    expect(SOURCE).toContain("$t('v2.ms.indexDone' as any)");
  });

  it('propose de relever le réglage, et met en avant CELUI qui a coupé', () => {
    expect(SOURCE).toContain("$t('v2.ms.indexRaise' as any)");
    expect(SOURCE).toContain('axeATraiter === reglage.axe');
  });

  it('offre les TROIS plafonds, pas seulement celui des titres', () => {
    for (const axe of ['pistes', 'conteneurs', 'profondeur']) {
      expect(SOURCE, `l'axe ${axe} doit être réglable`).toContain(`axe: '${axe}' as Axe`);
    }
  });

  it('un réglage refusé par le serveur REVIENT à sa valeur d’avant', () => {
    // Laisser la nouvelle valeur à l'écran ferait croire à un plafond levé qui
    // ne l'est pas : le défaut muet de #4154, déplacé dans le client.
    expect(SOURCE).toContain('plafonds = { ...plafonds, [axe]: avant }');
  });
});

describe('les libellés sont traduits', () => {
  it('les quatorze clés existent en français ET en anglais', async () => {
    const fr = dictionnaire('fr');
    const en = dictionnaire('en');
    const cles = [
      'v2.ms.index', 'v2.ms.indexing', 'v2.ms.indexLimits', 'v2.ms.limitTracks',
      'v2.ms.limitTracksHint', 'v2.ms.limitContainers', 'v2.ms.limitContainersHint',
      'v2.ms.limitDepth', 'v2.ms.limitDepthHint', 'v2.ms.limitNone', 'v2.ms.indexDone',
      'v2.ms.indexRaise', 'v2.ms.indexFailed', 'v2.ms.indexSettingFailed',
    ];
    for (const cle of cles) {
      expect(fr[cle], `${cle} absente du français`).toBeTruthy();
      expect(en[cle], `${cle} absente de l’anglais`).toBeTruthy();
    }
  });

  it('les trois aides EXPLIQUENT, elles ne répètent pas le titre', async () => {
    // « Plafond de dossiers » ne veut rien dire pour qui n'a pas lu le code :
    // l'aide doit porter la raison, pas reformuler l'étiquette.
    const fr = dictionnaire('fr');
    for (const cle of ['v2.ms.limitTracksHint', 'v2.ms.limitContainersHint', 'v2.ms.limitDepthHint']) {
      expect(fr[cle].length, `${cle} est trop courte pour expliquer quoi que ce soit`).toBeGreaterThan(60);
    }
  });
});
