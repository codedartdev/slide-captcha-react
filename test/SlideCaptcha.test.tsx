import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlideCaptcha } from '../src/components/SlideCaptcha';

const challenge = {
  challenge_id: 'challenge-1',
  background_url: '/captcha/background.png',
  piece_url: '/captcha/piece.png',
  piece_width: 40,
  piece_height: 40,
  image_width: 300,
  image_height: 160,
  rotation_enabled: false,
  rotation_step: 0,
};

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('SlideCaptcha', () => {
  it('loads a challenge and calls onSuccess after verification', async () => {
    const onSuccess = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({ success: true, token: 'captcha-token' });
      }

      return jsonResponse(challenge);
    });

    render(<SlideCaptcha fetcher={fetcher} onSuccess={onSuccess} />);

    const verifyButton = await screen.findByRole('button', { name: 'Verificar CAPTCHA' });
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('captcha-token');
    });

    const [, verifyInit] = fetcher.mock.calls[1];
    const payload = JSON.parse(verifyInit?.body as string);

    expect(payload).toMatchObject({
      challenge_id: 'challenge-1',
      x: 0,
      y: 60,
      rotation: 0,
    });
    expect(payload.movements).toHaveLength(1);
  });

  it('updates the challenge rotation with the slider', async () => {
    const onSuccess = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({ success: true, token: 'captcha-token' });
      }

      return jsonResponse({
        ...challenge,
        challenge_id: 'challenge-with-rotation',
        rotation_enabled: true,
        rotation_step: 15,
      });
    });

    render(<SlideCaptcha fetcher={fetcher} onSuccess={onSuccess} />);

    const rotationSlider = await screen.findByRole('slider', { name: 'Ajustar rotação' });
    fireEvent.change(rotationSlider, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar CAPTCHA' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('captcha-token');
    });

    const [, verifyInit] = fetcher.mock.calls[1];
    const payload = JSON.parse(verifyInit?.body as string);
    const lastMovement = payload.movements[payload.movements.length - 1];

    expect(payload.rotation).toBe(30);
    expect(lastMovement).toMatchObject({
      x: 0,
      y: 60,
      r: 30,
    });
  });
});
