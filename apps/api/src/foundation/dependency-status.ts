export interface DependencyStatus {
  readonly latencyMs: number;
  readonly name: 'minio' | 'postgres' | 'redis';
  readonly status: 'down' | 'up';
}
