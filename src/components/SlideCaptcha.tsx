import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { useSlideCaptcha } from '../hooks/useSlideCaptcha';
import type {
  SlideCaptchaChallenge,
  SlideCaptchaColorOverrides,
  SlideCaptchaMovementPoint,
  SlideCaptchaProps,
  SlideCaptchaStatus,
  SlideCaptchaTexts,
} from '../client/types';

const DEFAULT_TEXTS: Required<SlideCaptchaTexts> = {
  loading: 'Carregando CAPTCHA...',
  dragInstructions: 'Arraste a peça até o encaixe e ajuste a rotação.',
  challengeUnavailable: 'Desafio indisponível.',
  title: 'Verificação de segurança',
  subtitle: 'Confirme para executar a transferência.',
  verify: 'Verificar CAPTCHA',
  verified: 'CAPTCHA resolvido.',
  refresh: 'Recarregar',
  cancel: 'Cancelar',
  close: 'Fechar verificação',
  rotationLabel: 'Ajustar rotação',
  rotateLeft: 'Girar para a esquerda',
  rotateRight: 'Girar para a direita',
  errorTitle: 'Não foi possível validar o CAPTCHA.',
  pieceAlt: 'Peça do CAPTCHA',
  backgroundAlt: 'Imagem do desafio CAPTCHA',
};

