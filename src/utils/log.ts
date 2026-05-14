import { Notice } from 'obsidian';

export function info(message: string): void {
  
}

export function warn(message: string, error?: unknown): void {
  
}

export function error(message: string, err?: unknown): void {
  
  new Notice(message);
}

export function notice(message: string): void {
  new Notice(message);
}
