import pino, { type DestinationStream, type Logger } from 'pino';

export const REDACTED_LOG_PATHS = [
  'authorization',
  'cookie',
  'email',
  'password',
  'phone',
  'token',
  '*.authorization',
  '*.cookie',
  '*.email',
  '*.password',
  '*.phone',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createPinoLogger(
  level: string,
  environment: string,
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      base: { environment, service: 'api' },
      level,
      redact: { censor: '[REDACTED]', paths: REDACTED_LOG_PATHS },
      serializers: { err: pino.stdSerializers.err },
    },
    destination,
  );
}