const COLOR_VARIABLES: Record<keyof SlideCaptchaColorOverrides, string> = {
  accent: '--scaptcha-accent',
  background: '--scaptcha-bg',
  backdrop: '--scaptcha-backdrop',
  badgeBackground: '--scaptcha-badge-bg',
  badgeBorder: '--scaptcha-badge-border',
  border: '--scaptcha-border',
  borderStrong: '--scaptcha-border-strong',
  danger: '--scaptcha-danger',
  dangerBackground: '--scaptcha-danger-bg',
  dangerBorder: '--scaptcha-danger-border',
  divider: '--scaptcha-divider',
  focus: '--scaptcha-focus',
  iconHoverBackground: '--scaptcha-icon-hover-bg',
  mutedText: '--scaptcha-muted',
  panelShadow: '--scaptcha-panel-shadow',
  panelSoftBackground: '--scaptcha-panel-soft',
  pieceBorder: '--scaptcha-piece-border',
  pieceShadow: '--scaptcha-piece-shadow',
  primary: '--scaptcha-primary',
  primaryHover: '--scaptcha-primary-hover',
  primaryText: '--scaptcha-primary-text',
  rotationDivider: '--scaptcha-rotation-divider',
  rotationIcon: '--scaptcha-rotation-icon',
  rotationThumbShadow: '--scaptcha-rotation-thumb-shadow',
  secondaryButtonBackground: '--scaptcha-secondary-bg',
  secondaryButtonHoverBackground: '--scaptcha-secondary-hover-bg',
  secondaryButtonHoverBorder: '--scaptcha-secondary-hover-border',
  softText: '--scaptcha-soft',
  stageBackground: '--scaptcha-stage-bg',
  subtleText: '--scaptcha-subtle',
  success: '--scaptcha-success',
  successRing: '--scaptcha-success-ring',
  text: '--scaptcha-text',
  track: '--scaptcha-track',
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

type CaptchaAsset = 'background' | 'piece';

type AssetLoadEntry = {
  background: boolean;
  piece: boolean;
  error: boolean;
};

type AssetLoadState = Record<string, AssetLoadEntry | undefined>;

export function SlideCaptcha({
  baseUrl,
  csrfToken,
  csrfHeaderName,
  headers,
  fetcher,
  credentials,
  challengePath,
  verifyPath,
  className,
  disabled = false,
  theme = 'dark',
  variant = 'inline',
  colors,
  texts,
  onSuccess,
  onError,
  onRefresh,
  onCancel,
  onChange,
}: SlideCaptchaProps) {
  const resolvedTexts = useMemo(() => ({ ...DEFAULT_TEXTS, ...texts }), [texts]);
  const colorStyle = useMemo(() => getColorStyle(colors), [colors]);
  const titleId = useId();
  const subtitleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const interactionStartedAtRef = useRef<number>(now());
  const lastChallengeIdRef = useRef<string | null>(null);
  const [assetLoadState, setAssetLoadState] = useState<AssetLoadState>({});

  const preloadChallenge = useCallback(
    async (nextChallenge: SlideCaptchaChallenge) => {
      const nextBackgroundUrl = resolveAssetUrl(nextChallenge.background_url, baseUrl);
      const nextPieceUrl = resolveAssetUrl(nextChallenge.piece_url, baseUrl);
      const nextAssetKey = createAssetLoadKey(
        nextChallenge.challenge_id,
        nextBackgroundUrl,
        nextPieceUrl,
      );

      await preloadCaptchaAssets(nextBackgroundUrl, nextPieceUrl);

      setAssetLoadState((currentState) => ({
        ...currentState,
        [nextAssetKey]: createLoadedAssetEntry(),
      }));
    },
    [baseUrl],
  );

  const { state, refresh, verifyChallenge, setState } = useSlideCaptcha({
    baseUrl,
    csrfToken,
    csrfHeaderName,
    headers,
    fetcher,
    credentials,
    challengePath,
    verifyPath,
    onSuccess,
    onError,
    onChange,
    prepareChallenge: preloadChallenge,
  });

  const { challenge } = state;
  const challengeId = challenge?.challenge_id ?? null;
  const backgroundUrl = challenge ? resolveAssetUrl(challenge.background_url, baseUrl) : undefined;
  const pieceUrl = challenge ? resolveAssetUrl(challenge.piece_url, baseUrl) : undefined;
  const assetLoadKey =
    challengeId && backgroundUrl && pieceUrl
      ? createAssetLoadKey(challengeId, backgroundUrl, pieceUrl)
      : null;
  const currentAssetLoadState = assetLoadKey ? assetLoadState[assetLoadKey] : undefined;
  const assetsAreReady =
    Boolean(currentAssetLoadState?.background) &&
    Boolean(currentAssetLoadState?.piece) &&
    !currentAssetLoadState?.error;
  const assetsHaveFailed = Boolean(currentAssetLoadState?.error);
  const assetsAreLoading = Boolean(challenge) && !assetsAreReady && !assetsHaveFailed;
  const visualStatus: SlideCaptchaStatus = assetsHaveFailed
    ? 'error'
    : state.status === 'ready' && assetsAreLoading
      ? 'loading'
      : state.status;
  const isBusy = visualStatus === 'loading' || visualStatus === 'verifying';
  const isSolved = state.status === 'success';
  const canInteract =
    Boolean(challenge) &&
    assetsAreReady &&
    !disabled &&
    !isBusy &&
    !isSolved &&
    state.status !== 'error';

  useEffect(() => {
    if (!challenge || lastChallengeIdRef.current === challenge.challenge_id) {
      return;
    }

    lastChallengeIdRef.current = challenge.challenge_id;
    interactionStartedAtRef.current = now();

    setState((currentState) => ({
      ...currentState,
      x: 0,
      y: getInitialY(challenge),
      rotation: 0,
      movements: [],
      token: null,
      error: null,
      status: 'ready',
    }));
  }, [challenge, setState]);

  const markAssetLoaded = useCallback((asset: CaptchaAsset, loadedAssetKey: string) => {
    setAssetLoadState((currentState) => {
      const nextEntry = currentState[loadedAssetKey] ?? createAssetLoadEntry();

      if (nextEntry.error || nextEntry[asset]) {
        return currentState;
      }

      return {
        ...currentState,
        [loadedAssetKey]: {
          ...nextEntry,
          [asset]: true,
        },
      };
    });
  }, []);

  const handleAssetLoad = useCallback(
    (asset: CaptchaAsset, loadedAssetKey: string, image: HTMLImageElement) => {
      const markLoaded = () => {
        markAssetLoaded(asset, loadedAssetKey);
      };

      if (typeof image.decode === 'function') {
        try {
          void image
            .decode()
            .catch(() => undefined)
            .then(markLoaded);
          return;
        } catch {
          // Fall back to the load event result if decode is not usable in the current browser.
        }
      }

      markLoaded();
    },
    [markAssetLoaded],
  );

  const handleAssetError = useCallback((loadedAssetKey: string) => {
    setAssetLoadState((currentState) => {
      const nextEntry = currentState[loadedAssetKey] ?? createAssetLoadEntry();

      if (nextEntry.error) {
        return currentState;
      }

      return {
        ...currentState,
        [loadedAssetKey]: {
          ...nextEntry,
          error: true,
        },
      };
    });
  }, []);

  const addMovement = useCallback(
    (x: number, y: number, rotation: number) => {
      const signedRotation = getSignedRotation(rotation);
      const point: SlideCaptchaMovementPoint = {
        x: roundCoordinate(x),
        y: roundCoordinate(y),
        r: normalizeRotation(signedRotation),
        t: Math.max(0, Math.round(now() - interactionStartedAtRef.current)),
      };

      setState((currentState) => ({
        ...currentState,
        x: point.x,
        y: point.y,
        rotation: signedRotation,
        movements: [...currentState.movements, point],
        token: null,
        error: null,
        status: currentState.status === 'dragging' ? 'dragging' : 'ready',
      }));
    },
    [setState],
  );

  const getNaturalPosition = useCallback(
    (clientX: number, clientY: number, offsetX = 0, offsetY = 0) => {
      if (!challenge || !stageRef.current) {
        return { x: state.x, y: state.y };
      }

      const rect = stageRef.current.getBoundingClientRect();
      const displayX = clientX - rect.left - offsetX;
      const displayY = clientY - rect.top - offsetY;
      const scaleX = challenge.image_width / rect.width;
      const scaleY = challenge.image_height / rect.height;

      return {
        x: clamp(displayX * scaleX, 0, challenge.image_width - challenge.piece_width),
        y: clamp(displayY * scaleY, 0, challenge.image_height - challenge.piece_height),
      };
    },
    [challenge, state.x, state.y],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLImageElement>) => {
      if (!challenge || !canInteract || !stageRef.current) {
        return;
      }

      const rect = stageRef.current.getBoundingClientRect();
      const pieceDisplayX = (state.x / challenge.image_width) * rect.width;
      const pieceDisplayY = (state.y / challenge.image_height) * rect.height;

      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left - pieceDisplayX,
        offsetY: event.clientY - rect.top - pieceDisplayY,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      setState((currentState) => ({
        ...currentState,
        status: 'dragging',
        token: null,
        error: null,
      }));
      addMovement(state.x, state.y, state.rotation);
    },
    [addMovement, canInteract, challenge, setState, state.rotation, state.x, state.y],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLImageElement>) => {
      const dragState = dragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId || !canInteract) {
        return;
      }

      const position = getNaturalPosition(
        event.clientX,
        event.clientY,
        dragState.offsetX,
        dragState.offsetY,
      );

      addMovement(position.x, position.y, state.rotation);
    },
    [addMovement, canInteract, getNaturalPosition, state.rotation],
  );

  const finishDragging = useCallback(
    (event: PointerEvent<HTMLImageElement>) => {
      const dragState = dragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setState((currentState) => ({
        ...currentState,
        status: currentState.status === 'dragging' ? 'ready' : currentState.status,
      }));
    },
    [setState],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLImageElement>) => {
      if (!challenge || !canInteract) {
        return;
      }

      const step = event.shiftKey ? 10 : 5;
      let nextX = state.x;
      let nextY = state.y;

      if (event.key === 'ArrowLeft') {
        nextX -= step;
      } else if (event.key === 'ArrowRight') {
        nextX += step;
      } else if (event.key === 'ArrowUp') {
        nextY -= step;
      } else if (event.key === 'ArrowDown') {
        nextY += step;
      } else {
        return;
      }

      event.preventDefault();
      addMovement(
        clamp(nextX, 0, challenge.image_width - challenge.piece_width),
        clamp(nextY, 0, challenge.image_height - challenge.piece_height),
        state.rotation,
      );
    },
    [addMovement, canInteract, challenge, state.rotation, state.x, state.y],
  );

  const handleRotationChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!challenge || !canInteract || !challenge.rotation_enabled) {
        return;
      }

      const nextRotation = Number(event.currentTarget.value);

      if (!Number.isFinite(nextRotation)) {
        return;
      }

      addMovement(state.x, state.y, nextRotation);
    },
    [addMovement, canInteract, challenge, state.x, state.y],
  );

  const handleRefresh = useCallback(async () => {
    if (disabled) {
      return;
    }

    try {
      await refresh();
      onRefresh?.();
    } catch {
      // The hook already normalizes and reports the error.
    }
  }, [disabled, onRefresh, refresh]);

  const handleVerify = useCallback(async () => {
    if (!challenge || !canInteract) {
      return;
    }

    const fallbackMovement: SlideCaptchaMovementPoint = {
      x: roundCoordinate(state.x),
      y: roundCoordinate(state.y),
      r: normalizeRotation(state.rotation),
      t: Math.max(0, Math.round(now() - interactionStartedAtRef.current)),
    };

    try {
      await verifyChallenge({
        challenge_id: challenge.challenge_id,
        x: roundCoordinate(state.x),
        y: roundCoordinate(state.y),
        rotation: normalizeRotation(state.rotation),
        movements: state.movements.length > 0 ? state.movements : [fallbackMovement],
      });
    } catch {
      // The hook already normalizes and reports the error.
    }
  }, [
    canInteract,
    challenge,
    state.movements,
    state.rotation,
    state.x,
    state.y,
    verifyChallenge,
  ]);

  const handleCancel = useCallback(() => {
    if (disabled) {
      return;
    }

    onCancel?.();
  }, [disabled, onCancel]);

  const rootClassName = ['scaptcha', className].filter(Boolean).join(' ');
  const rotationStep =
    challenge?.rotation_step && challenge.rotation_step > 0 ? challenge.rotation_step : 1;
  const rotationLimit = challenge ? getRotationSliderLimit(challenge.rotation_step) : 0;
  const rotationSliderValue =
    rotationLimit > 0 ? clamp(getSignedRotation(state.rotation), -rotationLimit, rotationLimit) : 0;
  const rotationProgress =
    rotationLimit > 0 ? ((rotationSliderValue + rotationLimit) / (rotationLimit * 2)) * 100 : 50;
  const rotationTrackStart = Math.min(50, rotationProgress);
  const rotationTrackEnd = Math.max(50, rotationProgress);
  const rotationValueText = formatRotation(rotationSliderValue);
  const rotationSliderStyle = {
    '--scaptcha-rotation-progress': `${rotationProgress}%`,
    '--scaptcha-rotation-start': `${rotationTrackStart}%`,
    '--scaptcha-rotation-end': `${rotationTrackEnd}%`,
  } as CSSProperties;
  const canRotate = canInteract && rotationLimit > 0;
  const stageStyle = challenge
    ? {
        aspectRatio: `${challenge.image_width} / ${challenge.image_height}`,
      }
    : undefined;
  const pieceStyle = challenge
    ? {
        left: `${(state.x / challenge.image_width) * 100}%`,
        top: `${(state.y / challenge.image_height) * 100}%`,
        width: `${(challenge.piece_width / challenge.image_width) * 100}%`,
        height: `${(challenge.piece_height / challenge.image_height) * 100}%`,
        transform: `rotate(${normalizeRotation(state.rotation)}deg)`,
      }
    : undefined;
  const shouldRenderStage = Boolean(challenge && assetLoadKey && !assetsHaveFailed);
  const placeholderState = visualStatus === 'loading' ? 'loading' : 'empty';
  const placeholderText =
    visualStatus === 'loading' ? resolvedTexts.loading : resolvedTexts.challengeUnavailable;

  const captchaBody = (
    <>
      <div className="scaptcha__body">
        <div className="scaptcha__status" aria-live="polite">
          {getStatusText(visualStatus, resolvedTexts)}
        </div>

        {shouldRenderStage && challenge && assetLoadKey ? (
          <div
            className="scaptcha__stage"
            data-assets={assetsAreReady ? 'ready' : 'loading'}
            ref={stageRef}
            style={stageStyle}
          >
            <img
              key={`background-${challenge.challenge_id}-${backgroundUrl}`}
              className="scaptcha__background"
              src={backgroundUrl}
              alt={resolvedTexts.backgroundAlt}
              decoding="async"
              draggable={false}
              loading="eager"
              onError={() => {
                handleAssetError(assetLoadKey);
              }}
              onLoad={(event) => {
                handleAssetLoad('background', assetLoadKey, event.currentTarget);
              }}
            />
            <img
              key={`piece-${challenge.challenge_id}-${pieceUrl}`}
              className="scaptcha__piece"
              src={pieceUrl}
              alt={resolvedTexts.pieceAlt}
              role="button"
              tabIndex={canInteract ? 0 : -1}
              aria-label={resolvedTexts.dragInstructions}
              aria-disabled={!canInteract}
              draggable={false}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDragging}
              onPointerCancel={finishDragging}
              onKeyDown={handleKeyDown}
              decoding="async"
              loading="eager"
              onError={() => {
                handleAssetError(assetLoadKey);
              }}
              onLoad={(event) => {
                handleAssetLoad('piece', assetLoadKey, event.currentTarget);
              }}
              style={pieceStyle}
            />
            {assetsAreLoading ? (
              <div className="scaptcha__stage-loader" aria-hidden="true">
                <span className="scaptcha__loader" />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="scaptcha__placeholder" data-state={placeholderState}>
            {placeholderState === 'loading' ? (
              <span className="scaptcha__loader" aria-hidden="true" />
            ) : null}
            <span>{placeholderText}</span>
          </div>
        )}
      </div>

      {state.error ? (
        <div className="scaptcha__error" role="alert">
          <strong>{resolvedTexts.errorTitle}</strong>
          <span>{state.error.message}</span>
        </div>
      ) : null}

      <div className="scaptcha__controls">
        {challenge?.rotation_enabled ? (
          <div className="scaptcha__rotation-control">
            <div className="scaptcha__rotation-meta">
              <span className="scaptcha__rotation-label">{resolvedTexts.rotationLabel}</span>
              <span className="scaptcha__rotation-hints" aria-hidden="true">
                <span>↺</span>
                <span />
                <span>↻</span>
              </span>
              <output className="scaptcha__sr-only">{rotationValueText}</output>
            </div>
            <input
              className="scaptcha__rotation-slider"
              type="range"
              min={-rotationLimit}
              max={rotationLimit}
              step={rotationStep}
              value={rotationSliderValue}
              onChange={handleRotationChange}
              disabled={!canRotate}
              aria-label={resolvedTexts.rotationLabel}
              aria-valuetext={rotationValueText}
              style={rotationSliderStyle}
            />
          </div>
        ) : null}

        <div className="scaptcha__main-controls">
          <button
            className="scaptcha__button scaptcha__button--secondary"
            type="button"
            onClick={handleRefresh}
            disabled={disabled || isBusy}
          >
            <RefreshIcon />
            <span>{resolvedTexts.refresh}</span>
          </button>
          <button
            className="scaptcha__button scaptcha__button--primary"
            type="button"
            onClick={handleVerify}
            disabled={!canInteract}
          >
            <ShieldIcon />
            <span>{isSolved ? resolvedTexts.verified : resolvedTexts.verify}</span>
          </button>
        </div>

        {variant === 'modal' && onCancel ? (
          <button
            className="scaptcha__cancel-button"
            type="button"
            onClick={handleCancel}
            disabled={disabled}
          >
            {resolvedTexts.cancel}
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={rootClassName}
      data-status={visualStatus}
      data-theme={theme}
      data-variant={variant}
      aria-busy={isBusy}
      style={colorStyle}
    >
      <div
        className="scaptcha__panel"
        role={variant === 'modal' ? 'dialog' : undefined}
        aria-modal={variant === 'modal' ? true : undefined}
        aria-labelledby={variant === 'modal' ? titleId : undefined}
        aria-describedby={variant === 'modal' ? subtitleId : undefined}
      >
        {variant === 'modal' ? (
          <>
            <div className="scaptcha__accent" aria-hidden="true">
              <span />
            </div>

            <div className="scaptcha__header">
              <div className="scaptcha__heading">
                <span className="scaptcha__badge" aria-hidden="true">
                  <ShieldIcon />
                </span>
                <div className="scaptcha__heading-copy">
                  <h2 className="scaptcha__title" id={titleId}>
                    {resolvedTexts.title}
                  </h2>
                  <p className="scaptcha__subtitle" id={subtitleId}>
                    {resolvedTexts.subtitle}
                  </p>
                </div>
              </div>

              {onCancel ? (
                <button
                  className="scaptcha__icon-button"
                  type="button"
                  onClick={handleCancel}
                  disabled={disabled}
                  aria-label={resolvedTexts.close}
                >
                  <CloseIcon />
                </button>
              ) : null}
            </div>

            <div className="scaptcha__divider" aria-hidden="true" />
          </>
        ) : null}

        {captchaBody}
      </div>
    </div>
  );
}

function createAssetLoadEntry(): AssetLoadEntry {
  return {
    background: false,
    piece: false,
    error: false,
  };
}

function createLoadedAssetEntry(): AssetLoadEntry {
  return {
    background: true,
    piece: true,
    error: false,
  };
}

async function preloadCaptchaAssets(backgroundUrl: string, pieceUrl: string): Promise<void> {
  await Promise.all([preloadImage(backgroundUrl), preloadImage(pieceUrl)]);
}

async function preloadImage(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    const priorityImage = image as HTMLImageElement & { fetchPriority?: 'high' | 'low' | 'auto' };

    image.decoding = 'async';
    priorityImage.fetchPriority = 'high';
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image
          .decode()
          .catch(() => undefined)
          .then(resolve);
        return;
      }

      resolve();
    };
    image.onerror = () => {
      reject(new Error(`Could not load CAPTCHA image: ${url}`));
    };
    image.src = url;
  });
}

