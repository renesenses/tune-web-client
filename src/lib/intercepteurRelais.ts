/**
 * Importé EN PREMIER par `main.ts` : les modules s'évaluent dans l'ordre de
 * leurs imports, et certains magasins (`preferences`, `displayFields`) lancent
 * un `fetch` dès leur évaluation. L'intercepteur doit être en place avant.
 * Voir `installerIntercepteurRelais` dans `bridge.ts`.
 *
 * L'accès par compte (laissez-passer, rc8) démarre JUSTE AVANT : quand un
 * compte est relié, ces premiers `fetch` attendent la session au lieu de
 * partir sans jeton. Servie normalement, ni l'un ni l'autre ne s'active.
 */
import { installerIntercepteurRelais } from './bridge';
import { demarrerAccesParCompte } from './laissezPasser/accesParCompte';

demarrerAccesParCompte();
installerIntercepteurRelais();
