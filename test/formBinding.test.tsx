import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { snapshotFormData } from '../src/client/formData';
import { useSlideCaptcha } from '../src/hooks/useSlideCaptcha';
import { createSlideCaptchaClient } from '../src/client/createSlideCaptchaClient';

const challenge = { challenge_id: 'bound', background_url: '/bg', piece_url: '/piece', piece_width: 40, piece_height: 40, image_width: 300, image_height: 160, rotation_enabled: false, rotation_step: 0 };
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const solve = { challenge_id: 'bound', x: 1, y: 2, rotation: 0, movements: [] };

describe('form-bound verification', () => {
  it('copies and freezes nested JSON without silently dropping sensitive values', () => {
    const form = { password: ' secret ', profile: { flags: [false, null, 0, ''] } };
    const copy = snapshotFormData(form);
    form.profile.flags[0] = true;
    expect(copy).toEqual({ password: ' secret ', profile: { flags: [false, null, 0, ''] } });
    expect(Object.isFrozen(copy)).toBe(true);
    for (const invalid of [undefined, [], { field: undefined }, { field: NaN }, { field: new Date() }]) {
      expect(() => snapshotFormData(invalid as never)).toThrow();
    }
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => snapshotFormData(cycle)).toThrow();
  });

  it('requires a snapshot before making the verification request', () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createSlideCaptchaClient({ fetcher });
    expect(() => client.verifyChallenge(solve as never)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a late successful response after a form edit, even if fetch ignores abort', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>((_, init) => init?.method === 'POST'
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(challenge)));
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(({ formData }) => useSlideCaptcha({ formData, fetcher, onSuccess }), { initialProps: { formData: { password: 'first' } } });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    let verification!: Promise<unknown>;
    act(() => { verification = result.current.verifyChallenge(solve).catch(error => error); });
    expect(JSON.parse(String(fetcher.mock.calls[fetcher.mock.calls.length - 1]?.[1]?.body)).form_data).toEqual({ password: 'first' });
    rerender({ formData: { password: 'second' } });
    await act(async () => { finish(response({ success: true, token: 'obsolete' })); await verification; });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.state.token).toBeNull();
  });

  it('clears a solved proof when values change and accepts the backend token alias', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_, init) => response(init?.method === 'POST' ? { success: true, verification_token: 'proof' } : challenge));
    const { result, rerender } = renderHook(({ formData }) => useSlideCaptcha({ formData, fetcher }), { initialProps: { formData: { email: 'first@example.test' } } });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => { await result.current.verifyChallenge(solve); });
    expect(result.current.state.token).toBe('proof');
    rerender({ formData: { email: 'second@example.test' } });
    await waitFor(() => expect(result.current.state.token).toBeNull());
  });
});
