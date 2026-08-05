export type GameState = 'TITLE' | 'WAVE_PREP' | 'WAVE_ACTIVE' | 'VICTORY' | 'DEFEAT';

export type DifficultyKey = 'easy' | 'medium' | 'hard';

export interface StateTransition {
  from: GameState;
  to: GameState;
  reason: string;
}

const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  TITLE: ['WAVE_PREP'],
  WAVE_PREP: ['WAVE_ACTIVE', 'VICTORY'],
  WAVE_ACTIVE: ['WAVE_PREP', 'DEFEAT', 'VICTORY'],
  VICTORY: ['TITLE'],
  DEFEAT: ['TITLE'],
};

/**
 * Pure state machine for the game shell.
 * Validates transitions and tracks history for debugging.
 */
export class GameStateMachine {
  private state: GameState = 'TITLE';
  private history: StateTransition[] = [];

  getState(): GameState {
    return this.state;
  }

  canTransitionTo(to: GameState): boolean {
    return VALID_TRANSITIONS[this.state].includes(to);
  }

  transitionTo(to: GameState, reason?: string): boolean {
    if (!this.canTransitionTo(to)) return false;
    this.history.push({ from: this.state, to, reason: reason ?? '' });
    this.state = to;
    return true;
  }

  getHistory(): StateTransition[] {
    return [...this.history];
  }

  reset(): void {
    this.state = 'TITLE';
    this.history = [];
  }
}

