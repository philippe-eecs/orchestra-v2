import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export default async function globalSetup() {
  const testDbPath = join(__dirname, '../../hub-v2/orchestra-test.db');

  if (existsSync(testDbPath)) {
    try {
      await unlink(testDbPath);
      console.log('Cleaned up test database:', testDbPath);
    } catch (error) {
      console.warn('Failed to delete test database:', error);
    }
  }
}
