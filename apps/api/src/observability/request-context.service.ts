import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

interface RequestContext {
  readonly correlationId: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  public run<T>(correlationId: string, callback: () => T): T {
    return this.storage.run({ correlationId }, callback);
  }

  public get correlationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}
