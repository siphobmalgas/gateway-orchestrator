import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = ((): LogLevel => {
  const level = env.log.level as LogLevel;
  if (level in LOG_LEVELS) {
    return level;
  }
  return 'debug';
})();

const logFilePath = path.resolve(process.cwd(), env.log.filePath);

if (env.log.toFile) {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
}

const baseLog = (level: LogLevel, message: string, metadata?: Record<string, unknown>): void => {
  if (LOG_LEVELS[level] < LOG_LEVELS[configuredLevel]) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };

  const serialized = JSON.stringify(payload);

  if (env.log.toFile) {
    fs.appendFileSync(logFilePath, `${serialized}\n`);
  }

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  console.log(serialized);
};

export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>): void => baseLog('debug', message, metadata),
  info: (message: string, metadata?: Record<string, unknown>): void => baseLog('info', message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>): void => baseLog('warn', message, metadata),
  error: (message: string, metadata?: Record<string, unknown>): void => baseLog('error', message, metadata)
};
