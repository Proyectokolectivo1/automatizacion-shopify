import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

interface RequestContext {
  readonly correlationId: string;
  readonly spanId: string | undefined;
  readonly traceId: string | undefined;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  public run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  public get correlationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }

  public get spanId(): string | undefined {
    return this.storage.getStore()?.spanId;
  }

  public get traceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }
}
