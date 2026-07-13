import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

export const PASSWORD_PARAMETERS = Object.freeze({
  algorithm: 'argon2id-v1',
  memoryCost: 19_456,
  outputLen: 32,
  parallelism: 1,
  timeCost: 2,
});

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  public hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: PASSWORD_PARAMETERS.memoryCost,
      outputLen: PASSWORD_PARAMETERS.outputLen,
      parallelism: PASSWORD_PARAMETERS.parallelism,
      timeCost: PASSWORD_PARAMETERS.timeCost,
    });
  }

  public async verify(passwordHash: string | undefined, password: string): Promise<boolean> {
    const hashToVerify = passwordHash ?? (await this.getDummyHash());
    try {
      const matches = await verify(hashToVerify, password);
      return passwordHash === undefined ? false : matches;
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hash('constant-invalid-credential-placeholder');
    return this.dummyHash;
  }
}
