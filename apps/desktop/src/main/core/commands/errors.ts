import { describeRefusal, type RefuseReason } from '../safety/SafetyGate.ts';

/** Command mode heard something that is not a command. Nothing is typed. */
export class CommandNotUnderstood extends Error {
  constructor(readonly heard: string) {
    super(`Didn't catch a command: “${heard.trim()}”`);
    this.name = 'CommandNotUnderstood';
  }
}

/** The SafetyGate refused the command in this context. The message is shown on the pill. */
export class CommandRefused extends Error {
  constructor(
    readonly reason: RefuseReason | 'needs_confirmation',
    appName: string | null,
  ) {
    super(describeRefusal(reason, appName));
    this.name = 'CommandRefused';
  }
}

/** The command was understood and allowed, but could not be carried out. */
export class CommandFailed extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CommandFailed';
  }
}
