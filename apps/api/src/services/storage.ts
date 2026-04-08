import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');

export async function ensureUploadDir(): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function getUploadPath(filename: string): string {
  return join(UPLOAD_DIR, filename);
}

export { UPLOAD_DIR };
