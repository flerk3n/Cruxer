export type PipelineErrorCode =
  | "INVALID_INPUT"
  | "UNSAFE_URL"
  | "ROBOTS_DENIED"
  | "COMPANY_UNREACHABLE"
  | "UNEXPECTED_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "HTTP_ERROR"
  | "PIPELINE_NOT_CONFIGURED";

export class PipelineError extends Error {
  constructor(
    public readonly code: PipelineErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
