export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly publicMessage?: string;

  constructor(statusCode: number, message: string, details?: unknown, publicMessage?: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    this.publicMessage = publicMessage;
  }
}
