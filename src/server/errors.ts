export class AppError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} が見つからない`);
export const badRequest = (msg: string) => new AppError(400, msg);
export const conflict = (msg: string) => new AppError(409, msg);
