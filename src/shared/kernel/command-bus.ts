export interface CommandHandler<TCommand extends object, TResult> {
  handle(command: TCommand): Promise<TResult>;
}

type Constructor<T> = new (...args: never[]) => T;

export class CommandBus {
  private readonly handlers = new Map<object, CommandHandler<any, any>>();

  register<TCommand extends object, TResult>(
    command: Constructor<TCommand>,
    handler: CommandHandler<TCommand, TResult>,
  ): void {
    if (this.handlers.has(command)) {
      throw new Error(`A handler is already registered for ${command.name}`);
    }
    this.handlers.set(command, handler);
  }

  async execute<TResult>(command: object): Promise<TResult> {
    const handler = this.handlers.get(command.constructor);
    if (!handler) {
      throw new Error(`No command handler registered for ${command.constructor.name}`);
    }
    return (await handler.handle(command)) as TResult;
  }
}
