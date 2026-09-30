import { config } from './config.js';
import { createLoaders } from './loaders.js';
import { authenticatedUser } from './auth.js';

export function createRequestContext(pool, request) {
  const demoHeader = request?.headers?.['x-n-plus-one-demo'];
  const headerRequestsDemo = Array.isArray(demoHeader)
    ? demoHeader.includes('true')
    : String(demoHeader).toLowerCase() === 'true';

  // Memudahkan pengambilan screenshot tugas di Apollo Sandbox: query yang
  // diberi nama NPlusOneAudit otomatis memakai mode tanpa batching.
  const operationRequestsDemo = request?.body?.operationName === 'NPlusOneAudit';
  const demoNPlusOne = headerRequestsDemo || operationRequestsDemo;

  const metrics = {
    databaseQueryCount: 0,
    relationResolverCallCount: 0,
    loaderBatchQueryCount: 0,
  };
  return {
    pool,
    user: authenticatedUser(request),
    metrics,
    useDataLoader: demoNPlusOne ? false : config.useDataLoader,
    loaders: createLoaders(pool, metrics),
  };
}
