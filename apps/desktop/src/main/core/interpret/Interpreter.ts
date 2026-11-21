import { buildSystemPrompt, buildUserPrompt, type InterpretRequest } from './prompt.ts';
import type { ChatJson } from './chatJson.ts';
import { extractJson, toPlan, type Plan } from './plan.ts';

export interface InterpreterOptions {
  /** Tried in order; the next one is used when one fails or answers nothing usable. */
  clients: readonly ChatJson[];
  /** Per client. Interpretation waits for a person, so it is kept short. */
  timeoutMs?: number;
  log?: (message: string) => void;
}

/**
 * "Say it in your own words": turns a sentence no exact command matched, with what the screen
 * shows, into a short plan made only of the app's own commands. It never runs anything: the plan
 * goes through the same safety checks as words said exactly. Null when nothing usable came back.
 */
export class Interpreter {
  constructor(private readonly options: InterpreterOptions) {}

  get available(): boolean {
    return this.options.clients.length > 0;
  }

  async interpret(request: InterpretRequest): Promise<Plan | null> {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(request);
    for (const client of this.options.clients) {
      try {
        const reply = await client.complete(
          system,
          user,
          AbortSignal.timeout(this.options.timeoutMs ?? 3_000),
        );
        const plan = toPlan(extractJson(reply));
        if (plan) return plan;
        this.options.log?.(`[interpret] ${client.name} gave no usable plan`);
        return null; // A clear "nothing to do" is an answer; do not ask a second model.
      } catch (error) {
        this.options.log?.(
          `[interpret] ${client.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return null;
  }
}
