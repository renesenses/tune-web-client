import { describe, it, expect } from 'vitest';
import { compteSupprimees, cleLibelleFinDeScan } from './bandeauFinDeScan';
import fr from './locales/fr';
import en from './locales/en';

// Le bandeau de fin de scan annonçait « 0 supprimés » quoi que la purge ait
// fait (renesenses/tune-server-rust#2146). Le client lisait `d.removed` — une
// clé que le serveur n'a jamais envoyée — et `?? 0` transformait cette absence
// en un chiffre affirmé.
//
// Trois cas, et le troisième est celui qui manquait :
//   - la purge a retiré N pistes    → on annonce N ;
//   - la purge n'a rien retiré      → on annonce zéro, ET C'EST VRAI ;
//   - le serveur ne dit rien        → on n'annonce AUCUN chiffre.
//
// Distinguer les deux derniers est tout l'objet du ticket : un zéro affirmé et
// un silence ne disent pas la même chose, et les confondre a fait perdre du
// temps sur le fil forum 1512.

/** Reconstitue le bandeau exactement comme `SettingsView.svelte` le fabrique. */
function bandeau(data: unknown, libelles: Record<string, string>): string {
  const supprimees = compteSupprimees(data);
  const d = (data ?? {}) as Record<string, any>;
  return libelles[cleLibelleFinDeScan(supprimees)]
    .replace('{scanned}', String(d.total_files ?? d.scanned ?? '?'))
    .replace('{added}', String(d.inserted ?? d.added ?? 0))
    .replace('{updated}', String(d.updated ?? 0))
    .replace('{removed}', String(supprimees ?? 0));
}

describe('compte de pistes supprimées', () => {
  it('rend le compte quand le serveur en publie un', () => {
    expect(compteSupprimees({ removed: 3000 })).toBe(3000);
  });

  it('rend zéro quand le serveur publie zéro — un vrai zéro se dit', () => {
    expect(compteSupprimees({ removed: 0 })).toBe(0);
  });

  // Le cœur du correctif : ces charges utiles ne portent PAS de compte, et
  // aucune ne doit devenir « 0 ». La première est celle qu'envoyait le serveur
  // avant #2146, la deuxième celle d'un scan annulé.
  it.each([
    ['clé absente (serveur antérieur à #2146)', { total_files: 46705, inserted: 4, updated: 0 }],
    ['scan annulé', { cancelled: true }],
    ['clé nulle', { removed: null }],
    ['clé non numérique', { removed: '12' }],
    ['NaN', { removed: Number.NaN }],
    ['compte négatif (charge utile corrompue)', { removed: -1 }],
    ['charge utile vide', {}],
    ['charge utile absente', null],
  ])('ne fabrique aucun chiffre : %s', (_cas, data) => {
    expect(compteSupprimees(data)).toBeNull();
  });
});

describe('libellé du bandeau', () => {
  it('emploie le libellé complet quand un compte existe', () => {
    expect(cleLibelleFinDeScan(0)).toBe('settings.scanCompleted');
    expect(cleLibelleFinDeScan(42)).toBe('settings.scanCompleted');
  });

  it('emploie le libellé SANS le segment de purge quand le compte manque', () => {
    expect(cleLibelleFinDeScan(null)).toBe('settings.scanCompletedNoRemoved');
  });

  // Une phrase à trou ne peut pas se taire : si le libellé de repli portait
  // encore `{removed}`, le bandeau afficherait « 0 supprimés » malgré tout —
  // le défaut reviendrait par la traduction. Les onze langues sont vérifiées
  // par `check-i18n`, ce test verrouille la forme.
  it.each([
    ['fr', fr],
    ['en', en],
  ])('le libellé de repli ne comporte pas de trou {removed} (%s)', (_lang, libelles: any) => {
    expect(libelles['settings.scanCompleted']).toContain('{removed}');
    expect(libelles['settings.scanCompletedNoRemoved']).not.toContain('{removed}');
  });
});

describe('le bandeau tel que le testeur le lit', () => {
  // La capture de Bruno Lescarret, fil 1512 : 46705 fichiers, 4 ajoutés.
  // Le serveur ne publiait pas de compte de purge — le bandeau affirmait
  // pourtant « 0 supprimés ».
  it('ne parle plus de suppressions quand le serveur n\'en dit rien', () => {
    const texte = bandeau({ total_files: 46705, inserted: 4, updated: 0 }, fr as any);
    expect(texte).toBe('Scan terminé : 46705 fichiers, 4 ajoutés, 0 mis à jour');
    expect(texte).not.toContain('supprimés');
    expect(texte).not.toContain('{removed}');
  });

  it('annonce N quand la purge a retiré N pistes', () => {
    const texte = bandeau(
      { total_files: 46705, inserted: 4, updated: 0, removed: 3000 },
      fr as any,
    );
    expect(texte).toBe('Scan terminé : 46705 fichiers, 4 ajoutés, 0 mis à jour, 3000 supprimés');
  });

  it('annonce zéro quand la purge n\'a vraiment rien retiré', () => {
    const texte = bandeau({ total_files: 46705, inserted: 4, updated: 0, removed: 0 }, fr as any);
    expect(texte).toBe('Scan terminé : 46705 fichiers, 4 ajoutés, 0 mis à jour, 0 supprimés');
  });

  // Les deux bandeaux ci-dessus se ressemblent ; c'est justement pour ça qu'ils
  // doivent différer. Avant #2146 ils étaient IDENTIQUES, et l'utilisateur ne
  // pouvait pas distinguer « rien à supprimer » de « je ne te le dis pas ».
  it('distingue « rien supprimé » de « je ne sais pas »', () => {
    const sait = bandeau({ total_files: 10, inserted: 0, updated: 0, removed: 0 }, fr as any);
    const ignore = bandeau({ total_files: 10, inserted: 0, updated: 0 }, fr as any);
    expect(sait).not.toBe(ignore);
  });
});
