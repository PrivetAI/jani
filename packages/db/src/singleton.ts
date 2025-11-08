import { defaultConfig } from '@jani/shared';
import { InMemoryDatabase } from './database';

let instance: InMemoryDatabase | null = null;

export const getDatabase = (): InMemoryDatabase => {
  if (!instance) {
    instance = new InMemoryDatabase(defaultConfig);
  }
  return instance;
};
