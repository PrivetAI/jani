import { PrismaClient } from '@prisma/client';
import {
  addCharacterStory,
  addCharacterVersion,
  createCharacter,
  getCharacter,
  getCharacters,
  getPrismaClient,
  updateCharacter,
} from '@jani/db';
import {
  CharacterStatus,
  CharacterVisibility,
} from '@jani/shared';

export class PersonaService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  public async list() {
    return getCharacters(this.prisma);
  }

  public async create(input: {
    slug: string;
    name: string;
    visibility: CharacterVisibility;
    status: CharacterStatus;
    systemPrompt: string;
    createdBy?: string | null;
  }) {
    return createCharacter(this.prisma, input);
  }

  public async update(id: string, patch: Partial<{ name: string; visibility: CharacterVisibility; status: CharacterStatus }>) {
    return updateCharacter(this.prisma, id, patch);
  }

  public async addStory(characterId: string, story: { title: string; arcJson: Record<string, unknown>; isPremium: boolean }) {
    return addCharacterStory(this.prisma, characterId, story);
  }

  public async addVersion(characterId: string, version: { systemPrompt: string; isActive?: boolean }) {
    await addCharacterVersion(this.prisma, characterId, version);
    return getCharacter(this.prisma, characterId);
  }
}
