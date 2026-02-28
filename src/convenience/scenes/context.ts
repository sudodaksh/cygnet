import type { Context } from "../../context.ts";
import type { BaseScene } from "./base.ts";
import type { SessionFlavor } from "../session.ts";

// --- Session data shape for scenes ---

export interface SceneSessionData {
  __scenes?: {
    current?: string;       // scene ID
    state?: Record<string, unknown>;
    cursor?: number;        // WizardScene step index
    expires?: number;       // Unix ms expiry (optional TTL)
  };
}

// --- SceneContextFlavor ---

/**
 * Context flavor for scene-aware bots.
 * Add to your context type:
 *   type MyContext = Context & SceneContextFlavor & SessionFlavor<SceneSessionData>;
 */
export interface SceneContextFlavor {
  scene: SceneController;
}

export interface SceneController {
  /** Enter a scene by ID. Runs the scene's enter handlers. */
  enter(sceneId: string, initialState?: Record<string, unknown>): Promise<void>;
  /** Leave the current scene. Runs the scene's leave handlers. */
  leave(): Promise<void>;
  /** Re-enter the current scene (resets state and runs enter handlers). */
  reenter(): Promise<void>;
  /** Arbitrary per-scene state object, persisted in session. */
  state: Record<string, unknown>;
  /** The currently active BaseScene, if any. */
  current: BaseScene<any> | undefined;
  /** The current scene ID, if any. */
  id: string | undefined;
}

// --- WizardContextFlavor ---

/**
 * Context flavor for WizardScene.
 * Add to your context type:
 *   type MyContext = Context & WizardContextFlavor & SessionFlavor<SceneSessionData>;
 */
export interface WizardContextFlavor extends SceneContextFlavor {
  wizard: WizardController;
}

export interface WizardController {
  /** Advance the cursor to the next step (runs on the next incoming update). */
  advance(): Promise<void>;
  /** Move the cursor back to the previous step (runs on the next incoming update). */
  retreat(): Promise<void>;
  /** Jump to a specific step index. */
  selectStep(index: number): void;
  /** Current step index (0-based). */
  cursor: number;
  /** Arbitrary per-wizard state, persisted in session. */
  state: Record<string, unknown>;
}

// Convenience: context type aliases
export type SceneContext<S extends SceneSessionData = SceneSessionData> =
  Context & SceneContextFlavor & SessionFlavor<S>;

export type WizardContext<S extends SceneSessionData = SceneSessionData> =
  Context & WizardContextFlavor & SessionFlavor<S>;
