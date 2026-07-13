import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/app.factory';

describe('API observability integration', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  it('reports liveness and dependency readiness', async () => {
    const liveness = await request(baseUrl).get('/health/live').expect(200);
    const livenessBody: unknown = liveness.body;
    expect(livenessBody).toMatchObject({
      service: 'api',
      status: 'ok',
    });
    if (
      typeof livenessBody !== 'object' ||
      livenessBody === null ||
      !('timestamp' in livenessBody)
    ) {
      throw new Error('Liveness response is missing timestamp');
    }
    expect(typeof livenessBody.timestamp).toBe('string');

    const response = await request(baseUrl).get('/health/ready').expect(200);
    const body: unknown = response.body;
    expect(body).toMatchObject({
      dependencies: [
        { name: 'postgres', status: 'up' },
        { name: 'redis', status: 'up' },
        { name: 'minio', status: 'up' },
      ],
      status: 'ready',
    });
  });

  it('propagates safe correlation IDs into headers and errors', async () => {
    const correlationId = 'integration-test:correlation-1';
    const response = await request(baseUrl)
      .get('/missing')
      .set('x-correlation-id', correlationId)
      .expect(404);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
    const body: unknown = response.body;
    expect(body).toMatchObject({ correlationId, path: '/missing', statusCode: 404 });
  });

  it('exposes bounded Prometheus labels and dependency metrics', async () => {
    const response = await request(baseUrl).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('ecommerce_api_http_requests_total');
    expect(response.text).toContain('ecommerce_api_dependency_ready{dependency="postgres"} 1');
  });
});
