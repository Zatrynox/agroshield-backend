export interface QueryHandler<TQuery extends object, TResult> {
  handle(query: TQuery): Promise<TResult>;
}

type Constructor<T> = new (...args: never[]) => T;

export class QueryBus {
  private readonly handlers = new Map<object, QueryHandler<any, any>>();

  register<TQuery extends object, TResult>(
    query: Constructor<TQuery>,
    handler: QueryHandler<TQuery, TResult>,
  ): void {
    if (this.handlers.has(query)) {
      throw new Error(`A handler is already registered for ${query.name}`);
    }
    this.handlers.set(query, handler);
  }

  async execute<TResult>(query: object): Promise<TResult> {
    const handler = this.handlers.get(query.constructor);
    if (!handler) {
      throw new Error(`No query handler registered for ${query.constructor.name}`);
    }
    return (await handler.handle(query)) as TResult;
  }
}
