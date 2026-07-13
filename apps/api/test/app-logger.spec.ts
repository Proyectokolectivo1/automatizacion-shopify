import { PassThrough } from 'node:stream';

import type { DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';

import { createPinoLogger } from '../src/observability/logger.factory';

describe('createPinoLogger', () => {
  it('redacts configured secrets and personal data', () => {
    let output = '';
    const stream = new PassThrough();
    stream.on('data', (chunk: unknown) => {
      if (Buffer.isBuffer(chunk)) {
        output += chunk.toString('utf8');
      }
    });
    const destination = stream as DestinationStream;
    const logger = createPinoLogger('info', 'test', destination);

    logger.info(
      { authorization: 'Bearer secret', email: 'person@example.com', password: 'secret' },
      'redaction_test',
    );

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('Bearer secret');
    expect(output).not.toContain('person@example.com');
    expect(output).not.toContain('"password":"secret"');
  });
});
