/**
 * Le nouveau client sait OUVRIR un ticket, pas seulement les lire.
 *
 * Bertrand, 04/09/2026 : « la vue sidebar Support n'est pas implémentée en
 * v2 », puis « complètement ». La route et l'écran existaient bien — c'est le
 * geste qui manquait. Troisième cas du même motif dans la journée, après créer
 * une collection et ajouter une radio : une fonction que le serveur sert, dont
 * le client actuel est l'unique appelant, et que le nouvel écran ne branche
 * pas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fr from '../locales/fr';

const ecran = readFileSync(join(process.cwd(), 'src/components/v2/SupportV2.svelte'), 'utf8');

describe('Support v2 — ouvrir un ticket', () => {
  it('appelle la route de création', () => {
    expect(ecran).toContain('api.createSupportTicketMultipart(');
  });

  it('envoie du MULTIPART, pas du JSON', () => {
    // La route accepte des pièces jointes. Un client qui lui poste du JSON
    // reçoit un 415 sans rien comprendre — c'est ce qui a fait échouer
    // l'import Roon/Plex.
    expect(ecran).toContain('new FormData()');
    expect(ecran).toMatch(/form\.append\('attachments\[\]'/);
  });

  it('les diagnostics restent OPTIONNELS et ne font pas échouer l’envoi', () => {
    // Un serveur antérieur à #1073 ignore ces champs ; un appel en échec ne
    // doit pas empêcher d'écrire au support.
    expect(ecran).toMatch(/getBugReportMarkdown\(\)\); \} catch/);
    expect(ecran).toMatch(/getSystemProfile\(\)\)\); \} catch/);
  });

  it('le délai de réessai du serveur survit jusqu’au message', () => {
    // Sans lui, l'écran ne sait pas dire QUAND réessayer (#2178).
    expect(ecran).toContain('retryAfter');
    expect(ecran).toContain('v2.sup.errRateLimited');
  });
});

describe('les catégories proposées existent vraiment', () => {
  it('chaque clé de catégorie du nouvel écran est traduite', () => {
    // Le client ACTUEL en cite deux qui n'existaient dans aucune langue —
    // elles s'affichaient en clé brute. `check-i18n` ne l'attrape pas : il
    // vérifie le français en dur et la parité des locales, pas une clé citée
    // sans exister. Les deux manquantes ont été ajoutées le 04/09/2026.
    const cles = [...ecran.matchAll(/k: '(support\.category\.[a-z]+)'/g)].map((m) => m[1]);
    expect(cles.length, 'plus aucune catégorie proposée').toBeGreaterThan(3);
    expect(cles.filter((k) => !(k in fr)), 'ces catégories s’afficheraient en clé brute').toEqual([]);
  });

  it('celles du client actuel aussi, désormais', () => {
    const v1 = readFileSync(join(process.cwd(), 'src/components/SupportView.svelte'), 'utf8');
    const cles = [...v1.matchAll(/label: '(support\.category\.[a-z]+)'/g)].map((m) => m[1]);
    expect(cles.filter((k) => !(k in fr))).toEqual([]);
  });
});
