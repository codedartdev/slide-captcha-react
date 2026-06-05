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

export type SlideCaptchaTheme = 'dark' | 'light';

export type SlideCaptchaVariant = 'inline' | 'modal';

export type SlideCaptchaColorOverrides = {
  accent?: string;
  background?: string;
  backdrop?: string;
  badgeBackground?: string;
  badgeBorder?: string;
  border?: string;
  borderStrong?: string;
  danger?: string;
  dangerBackground?: string;
  dangerBorder?: string;
  divider?: string;
  focus?: string;
  iconHoverBackground?: string;
  mutedText?: string;
  panelShadow?: string;
  panelSoftBackground?: string;
  pieceBorder?: string;
  pieceShadow?: string;
  primary?: string;
  primaryHover?: string;
  primaryText?: string;
  rotationDivider?: string;
  rotationIcon?: string;
  rotationThumbShadow?: string;
  secondaryButtonBackground?: string;
  secondaryButtonHoverBackground?: string;
  secondaryButtonHoverBorder?: string;
  softText?: string;
  stageBackground?: string;
  subtleText?: string;
  success?: string;
  successRing?: string;
  text?: string;
  track?: string;
};

export type SlideCaptchaTexts = {
  loading?: string;
  dragInstructions?: string;
  challengeUnavailable?: string;
  title?: string;
  subtitle?: string;
  verify?: string;
  verified?: string;
  refresh?: string;
  cancel?: string;
  close?: string;
  rotationLabel?: string;
  rotateLeft?: string;
  rotateRight?: string;
  errorTitle?: string;
  pieceAlt?: string;
  backgroundAlt?: string;
};

export type SlideCaptchaProps = SlideCaptchaClientOptions & {
  className?: string;
  disabled?: boolean;
  theme?: SlideCaptchaTheme;
  variant?: SlideCaptchaVariant;
  colors?: SlideCaptchaColorOverrides;
  texts?: SlideCaptchaTexts;
  onSuccess?: (token: string) => void;
  onError?: (error: SlideCaptchaError) => void;
  onRefresh?: () => void;
  onCancel?: () => void;
  onChange?: (state: SlideCaptchaState) => void;
};
