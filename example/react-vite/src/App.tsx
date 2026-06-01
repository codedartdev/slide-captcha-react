import { SlideCaptcha } from '@codedart/slide-captcha-react';
import { useForm } from 'react-hook-form';

type LoginFormValues = {
  email: string;
  password: string;
  slide_captcha_token: string;
};

const csrfToken =
  document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || undefined;

export function App() {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      password: '',
      slide_captcha_token: '',
    },
  });

  async function onSubmit(values: LoginFormValues) {
    clearErrors('root');

    const response = await fetch('/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
      },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setError('root', {
        message: 'Não foi possível enviar o login. Confira os dados e tente novamente.',
      });
      return;
    }

    setError('root', {
      type: 'success',
      message: 'Login enviado com sucesso.',
    });
  }

  return (
    <main className="app-shell">
      <form className="login-form" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <h1>Login</h1>
          <p>Resolva o CAPTCHA antes de enviar suas credenciais.</p>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            {...register('email', { required: 'Informe seu email.' })}
          />
          {errors.email ? <span className="field-error">{errors.email.message}</span> : null}
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            {...register('password', { required: 'Informe sua senha.' })}
          />
          {errors.password ? <span className="field-error">{errors.password.message}</span> : null}
        </label>

        <input
          type="hidden"
          {...register('slide_captcha_token', {
            required: 'Resolva o CAPTCHA para continuar.',
          })}
        />

        <SlideCaptcha
          baseUrl={import.meta.env.VITE_API_BASE_URL}
          csrfToken={csrfToken}
          onSuccess={(token) => {
            setValue('slide_captcha_token', token, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            });
            clearErrors('slide_captcha_token');
          }}
          onError={() => {
            setValue('slide_captcha_token', '', {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            });
          }}
          onRefresh={() => {
            setValue('slide_captcha_token', '', {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            });
          }}
        />

        {errors.slide_captcha_token ? (
          <p className="field-error">{errors.slide_captcha_token.message}</p>
        ) : null}

        {errors.root ? (
          <p className={errors.root.type === 'success' ? 'form-success' : 'field-error'}>
            {errors.root.message}
          </p>
        ) : null}

        <button className="submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enviando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
