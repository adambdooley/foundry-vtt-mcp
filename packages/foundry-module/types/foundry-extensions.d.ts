// Extended Foundry VTT type definitions for MCP module

declare global {
  interface Game {
    socket: {
      on(event: string, handler: (...args: any[]) => void): void;
      off(event: string, handler?: (...args: any[]) => void): void;
      emit(event: string, data?: any): void;
    };
    settings: {
      get(module: string, key: string): any;
      set(module: string, key: string, value: any): Promise<any>;
      register(module: string, key: string, options: any): void;
    };
    user: {
      id: string;
      name: string;
      isGM: boolean;
    };
    world: {
      id: string;
      title: string;
    };
    system: {
      id: string;
      version: string;
    };
    version: string;
    actors: Collection<Actor>;
    scenes: Collection<Scene>;
    packs: Collection<CompendiumCollection>;
    users: Collection<User>;
  }

  interface CONFIG {
    queries: Record<string, (...args: any[]) => any>;
  }

  interface Hooks {
    on(event: string, fn: Function): void;
    once(event: string, fn: Function): void;
    call(event: string, ...args: any[]): void;
  }

  interface UI {
    notifications: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
    };
  }

  const game: Game;
  const CONFIG: CONFIG;
  const Hooks: Hooks;
  const ui: UI;
  const console: Console;

  // Module-specific window extensions
  interface Window {
    foundryMCPBridge?: any;
  }
}

export {};
