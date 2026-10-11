export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  statusCode: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(statusCode, message);
}
