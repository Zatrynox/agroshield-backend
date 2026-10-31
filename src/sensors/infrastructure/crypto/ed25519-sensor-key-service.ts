import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import type { SensorKeyPair, SensorKeyService } from '../../domain/repositories/sensor-repositories.js';

export class Ed25519SensorKeyService implements SensorKeyService {
  generate(): SensorKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    return {
      publicKeyPem,
      privateKeyPem,
      fingerprint: createHash('sha256').update(publicKeyPem).digest('hex'),
    };
  }

  verify(publicKeyPem: string, payload: string, signatureBase64: string): boolean {
    try {
      const key = createPublicKey(publicKeyPem);
      return verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signatureBase64, 'base64'));
    } catch {
      return false;
    }
  }
}
