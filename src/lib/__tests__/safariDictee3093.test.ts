import { expect, it } from 'vitest';
import { raisonIndisponible } from '../commandeVocale';
it('Safari HTTP sans constructeur explique le contexte non sécurisé',()=>{
 expect(raisonIndisponible({isSecureContext:false})).toBe('nonSecurise');
});
it('Firefox HTTPS sans constructeur reste non pris en charge',()=>{
 expect(raisonIndisponible({isSecureContext:true})).toBe('nonPrisEnCharge');
});
it('un constructeur disponible en HTTPS reste utilisable',()=>{
 expect(raisonIndisponible({isSecureContext:true,webkitSpeechRecognition:class {}})).toBeNull();
});
