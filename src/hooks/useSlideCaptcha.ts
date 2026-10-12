import { snapshotFormData } from '../client/formData';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createSlideCaptchaClient } from '../client/createSlideCaptchaClient';
import { SlideCaptchaError, toSlideCaptchaError } from '../client/errors';
import type {
  SlideCaptchaChallenge,
  SlideCaptchaClientOptions,
  SlideCaptchaRequestOptions,
  SlideCaptchaState,
  SlideCaptchaVerifyPayload,
  SlideCaptchaVerifyResponse,
} from '../client/types';

export type UseSlideCaptchaOptions = SlideCaptchaClientOptions & {
  formData: Record<string, unknown>;
  autoLoad?: boolean;
  onSuccess?: (token: string) => void;
  onError?: (error: SlideCaptchaError) => void;
  onChange?: (state: SlideCaptchaState) => void;
  prepareChallenge?: (challenge: SlideCaptchaChallenge) => Promise<void>;
};

export type UseSlideCaptchaReturn = {
  state: SlideCaptchaState;
  refresh: (
    options?: SlideCaptchaRequestOptions & { force?: boolean },
  ) => Promise<SlideCaptchaState['challenge']>;
  verifyChallenge: (
    payload: Omit<SlideCaptchaVerifyPayload, 'form_data'>,
    options?: SlideCaptchaRequestOptions,
  ) => Promise<SlideCaptchaVerifyResponse>;
  setState: Dispatch<SetStateAction<SlideCaptchaState>>;
};

type ChallengeRequest = {
  controller: AbortController;
  epoch: number;
  promise: Promise<SlideCaptchaState['challenge']>;
};

type VerificationRequest = {
  challengeId: string;
  formRevision: number;
  controller: AbortController;
  epoch: number;
  promise: Promise<SlideCaptchaVerifyResponse>;
};

const createInitialState = (status: SlideCaptchaState['status'] = 'idle'): SlideCaptchaState => ({
  status,
  challenge: null,
  x: 0,
  y: 0,
  rotation: 0,
  movements: [],
  token: null,
  error: null,
});

