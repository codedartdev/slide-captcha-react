import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createSlideCaptchaClient } from '../client/createSlideCaptchaClient';
import { SlideCaptchaError, toSlideCaptchaError } from '../client/errors';
import type {
  SlideCaptchaClientOptions,
  SlideCaptchaState,
  SlideCaptchaVerifyPayload,
  SlideCaptchaVerifyResponse,
} from '../client/types';

export type UseSlideCaptchaOptions = SlideCaptchaClientOptions & {
  autoLoad?: boolean;
  onSuccess?: (token: string) => void;
  onError?: (error: SlideCaptchaError) => void;
  onChange?: (state: SlideCaptchaState) => void;
};

export type UseSlideCaptchaReturn = {
  state: SlideCaptchaState;
  refresh: () => Promise<SlideCaptchaState['challenge']>;
  verifyChallenge: (payload: SlideCaptchaVerifyPayload) => Promise<SlideCaptchaVerifyResponse>;
  setState: Dispatch<SetStateAction<SlideCaptchaState>>;
};

const createInitialState = (): SlideCaptchaState => ({
  status: 'idle',
  challenge: null,
  x: 0,
  y: 0,
  rotation: 0,
  movements: [],
  token: null,
  error: null,
});

export function useSlideCaptcha(options: UseSlideCaptchaOptions = {}): UseSlideCaptchaReturn {
  const {
    autoLoad = true,
    onSuccess,
    onError,
    onChange,
    baseUrl,
    headers,
    csrfToken,
    csrfHeaderName,
    fetcher,
    credentials,
    challengePath,
    verifyPath,
  } = options;

  const callbacksRef = useRef({ onSuccess, onError, onChange });
  callbacksRef.current = { onSuccess, onError, onChange };

  const client = useMemo(
    () =>
      createSlideCaptchaClient({
        baseUrl,
        headers,
        csrfToken,
        csrfHeaderName,
        fetcher,
        credentials,
        challengePath,
        verifyPath,
      }),
    [baseUrl, headers, csrfToken, csrfHeaderName, fetcher, credentials, challengePath, verifyPath],
  );

  const [state, setStateValue] = useState<SlideCaptchaState>(() => createInitialState());

  const setState = useCallback<Dispatch<SetStateAction<SlideCaptchaState>>>((nextState) => {
    setStateValue((currentState) => {
      const resolvedState = typeof nextState === 'function' ? nextState(currentState) : nextState;
      callbacksRef.current.onChange?.(resolvedState);
      return resolvedState;
    });
  }, []);

  const refresh = useCallback(async () => {
    setState((currentState) => ({
      ...currentState,
      status: 'loading',
      challenge: null,
      error: null,
      token: null,
      movements: [],
    }));

    try {
      const challenge = await client.getChallenge();
      const nextState: SlideCaptchaState = {
        ...createInitialState(),
        status: 'ready',
        challenge,
        y: getInitialY(challenge),
      };

      setState(nextState);
      return challenge;
    } catch (error) {
      const slideError = toSlideCaptchaError(error, 'Could not load the slide CAPTCHA challenge.');

      setState((currentState) => ({
        ...currentState,
        status: 'error',
        error: slideError,
      }));
      callbacksRef.current.onError?.(slideError);
      throw slideError;
    }
  }, [client, setState]);

  const verifyChallenge = useCallback(
    async (payload: SlideCaptchaVerifyPayload) => {
      setState((currentState) => ({
        ...currentState,
        status: 'verifying',
        error: null,
      }));

      try {
        const response = await client.verifyChallenge(payload);

        if (response.success && response.token) {
          setState((currentState) => ({
            ...currentState,
            status: 'success',
            token: response.token ?? null,
            error: null,
          }));
          callbacksRef.current.onSuccess?.(response.token);
          return response;
        }

        const error = new SlideCaptchaError(
          'verification_failed',
          response.message ?? 'The slide CAPTCHA verification failed.',
          {
            reason: response.reason,
            response,
          },
        );

        setState((currentState) => ({
          ...currentState,
          status: 'error',
          token: null,
          error,
        }));
        callbacksRef.current.onError?.(error);
        return response;
      } catch (error) {
        const slideError = toSlideCaptchaError(error, 'Could not verify the slide CAPTCHA.');

        setState((currentState) => ({
          ...currentState,
          status: 'error',
          token: null,
          error: slideError,
        }));
        callbacksRef.current.onError?.(slideError);
        throw slideError;
      }
    },
    [client, setState],
  );

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    void refresh();
  }, [autoLoad, refresh]);

  return {
    state,
    refresh,
    verifyChallenge,
    setState,
  };
}

function getInitialY(challenge: NonNullable<SlideCaptchaState['challenge']>): number {
  return clamp(
    (challenge.image_height - challenge.piece_height) / 2,
    0,
    challenge.image_height - challenge.piece_height,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
