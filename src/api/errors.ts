export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(`API error ${status}: ${code}`);
    this.name = 'ApiError';
  }
}
