import { getDatabase } from '@jani/db';
import {
  CharacterStatus,
  CharacterVisibility,
} from '@jani/shared';

export class PersonaService {
  private readonly db = getDatabase();

  public list() {
    return this.db.getCharacters();
  }

  public create(input: {
    slug: string;
    name: string;
    visibility: CharacterVisibility;
    status: CharacterStatus;
    systemPrompt: string;
    createdBy?: string | null;
  }) {
    return this.db.createCharacter(input);
  }

  public update(id: string, patch: Partial<{ name: string; visibility: CharacterVisibility; status: CharacterStatus }>) {
    return this.db.updateCharacter(id, patch);
  }

  public addStory(characterId: string, story: { title: string; arcJson: Record<string, unknown>; isPremium: boolean }) {
    return this.db.addCharacterStory(characterId, { ...story, characterId });
  }

  public addVersion(characterId: string, version: { systemPrompt: string; isActive?: boolean }) {
    this.db.addCharacterVersion(characterId, version);
    return this.db.getCharacter(characterId);
  }
}
