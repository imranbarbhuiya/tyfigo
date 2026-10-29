import type fixtures from '../fixtures.yaml';

export type User = (typeof fixtures)['users'][number];
