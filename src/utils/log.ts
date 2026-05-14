import { Notice } from 'obsidian';

export function info(message: string): void {
  console.debug(message);
}

export function warn(message: string, error?: unknown): void {
  console.warn(message, error);
}

export function error(message: string, err?: unknown): void {
  console.error(message, err);
  new Notice(message);
}

export function notice(message: string): void {
  new Notice(message);
}
