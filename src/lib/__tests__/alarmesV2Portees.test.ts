import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 Les réveils portés en v2 — et les trois défauts qui ne doivent pas revenir.
 *
 * `AlarmsView` était l'une des deux fonctions que la v2 ne couvrait pas
 * (`docs/chantiers/basculer-la-v2-en-v1.md`). Bertrand, 14/09/2026 :
 * « Alarmes : porter, concerts plus tard. »
 *
 * Le portage ne recopie pas : il corrige trois défauts de l'écran d'origine.
 * Ce témoin garde les trois, parce qu'un portage ultérieur — ou un
 * copier-coller depuis l'ancien écran — les réintroduirait sans qu'on le voie.
 */
const ecran = readFileSync(
  resolve(__dirname, '../../components/v2/AlarmesV2.svelte'),
  'utf-8',
);
const coquille = readFileSync(
  resolve(__dirname, '../../components/v2/ShellV2.svelte'),
  'utf-8',
);
const barre = readFileSync(
  resolve(__dirname, '../../components/v2/Sidebar.svelte'),
  'utf-8',
);

describe('AlarmesV2 — le portage', () => {
  it('est atteignable : monté par la coquille ET listé dans la barre', () => {
    // Un écran qu'aucune barre n'annonce est un écran mort. C'est ce qui est
    // arrivé au bouton d'extinction de #1511, que personne n'avait trouvé.
    expect(coquille).toContain('AlarmesV2');
    expect(coquille).toMatch(/\$activeView === 'alarms'/);
    expect(barre).toMatch(/view: 'alarms'/);
  });

  it('demande confirmation avant de supprimer un réveil', () => {
    // L'écran d'origine supprimait sur un simple `×`, sans rien demander.
    // Irréversible : il faut tout ressaisir.
    const bloc = ecran.slice(ecran.indexOf('async function supprimer('));
    const corps = bloc.slice(0, bloc.indexOf('\n  }'));
    expect(corps).toContain('dialogs.confirm');
    expect(corps).toContain('danger: true');
    // Et la confirmation doit PRÉCÉDER la suppression, sinon elle ne garde rien.
    expect(corps.indexOf('dialogs.confirm')).toBeLessThan(corps.indexOf("method: 'DELETE'"));
  });

  it("dit ses échecs à l'utilisateur, jamais à la seule console", () => {
    // L'original faisait `console.error` : enregistrer un réveil sur un
    // serveur injoignable fermait le formulaire sans rien dire. L'utilisateur
    // croyait son réveil posé ; il ne sonnait pas.
    // On cherche l'APPEL, pas le nom : la doc du composant CITE `console.error`
    // pour expliquer le défaut corrigé, et un `toContain` naïf rougissait
    // dessus. Mesuré — ce témoin a échoué sur sa propre documentation. Même
    // piège que les gardes de texte satisfaites par une définition.
    expect(ecran).not.toMatch(/console\.error\s*\(/);
    const appels = (ecran.match(/notifications\.error/g) ?? []).length;
    expect(appels).toBeGreaterThanOrEqual(4);
  });

  it("n'envoie jamais un corps PARTIEL sur PUT", () => {
    // `PUT /alarms/{id}` REMPLACE côté serveur. L'original envoyait
    // `{enabled}` seul depuis l'interrupteur : basculer un réveil pouvait
    // effacer son heure, ses jours et sa source.
    const bloc = ecran.slice(ecran.indexOf('async function basculerActif('));
    const corps = bloc.slice(0, bloc.indexOf('\n  }'));
    expect(corps).toContain('corps(');
    // La contre-épreuve qui compte : pas de littéral `{ enabled: ... }` envoyé tel quel.
    expect(corps).not.toMatch(/JSON\.stringify\(\s*\{\s*enabled/);
  });

  it('garde le formulaire ouvert quand l’enregistrement échoue', () => {
    // Fermer sur erreur perd la saisie — et laisse croire que c'est enregistré.
    const bloc = ecran.slice(ecran.indexOf('async function enregistrer('));
    const corps = bloc.slice(0, bloc.indexOf('\n  }'));
    const fermeture = corps.indexOf('formulaire = false');
    const attrape = corps.indexOf('} catch');
    expect(fermeture).toBeGreaterThanOrEqual(0);
    expect(attrape).toBeGreaterThan(fermeture);
  });
});
