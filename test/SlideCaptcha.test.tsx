import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

type MockImageRecord = {
  image: {
    onload: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    src: string;
  };
};

function mockImageLoader({ autoResolve = true } = {}) {
  const pending: MockImageRecord[] = [];

  class MockImage {
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    decoding: HTMLImageElement['decoding'] = 'auto';
    fetchPriority?: 'high' | 'low' | 'auto';
    #src = '';

    decode = vi.fn(() => Promise.resolve());

    get src() {
      return this.#src;
    }

    set src(value: string) {
      this.#src = value;
      const record = { image: this };
      pending.push(record);

      if (autoResolve) {
        queueMicrotask(() => {
          record.image.onload?.(new Event('load'));
        });
      }
    }
  }

  vi.stubGlobal('Image', MockImage);

  return {
    pending,
    resolveAll() {
      for (const record of pending) {
        record.image.onload?.(new Event('load'));
      }
    },
  };
}

async function waitForCaptchaReady() {
  const background = await screen.findByAltText('Imagem do desafio CAPTCHA');
  const piece = await screen.findByAltText('Peça do CAPTCHA');

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Verificar CAPTCHA' })).toBeEnabled();
  });

  return { background, piece };
}

describe('SlideCaptcha', () => {
  beforeEach(() => {
    mockImageLoader();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows loading feedback while the challenge is not available yet', async () => {
    let resolveChallenge!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          resolveChallenge = resolve;
        }),
    );

    render(<SlideCaptcha fetcher={fetcher} />);

    expect(screen.getAllByText('Carregando CAPTCHA...')).toHaveLength(2);
    expect(screen.queryByText('Desafio indisponível.')).not.toBeInTheDocument();

    resolveChallenge(jsonResponse(challenge));

    expect(await screen.findByAltText('Imagem do desafio CAPTCHA')).toBeInTheDocument();
  });

  it('preloads challenge images before rendering the challenge', async () => {
    vi.unstubAllGlobals();
    const imageLoader = mockImageLoader({ autoResolve: false });
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(challenge));

    render(<SlideCaptcha fetcher={fetcher} />);

    await waitFor(() => {
      expect(imageLoader.pending).toHaveLength(2);
    });

    expect(screen.queryByAltText('Imagem do desafio CAPTCHA')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Peça do CAPTCHA')).not.toBeInTheDocument();
    expect(screen.getAllByText('Carregando CAPTCHA...')).toHaveLength(2);

    imageLoader.resolveAll();

    await waitForCaptchaReady();
  });

  it('loads a challenge and calls onSuccess after verification', async () => {
    const onSuccess = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({ success: true, token: 'captcha-token' });
      }

      return jsonResponse(challenge);
    });

    const { container } = render(<SlideCaptcha fetcher={fetcher} onSuccess={onSuccess} />);

    expect(container.firstElementChild?.getAttribute('data-theme')).toBe('dark');
    expect(container.firstElementChild?.getAttribute('data-variant')).toBe('inline');

    await waitForCaptchaReady();
    const verifyButton = screen.getByRole('button', { name: 'Verificar CAPTCHA' });
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

    await waitForCaptchaReady();
    const rotationSlider = screen.getByRole('slider', { name: 'Ajustar rotação' });
    expect((rotationSlider as HTMLInputElement).value).toBe('0');
    expect(rotationSlider).toHaveAttribute('min', '-180');
    expect(rotationSlider).toHaveAttribute('max', '180');

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

  it('normalizes left rotation from the centered slider', async () => {
    const onSuccess = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({ success: true, token: 'captcha-token' });
      }

      return jsonResponse({
        ...challenge,
        challenge_id: 'challenge-left-rotation',
        rotation_enabled: true,
        rotation_step: 15,
      });
    });

    render(<SlideCaptcha fetcher={fetcher} onSuccess={onSuccess} />);

    await waitForCaptchaReady();
    const rotationSlider = screen.getByRole('slider', { name: 'Ajustar rotação' });
    fireEvent.change(rotationSlider, { target: { value: '-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar CAPTCHA' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('captcha-token');
    });

    const [, verifyInit] = fetcher.mock.calls[1];
    const payload = JSON.parse(verifyInit?.body as string);
    const lastMovement = payload.movements[payload.movements.length - 1];

    expect(payload.rotation).toBe(330);
    expect(lastMovement).toMatchObject({
      x: 0,
      y: 60,
      r: 330,
    });
  });

  it('calls onCancel from the modal controls when provided', async () => {
    const onCancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(challenge));

    render(<SlideCaptcha fetcher={fetcher} variant="modal" onCancel={onCancel} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fechar verificação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('renders only the captcha body in the inline variant', async () => {
    const onCancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(challenge));

    render(<SlideCaptcha fetcher={fetcher} onCancel={onCancel} />);

    expect(
      screen.queryByRole('heading', { name: 'Verificação de segurança' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fechar verificação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByAltText('Imagem do desafio CAPTCHA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar CAPTCHA' })).toBeInTheDocument();
  });

  it('applies color overrides as css variables', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(challenge));
    const { container } = render(
      <SlideCaptcha
        fetcher={fetcher}
        colors={{
          accent: '#facc15',
          background: '#10131a',
          backdrop: 'rgb(0 0 0 / 0.8)',
          border: '#293040',
          primary: '#14b8a6',
          primaryText: '#001a16',
          secondaryButtonBackground: '#18202d',
          text: '#f8fafc',
          track: '#334155',
        }}
      />,
    );

    const root = container.firstElementChild as HTMLElement;

    expect(root.style.getPropertyValue('--scaptcha-accent')).toBe('#facc15');
    expect(root.style.getPropertyValue('--scaptcha-bg')).toBe('#10131a');
    expect(root.style.getPropertyValue('--scaptcha-backdrop')).toBe('rgb(0 0 0 / 0.8)');
    expect(root.style.getPropertyValue('--scaptcha-border')).toBe('#293040');
    expect(root.style.getPropertyValue('--scaptcha-primary')).toBe('#14b8a6');
    expect(root.style.getPropertyValue('--scaptcha-primary-text')).toBe('#001a16');
    expect(root.style.getPropertyValue('--scaptcha-secondary-bg')).toBe('#18202d');
    expect(root.style.getPropertyValue('--scaptcha-text')).toBe('#f8fafc');
    expect(root.style.getPropertyValue('--scaptcha-track')).toBe('#334155');
    await screen.findByAltText('Imagem do desafio CAPTCHA');
  });

  it('can render as a light modal dialog', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(challenge));

    render(<SlideCaptcha fetcher={fetcher} theme="light" variant="modal" />);

    const dialog = screen.getByRole('dialog', { name: 'Verificação de segurança' });
    const root = dialog.parentElement;

    expect(root?.getAttribute('data-theme')).toBe('light');
    expect(root?.getAttribute('data-variant')).toBe('modal');
    await screen.findByAltText('Imagem do desafio CAPTCHA');
  });
});
