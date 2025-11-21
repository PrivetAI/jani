export class AppError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export class CharacterRequiredError extends AppError {
  constructor() {
    super('Character is required', 'CHARACTER_REQUIRED');
  }
}

export class CharacterInactiveError extends AppError {
  constructor(characterId: number | null) {
    super('Character is inactive or missing', 'CHARACTER_INACTIVE', { characterId });
  }
}

export class PremiumRequiredError extends AppError {
  constructor(characterId: number) {
    super('Premium subscription required', 'PREMIUM_REQUIRED', { characterId });
  }
}

export class LimitReachedError extends AppError {
  constructor(readonly used: number, readonly limit: number) {
    super('Daily limit reached', 'LIMIT_REACHED', { used, limit });
  }
}

export class LLMGenerationError extends AppError {
  constructor(message: string) {
    super(message, 'LLM_GENERATION');
  }
}
