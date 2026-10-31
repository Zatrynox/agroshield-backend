/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'The domain layer may not depend on application, infrastructure or interfaces.',
      severity: 'error',
      from: { path: '^src/[^/]+/domain' },
      to: { path: '^src/[^/]+/(application|infrastructure|interfaces)' },
    },
    {
      name: 'domain-has-no-drivers',
      comment: 'The domain may not import database, HTTP or crypto adapters.',
      severity: 'error',
      from: { path: '^src/[^/]+/domain' },
      to: { path: 'node_modules/(pg|@electric-sql|fastify|@fastify)' },
    },
    {
      name: 'shared-is-a-leaf',
      comment: 'The shared kernel may not depend on a bounded context.',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { path: '^src/(?!shared)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: 'node_modules|\\.test\\.ts$' },
  },
};
