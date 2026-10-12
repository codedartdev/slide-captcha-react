import { describe, expect, it, vi } from 'vitest';
import { createSlideCaptchaClient } from '../src/client/createSlideCaptchaClient';

const challenge = {
  challenge_id: 'challenge-1',
  background_url: '/captcha/background.png',
  piece_url: '/captcha/piece.png',
  piece_width: 48,
  piece_height: 48,
  image_width: 320,
  image_height: 180,
  rotation_enabled: true,
  rotation_step: 15,
};

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

describe('createSlideCaptchaClient', () => {
  it('uses the same-origin Laravel endpoints without path configuration', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => (
      String(input).endsWith('/verify')
        ? jsonResponse({ success: true, token: 'ok' })
        : jsonResponse(challenge)
    ));
    const client = createSlideCaptchaClient({ fetcher });

    await client.getChallenge();
    await client.verifyChallenge({
      form_data: {},
      challenge_id: 'challenge-1',
      x: 120,
      y: 45,
      rotation: 0,
      movements: [{ x: 120, y: 45, r: 0, t: 320 }],
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe('/slide-captcha/new');
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
    }));
    expect(fetcher.mock.calls[1]?.[0]).toBe('/slide-captcha/verify');
    expect(fetcher.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));
  });

  it('loads a challenge with baseUrl, custom headers and csrf token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(challenge));
    const client = createSlideCaptchaClient({
      baseUrl: 'https://api.test',
      csrfToken: 'csrf-token',
      headers: {
        'X-App': 'web',
      },
      fetcher,
    });

    const result = await client.getChallenge();
    const [, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(result).toEqual(challenge);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.test/slide-captcha/new',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
      }),
    );
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-App')).toBe('web');
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-token');
  });

  it('forwards AbortSignal to challenge and verification requests', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => (
      String(input).endsWith('/verify')
        ? jsonResponse({ success: true, token: 'ok' })
        : jsonResponse(challenge)
    ));
    const client = createSlideCaptchaClient({ fetcher });
    const challengeController = new AbortController();
    const verifyController = new AbortController();

    await client.getChallenge({ signal: challengeController.signal });
    await client.verifyChallenge({
      form_data: {},
      challenge_id: 'challenge-1',
      x: 120,
      y: 45,
      rotation: 0,
      movements: [],
    }, { signal: verifyController.signal });

    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(challengeController.signal);
    expect(fetcher.mock.calls[1]?.[1]?.signal).toBe(verifyController.signal);
  });

  it('verifies a challenge using JSON payload', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, token: 'ok' }));
    const client = createSlideCaptchaClient({
      baseUrl: '/api',
      fetcher,
    });

    const result = await client.verifyChallenge({
      form_data: {},
      challenge_id: 'challenge-1',
      x: 120,
      y: 45,
      rotation: 15,
      movements: [{ x: 120, y: 45, r: 15, t: 320 }],
    });

    const [, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(result).toEqual({ success: true, token: 'ok' });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/slide-captcha/verify',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({
      form_data: {},
      challenge_id: 'challenge-1',
      x: 120,
      y: 45,
      rotation: 15,
      movements: [{ x: 120, y: 45, r: 15, t: 320 }],
    });
  });

  it('normalizes backend errors', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ message: 'Expired challenge.', reason: 'expired' }, { status: 422 }),
    );
    const client = createSlideCaptchaClient({ fetcher });

    await expect(client.getChallenge()).rejects.toMatchObject({
      code: 'backend_error',
      status: 422,
      reason: 'expired',
      message: 'Expired challenge.',
    });
  });

  it('reports invalid JSON', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('not json', { status: 200 }));
    const client = createSlideCaptchaClient({ fetcher });

    await expect(client.getChallenge()).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });

  it('reports invalid challenge data', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ ...challenge, piece_width: 0 }));
    const client = createSlideCaptchaClient({ fetcher });

    await expect(client.getChallenge()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
