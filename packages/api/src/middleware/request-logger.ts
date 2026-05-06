import pinoHttp from 'pino-http';
import { createLogger } from '@trippulse/shared';

export const requestLogger = pinoHttp({ logger: createLogger('http') });
