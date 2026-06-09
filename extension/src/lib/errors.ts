export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

export class FetchError extends Error {
  statusCode: number | null;
  body: string | null;

  constructor(
    message: string,
    statusCode: number | null = null,
    body: string | null = null,
  ) {
    super(message);
    this.name = "FetchError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}
