import pino from 'pino';

// Factory: every module gets a child logger with a 'component' field.
// In production: filter logs with: jq 'select(.component == "car-search-worker")'
// In dev: pino-pretty renders human-readable output.
export function createLogger(component: string) {
  const level = process.env['LOG_LEVEL'] ?? 'info';
  const isDev = process.env['NODE_ENV'] !== 'production';

  // Build options separately to satisfy exactOptionalPropertyTypes —
  // the transport property must be absent (not undefined) in the prod branch.
  const logger = isDev
    ? pino({ level, transport: { target: 'pino-pretty', options: { colorize: true } } })
    : pino({ level });

  return logger.child({ component });
}

export type Logger = ReturnType<typeof createLogger>;
