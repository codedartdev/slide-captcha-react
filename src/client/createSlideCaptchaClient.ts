import { SlideCaptchaError } from './errors';
import type {
  SlideCaptchaChallenge,
  SlideCaptchaClientOptions,
  SlideCaptchaVerifyPayload,
  SlideCaptchaVerifyResponse,
} from './types';

const DEFAULT_CHALLENGE_PATH = '/slide-captcha/new';
const DEFAULT_VERIFY_PATH = '/slide-captcha/verify';
const DEFAULT_CSRF_HEADER = 'X-CSRF-TOKEN';

export type SlideCaptchaClient = {
  getChallenge: () => Promise<SlideCaptchaChallenge>;
  verifyChallenge: (payload: SlideCaptchaVerifyPayload) => Promise<SlideCaptchaVerifyResponse>;
};

export function createSlideCaptchaClient(
  options: SlideCaptchaClientOptions = {},
): SlideCaptchaClient {
  const fetcher = resolveFetcher(options.fetcher);

  return {
    getChallenge() {
      return requestJson(
        fetcher,
        buildUrl(options.baseUrl, options.challengePath ?? DEFAULT_CHALLENGE_PATH),
        {
          method: 'GET',
          headers: buildHeaders(options, false),
          credentials: options.credentials ?? 'same-origin',
        },
        validateChallenge,
      );
    },

    verifyChallenge(payload) {
      return requestJson(
        fetcher,
        buildUrl(options.baseUrl, options.verifyPath ?? DEFAULT_VERIFY_PATH),
        {
          method: 'POST',
          headers: buildHeaders(options, true),
          credentials: options.credentials ?? 'same-origin',
          body: JSON.stringify(payload),
        },
        validateVerifyResponse,
      );
    },
  };
}

function resolveFetcher(fetcher?: SlideCaptchaClientOptions['fetcher']): typeof fetch {
  if (fetcher) {
    return fetcher;
  }

  if (typeof fetch === 'function') {
    return fetch;
  }

  throw new SlideCaptchaError(
    'configuration_error',
    'No fetch implementation is available. Pass a custom fetcher option.',
  );
}

function buildUrl(baseUrl: string | undefined, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedBase = baseUrl?.trim().replace(/\/+$/, '') ?? '';

  if (!normalizedBase) {
    return normalizedPath;
  }

  return `${normalizedBase}${normalizedPath}`;
}

function buildHeaders(options: SlideCaptchaClientOptions, hasBody: boolean): Headers {
  const headers = new Headers();
  headers.set('Accept', 'application/json');

  if (hasBody) {
    headers.set('Content-Type', 'application/json');
  }

  const configuredHeaders =
    typeof options.headers === 'function' ? options.headers() : options.headers;

  if (configuredHeaders) {
    new Headers(configuredHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (options.csrfToken) {
    const csrfHeaderName = options.csrfHeaderName ?? DEFAULT_CSRF_HEADER;

    if (!headers.has(csrfHeaderName)) {
      headers.set(csrfHeaderName, options.csrfToken);
    }
  }

  return headers;
}

async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  requestInit: RequestInit,
  validate: (data: unknown) => T,
): Promise<T> {
  let response: Response;

  try {
    response = await fetcher(url, requestInit);
  } catch (cause) {
    throw new SlideCaptchaError(
      'network_error',
      'Could not connect to the slide CAPTCHA backend.',
      { cause },
    );
  }

  const data = await parseJson(response);

  if (!response.ok) {
    throw normalizeBackendError(response, data);
  }

  return validate(data);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new SlideCaptchaError(
      'invalid_json',
      'The slide CAPTCHA backend returned invalid JSON.',
      {
        status: response.status,
        cause,
      },
    );
  }
}

function normalizeBackendError(response: Response, data: unknown): SlideCaptchaError {
  const message =
    readOptionalString(data, 'message') ??
    readOptionalString(data, 'error') ??
    readOptionalString(data, 'reason') ??
    'The slide CAPTCHA backend returned an error.';

  return new SlideCaptchaError('backend_error', message, {
    status: response.status,
    reason: readOptionalString(data, 'reason'),
    response: data,
  });
}

function validateChallenge(data: unknown): SlideCaptchaChallenge {
  const challenge: SlideCaptchaChallenge = {
    challenge_id: readRequiredString(data, 'challenge_id'),
    background_url: readRequiredString(data, 'background_url'),
    piece_url: readRequiredString(data, 'piece_url'),
    piece_width: readRequiredNumber(data, 'piece_width'),
    piece_height: readRequiredNumber(data, 'piece_height'),
    image_width: readRequiredNumber(data, 'image_width'),
    image_height: readRequiredNumber(data, 'image_height'),
    rotation_enabled: readRequiredBoolean(data, 'rotation_enabled'),
    rotation_step: readRequiredNumber(data, 'rotation_step'),
  };

  if (
    challenge.piece_width <= 0 ||
    challenge.piece_height <= 0 ||
    challenge.image_width <= 0 ||
    challenge.image_height <= 0 ||
    challenge.piece_width > challenge.image_width ||
    challenge.piece_height > challenge.image_height
  ) {
    throw new SlideCaptchaError(
      'invalid_response',
      'The slide CAPTCHA challenge contains invalid image dimensions.',
      { response: data },
    );
  }

  if (challenge.rotation_step < 0) {
    throw new SlideCaptchaError(
      'invalid_response',
      'The slide CAPTCHA challenge contains an invalid rotation step.',
      { response: data },
    );
  }

  return challenge;
}

function validateVerifyResponse(data: unknown): SlideCaptchaVerifyResponse {
  const response: SlideCaptchaVerifyResponse = {
    success: readRequiredBoolean(data, 'success'),
    token: readOptionalString(data, 'token'),
    reason: readOptionalString(data, 'reason'),
    message: readOptionalString(data, 'message'),
  };

  if (response.success && !response.token) {
    throw new SlideCaptchaError(
      'invalid_response',
      'The slide CAPTCHA backend did not return a token for a successful verification.',
      { response: data },
    );
  }

  return response;
}

function readRequiredString(data: unknown, key: string): string {
  const value = readValue(data, key);

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  throw invalidFieldError(key, data);
}

function readRequiredNumber(data: unknown, key: string): number {
  const value = readValue(data, key);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  throw invalidFieldError(key, data);
}

function readRequiredBoolean(data: unknown, key: string): boolean {
  const value = readValue(data, key);

  if (typeof value === 'boolean') {
    return value;
  }

  throw invalidFieldError(key, data);
}

function readOptionalString(data: unknown, key: string): string | undefined {
  const value = readValue(data, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readValue(data: unknown, key: string): unknown {
  if (!isRecord(data)) {
    return undefined;
  }

  return data[key];
}

function invalidFieldError(key: string, response: unknown): SlideCaptchaError {
  return new SlideCaptchaError(
    'invalid_response',
    `The slide CAPTCHA backend returned an invalid "${key}" field.`,
    { response },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
