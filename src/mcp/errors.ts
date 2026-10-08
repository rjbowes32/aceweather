export type ToolErrorCode =
  | "invalid_input"
  | "not_found"
  | "upstream_unavailable"
  | "upstream_timeout"
  | "upstream_rate_limited"
  | "internal_error";

export class ToolError extends Error {
  code: ToolErrorCode;

  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const invalid = (message: string) => new ToolError("invalid_input", message);
