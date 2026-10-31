import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './support/test-app.js';

describe('OpenAPI document', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ enableApiDocs: true });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('serializes Zod route schemas without throwing', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('documents parameters and tenant routes', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const document = response.json();

    expect(document.openapi).toMatch(/^3\./);
    expect(document.paths['/v1/farms']).toBeTruthy();
    expect(document.paths['/v1/zones/{zoneId}/sensors']).toBeTruthy();

    const readings = document.paths['/v1/zones/{zoneId}/readings'].get;
    const limit = readings.parameters.find(
      (parameter: { name: string; in: string }) =>
        parameter.name === 'limit' && parameter.in === 'query',
    );
    expect(limit?.schema).toMatchObject({ type: 'integer', default: 24 });

    const farmDetail = document.paths['/v1/farms/{farmId}'].get;
    expect(
      farmDetail.parameters.some(
        (parameter: { name: string; in: string; required: boolean }) =>
          parameter.name === 'farmId' && parameter.in === 'path' && parameter.required,
      ),
    ).toBe(true);
  });

  it('omits the documentation routes from the published paths', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const document = response.json();

    expect(document.paths['/documentation/json']).toBeUndefined();
    expect(document.paths['/docs']).toBeUndefined();
  });
});
