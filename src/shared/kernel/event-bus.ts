export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}

export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
}

export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    const current = this.handlers.get(eventName) ?? [];
    current.push(handler as EventHandler);
    this.handlers.set(eventName, current);
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.eventName) ?? [];
    for (const handler of handlers) {
      await handler.handle(event);
    }
  }
}
