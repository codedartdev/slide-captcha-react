import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSlideCaptcha } from '../src/hooks/useSlideCaptcha';

const challenge = (challengeId: string) => ({
  challenge_id: challengeId,
  background_url: `/captcha/${challengeId}-background.png`,
  piece_url: `/captcha/${challengeId}-piece.png`,
  piece_width: 40,
  piece_height: 40,
  image_width: 300,
  image_height: 160,
  rotation_enabled: false,
  rotation_step: 0,
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ChallengeHarness({
  fetcher,
  onChallenge,
}: {
  fetcher: typeof fetch;
  onChallenge?: (challengeId: string | null) => void;
}) {
  const { state, refresh } = useSlideCaptcha({
    formData: {},
    autoLoad: false,
    fetcher,
  });

  useEffect(() => {
    onChallenge?.(state.challenge?.challenge_id ?? null);
  }, [onChallenge, state.challenge?.challenge_id]);

  return (
    <>
      <output data-testid="challenge">{state.challenge?.challenge_id ?? 'none'}</output>
      <button type="button" onClick={() => void refresh().catch(() => undefined)}>
        load
      </button>
      <button
        type="button"
        onClick={() => void refresh({ force: true }).catch(() => undefined)}
      >
        replace
      </button>
    </>
  );
}

describe('useSlideCaptcha request lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one in-flight request between concurrent consumers', async () => {
    let resolveChallenge!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          resolveChallenge = resolve;
        }),
    );
    render(<ChallengeHarness fetcher={fetcher} />);

    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    fireEvent.click(screen.getByRole('button', { name: 'load' }));

    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => resolveChallenge(jsonResponse(challenge('shared'))));
    await waitFor(() => expect(screen.getByTestId('challenge')).toHaveTextContent('shared'));
  });

  it('ignores an obsolete response after an explicit replacement', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    render(<ChallengeHarness fetcher={fetcher} />);

    fireEvent.click(screen.getByRole('button', { name: 'load' }));
    fireEvent.click(screen.getByRole('button', { name: 'replace' }));
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => resolvers[1]?.(jsonResponse(challenge('newer'))));
    await waitFor(() => expect(screen.getByTestId('challenge')).toHaveTextContent('newer'));

    await act(async () => resolvers[0]?.(jsonResponse(challenge('obsolete'))));
    expect(screen.getByTestId('challenge')).toHaveTextContent('newer');
  });
});
