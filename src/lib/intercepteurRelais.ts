/**
 * Importé EN PREMIER par `main.ts` : les modules s'évaluent dans l'ordre de
 * leurs imports, et certains magasins (`preferences`, `displayFields`) lancent
 * un `fetch` dès leur évaluation. L'intercepteur doit être en place avant.
 * Voir `installerIntercepteurRelais` dans `bridge.ts`.
 */
import { installerIntercepteurRelais } from './bridge';

installerIntercepteurRelais();
