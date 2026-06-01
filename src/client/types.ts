import type { SlideCaptchaError } from './errors';

export type SlideCaptchaMovementPoint = {
  x: number;
  y: number;
  r: number;
  t: number;
};

export type SlideCaptchaChallenge = {
  challenge_id: string;
  background_url: string;
  piece_url: string;
  piece_width: number;
  piece_height: number;
  image_width: number;
  image_height: number;
  rotation_enabled: boolean;
  rotation_step: number;
};

export type SlideCaptchaVerifyPayload = {
  challenge_id: string;
  x: number;
  y: number;
  rotation: number;
  movements: SlideCaptchaMovementPoint[];
};

export type SlideCaptchaVerifyResponse = {
  success: boolean;
  token?: string;
  reason?: string;
  message?: string;
};

export type SlideCaptchaFetch = typeof fetch;

export type SlideCaptchaHeaders = HeadersInit | (() => HeadersInit | undefined);

export type SlideCaptchaClientOptions = {
  baseUrl?: string;
  headers?: SlideCaptchaHeaders;
  csrfToken?: string;
  csrfHeaderName?: string;
  fetcher?: SlideCaptchaFetch;
  credentials?: RequestCredentials;
  challengePath?: string;
  verifyPath?: string;
};

export type SlideCaptchaStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'dragging'
  | 'verifying'
  | 'success'
  | 'error';

export type SlideCaptchaState = {
  status: SlideCaptchaStatus;
  challenge: SlideCaptchaChallenge | null;
  x: number;
  y: number;
  rotation: number;
  movements: SlideCaptchaMovementPoint[];
  token: string | null;
  error: SlideCaptchaError | null;
};

export type SlideCaptchaTexts = {
  loading?: string;
  dragInstructions?: string;
  challengeUnavailable?: string;
  verify?: string;
  verified?: string;
  refresh?: string;
  rotateLeft?: string;
  rotateRight?: string;
  errorTitle?: string;
  pieceAlt?: string;
  backgroundAlt?: string;
};

export type SlideCaptchaProps = SlideCaptchaClientOptions & {
  className?: string;
  disabled?: boolean;
  texts?: SlideCaptchaTexts;
  onSuccess?: (token: string) => void;
  onError?: (error: SlideCaptchaError) => void;
  onRefresh?: () => void;
  onChange?: (state: SlideCaptchaState) => void;
};
