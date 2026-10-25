import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export const tokenDigest=value=>createHash('sha256').update(value).digest('hex');
export function createManagedCookieVault(hexKey,issuer){
 if(!/^[a-f0-9]{64}$/i.test(hexKey??''))throw Error('Independent managed-session encryption key required');
 const key=Buffer.from(hexKey,'hex'),aad=Buffer.from('continua-managed-session-v1|'+issuer);
 return {
  seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');},
  open(value){const input=Buffer.from(value,'base64url');if(input.length<29||input.length>32768)throw Error('Invalid managed session binding');const decipher=createDecipheriv('aes-256-gcm',key,input.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(input.subarray(12,28));return Buffer.concat([decipher.update(input.subarray(28)),decipher.final()]).toString('utf8');}
 };
}