function createAssetLoadKey(
  challengeId: string,
  backgroundUrl: string,
  pieceUrl: string,
): string {
  return JSON.stringify([challengeId, backgroundUrl, pieceUrl]);
}

function getStatusText(status: SlideCaptchaStatus, texts: Required<SlideCaptchaTexts>): string {
  if (status === 'loading') {
    return texts.loading;
  }

  if (status === 'success') {
    return texts.verified;
  }

  if (status === 'verifying') {
    return texts.verify;
  }

  if (status === 'error') {
    return texts.challengeUnavailable;
  }

  return texts.dragInstructions;
}

function getInitialY(challenge: SlideCaptchaChallenge): number {
  return clamp(
    (challenge.image_height - challenge.piece_height) / 2,
    0,
    challenge.image_height - challenge.piece_height,
  );
}

function roundCoordinate(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeRotation(value: number): number {
  const rotation = value % 360;
  return rotation < 0 ? rotation + 360 : rotation;
}

function getSignedRotation(value: number): number {
  const rotation = normalizeRotation(value);

  if (rotation === 180 && value < 0) {
    return -180;
  }

  return rotation > 180 ? rotation - 360 : rotation;
}

function getRotationSliderLimit(rotationStep: number): number {
  if (rotationStep <= 0 || rotationStep > 180) {
    return 0;
  }

  return Math.floor(180 / rotationStep) * rotationStep;
}

function formatRotation(value: number): string {
  const rotation = getSignedRotation(value);
  const formatted = Number.isInteger(rotation)
    ? String(rotation)
    : String(Number(rotation.toFixed(1)));

  return `${formatted}°`;
}

function resolveAssetUrl(url: string, baseUrl?: string): string {
  if (isAbsoluteUrl(url) || !baseUrl) {
    return url;
  }

  if (isAbsoluteHttpUrl(baseUrl)) {
    try {
      return new URL(url, ensureTrailingSlash(baseUrl)).toString();
    } catch {
      return url;
    }
  }

  if (url.startsWith('/')) {
    return url;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(url) || url.startsWith('//');
}

function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function getColorStyle(colors?: SlideCaptchaColorOverrides): CSSProperties | undefined {
  if (!colors) {
    return undefined;
  }

  const style: Record<string, string> = {};

  for (const [key, value] of Object.entries(colors) as Array<
    [keyof SlideCaptchaColorOverrides, string | undefined]
  >) {
    if (value) {
      style[COLOR_VARIABLES[key]] = value;
    }
  }

  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M12 3.75 18.25 6v4.85c0 3.9-2.48 7.48-6.25 9.08-3.77-1.6-6.25-5.18-6.25-9.08V6L12 3.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m9.7 12.1 1.55 1.55 3.1-3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="m6.75 6.75 10.5 10.5M17.25 6.75l-10.5 10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M6.1 9.35A6.4 6.4 0 0 1 17.45 7.7L19 9.25M17.9 14.65A6.4 6.4 0 0 1 6.55 16.3L5 14.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 5.25v4h-4M5 18.75v-4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
