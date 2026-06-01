export type SlideCaptchaErrorCode =
  | 'configuration_error'
  | 'network_error'
  | 'invalid_json'
  | 'invalid_response'
  | 'backend_error'
  | 'verification_failed';

export type SlideCaptchaErrorOptions = {
  status?: number;
  reason?: string;
  response?: unknown;
  cause?: unknown;
};

export class SlideCaptchaError extends Error {
  readonly code: SlideCaptchaErrorCode;

  readonly status?: number;

  readonly reason?: string;

  readonly response?: unknown;

  readonly cause?: unknown;

  readonly isSlideCaptchaError = true;

  constructor(
    code: SlideCaptchaErrorCode,
    message: string,
    options: SlideCaptchaErrorOptions = {},
  ) {
    super(message);
    this.name = 'SlideCaptchaError';
    this.code = code;
    this.status = options.status;
    this.reason = options.reason;
    this.response = options.response;
    this.cause = options.cause;
    Object.setPrototypeOf(this, SlideCaptchaError.prototype);
  }
}

export function isSlideCaptchaError(error: unknown): error is SlideCaptchaError {
  return error instanceof SlideCaptchaError;
}

export function toSlideCaptchaError(
  error: unknown,
  fallbackMessage = 'Unexpected slide CAPTCHA error.',
): SlideCaptchaError {
  if (isSlideCaptchaError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new SlideCaptchaError('backend_error', error.message || fallbackMessage, {
      cause: error,
    });
  }

  return new SlideCaptchaError('backend_error', fallbackMessage, { cause: error });
}
