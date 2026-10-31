import type { CommandHandler } from '../../../shared/kernel/command-bus.js';
import type { SessionRepository } from '../../domain/repositories/iam-repositories.js';

export class LogoutCommand {
  constructor(readonly sessionId: string) {}
}

export class LogoutHandler implements CommandHandler<LogoutCommand, void> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly now: () => Date,
  ) {}

  async handle(command: LogoutCommand): Promise<void> {
    await this.sessions.revoke(command.sessionId, this.now());
  }
}