export function useSlideCaptcha(options: UseSlideCaptchaOptions): UseSlideCaptchaReturn {
  const {
    formData,
    autoLoad = true,
    onSuccess,
    onError,
    onChange,
    prepareChallenge,
    baseUrl,
    headers,
    csrfToken,
    csrfHeaderName,
    fetcher,
    credentials,
    challengePath,
    verifyPath,
  } = options;

  const formKey = JSON.stringify(snapshotFormData(formData));
  const formRef = useRef({ key: formKey, revision: 0 });
  if (formRef.current.key !== formKey) formRef.current = { key: formKey, revision: formRef.current.revision + 1 };

  const callbacksRef = useRef({ onSuccess, onError, onChange, prepareChallenge });
  useEffect(() => {
    callbacksRef.current = { onSuccess, onError, onChange, prepareChallenge };
  }, [onSuccess, onError, onChange, prepareChallenge]);

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

  const [state, setStateValue] = useState<SlideCaptchaState>(() =>
    createInitialState(autoLoad ? 'loading' : 'idle'),
  );
  const mountedRef = useRef(true);
  const lifecycleRef = useRef(0);
  const requestEpochRef = useRef(0);
  const challengeRequestRef = useRef<ChallengeRequest | null>(null);
  const verificationRequestRef = useRef<VerificationRequest | null>(null);

  const setState = useCallback<Dispatch<SetStateAction<SlideCaptchaState>>>((nextState) => {
    if (!mountedRef.current) return;
    setStateValue((currentState) => {
      const resolvedState = typeof nextState === 'function' ? nextState(currentState) : nextState;
      callbacksRef.current.onChange?.(resolvedState);
      return resolvedState;
    });
  }, []);

  const refresh = useCallback((
    requestOptions: SlideCaptchaRequestOptions & { force?: boolean } = {},
  ): Promise<SlideCaptchaState['challenge']> => {
    const currentRequest = challengeRequestRef.current;
    if (currentRequest && !requestOptions.force) {
      return currentRequest.promise;
    }

    if (currentRequest) {
      currentRequest.controller.abort(createAbortError('CAPTCHA challenge was replaced'));
      challengeRequestRef.current = null;
    }
    verificationRequestRef.current?.controller.abort(
      createAbortError('CAPTCHA challenge was replaced'),
    );
    verificationRequestRef.current = null;

    const epoch = ++requestEpochRef.current;
    const controller = new AbortController();
    const detachCallerAbort = forwardAbort(requestOptions.signal, controller);

    setState((currentState) => ({
      ...currentState,
      status: 'loading',
      challenge: null,
      error: null,
      token: null,
      movements: [],
    }));

    const promise = (async () => {
      try {
        const challenge = await client.getChallenge({ signal: controller.signal });

        await callbacksRef.current.prepareChallenge?.(challenge);

        if (
          !mountedRef.current
          || controller.signal.aborted
          || requestEpochRef.current !== epoch
        ) {
          return challenge;
        }

        const nextState: SlideCaptchaState = {
          ...createInitialState(),
          status: 'ready',
          challenge,
          y: getInitialY(challenge),
        };

        setState(nextState);
        return challenge;
      } catch (error) {
        if (
          !mountedRef.current
          || controller.signal.aborted
          || requestEpochRef.current !== epoch
        ) {
          throw controller.signal.reason ?? error;
        }

        const slideError = toSlideCaptchaError(
          error,
          'Could not load the slide CAPTCHA challenge.',
        );

        setState((currentState) => ({
          ...currentState,
          status: 'error',
          error: slideError,
        }));
        callbacksRef.current.onError?.(slideError);
        throw slideError;
      } finally {
        detachCallerAbort();
        if (challengeRequestRef.current?.epoch === epoch) {
          challengeRequestRef.current = null;
        }
      }
    })();

    challengeRequestRef.current = { controller, epoch, promise };
    return promise;
  }, [client, setState]);

  const verifyChallenge = useCallback(
    (
      payload: Omit<SlideCaptchaVerifyPayload, 'form_data'>,
      requestOptions: SlideCaptchaRequestOptions = {},
    ): Promise<SlideCaptchaVerifyResponse> => {
      const formRevision = formRef.current.revision;
      const boundForm = JSON.parse(formRef.current.key);
      const currentRequest = verificationRequestRef.current;
      if (currentRequest?.challengeId === payload.challenge_id && currentRequest.formRevision === formRevision) {
        return currentRequest.promise;
      }
      currentRequest?.controller.abort(createAbortError('CAPTCHA verification was replaced'));

      const epoch = requestEpochRef.current;
      const controller = new AbortController();
      const detachCallerAbort = forwardAbort(requestOptions.signal, controller);

      setState((currentState) => ({
        ...currentState,
        status: 'verifying',
        error: null,
      }));

      const promise = (async () => {
        try {
          const response = await client.verifyChallenge({ ...payload, form_data: boundForm }, {
            signal: controller.signal,
          });

          if (
            !mountedRef.current
            || controller.signal.aborted
            || requestEpochRef.current !== epoch
            || formRef.current.revision !== formRevision
          ) {
            throw createAbortError('CAPTCHA form values changed');
          }

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
          if (
            !mountedRef.current
            || controller.signal.aborted
            || requestEpochRef.current !== epoch
            || formRef.current.revision !== formRevision
          ) {
            throw controller.signal.reason ?? error;
          }

          const slideError = toSlideCaptchaError(error, 'Could not verify the slide CAPTCHA.');

          setState((currentState) => ({
            ...currentState,
            status: 'error',
            token: null,
            error: slideError,
          }));
          callbacksRef.current.onError?.(slideError);
          throw slideError;
        } finally {
          detachCallerAbort();
          if (
            verificationRequestRef.current?.controller === controller
          ) {
            verificationRequestRef.current = null;
          }
        }
      })();

      verificationRequestRef.current = {
        challengeId: payload.challenge_id,
        formRevision,
        controller,
        epoch,
        promise,
      };
      return promise;
    },
    [client, setState],
  );

  const previousForm = useRef(formKey);
  useEffect(() => {
    if (previousForm.current === formKey) return;
    previousForm.current = formKey;
    if (autoLoad) void refresh({ force: true }).catch(() => undefined);
    else {
      requestEpochRef.current += 1;
      verificationRequestRef.current?.controller.abort(createAbortError('CAPTCHA form values changed'));
      challengeRequestRef.current?.controller.abort(createAbortError('CAPTCHA form values changed'));
      verificationRequestRef.current = null;
      challengeRequestRef.current = null;
      setState(createInitialState());
    }
  }, [formKey, autoLoad, refresh, setState]);

  useEffect(() => {
    mountedRef.current = true;
    lifecycleRef.current += 1;

    return () => {
      mountedRef.current = false;
      const cleanupLifecycle = ++lifecycleRef.current;

      queueMicrotask(() => {
        if (lifecycleRef.current !== cleanupLifecycle) return;
        requestEpochRef.current += 1;
        challengeRequestRef.current?.controller.abort(
          createAbortError('CAPTCHA component was unmounted'),
        );
        challengeRequestRef.current = null;
        verificationRequestRef.current?.controller.abort(
          createAbortError('CAPTCHA component was unmounted'),
        );
        verificationRequestRef.current = null;
      });
    };
  }, []);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    void refresh().catch(() => undefined);
  }, [autoLoad, refresh]);

  return {
    state,
    refresh,
    verifyChallenge,
    setState,
  };
}

function forwardAbort(
  source: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!source) return () => undefined;
  const abort = () => controller.abort(source.reason ?? createAbortError('CAPTCHA request aborted'));
  if (source.aborted) {
    abort();
    return () => undefined;
  }
  source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

function createAbortError(message: string): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
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
