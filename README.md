# @codedartdev/slide-captcha-react

Pacote React + TypeScript para consumir o Laravel Slide CAPTCHA em aplicações web modernas. Ele não inclui backend próprio: o pacote apenas conversa com os endpoints já existentes do Laravel.

Endpoints esperados:

- `GET /slide-captcha/new`
- `POST /slide-captcha/verify`

## Instalação

```bash
npm install @codedartdev/slide-captcha-react
```

Importe também o CSS padrão:

```tsx
import '@codedartdev/slide-captcha-react/styles.css';
```

## Uso básico

```tsx
import { SlideCaptcha } from '@codedartdev/slide-captcha-react';
import '@codedartdev/slide-captcha-react/styles.css';

export function LoginCaptcha() {
  return (
    <SlideCaptcha
      baseUrl={import.meta.env.VITE_API_BASE_URL}
      csrfToken={document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content}
      onSuccess={(token) => {
        console.log('Token do CAPTCHA:', token);
      }}
      onError={(error) => {
        console.error(error.code, error.message);
      }}
    />
  );
}
```

`baseUrl` é opcional. Se omitido, o pacote chama `/slide-captcha/new` e `/slide-captcha/verify` no mesmo host da aplicação.

## Laravel e Laravel Vite

Em uma view Blade, exponha o CSRF token:

```blade
<meta name="csrf-token" content="{{ csrf_token() }}">
```

No frontend:

```tsx
const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;

<SlideCaptcha baseUrl={import.meta.env.VITE_API_BASE_URL} csrfToken={csrfToken} />;
```

Se sua API estiver no mesmo domínio do app Laravel, `baseUrl` pode ficar vazio. Se estiver em outro host, configure no `.env` do Vite:

```env
VITE_API_BASE_URL=https://api.example.com
```

## react-hook-form

O exemplo completo está em `example/react-vite`.

```tsx
import { SlideCaptcha } from '@codedartdev/slide-captcha-react';
import { useForm } from 'react-hook-form';

type LoginForm = {
  email: string;
  password: string;
  slide_captcha_token: string;
};

export function LoginForm() {
  const { register, handleSubmit, setValue, clearErrors, formState } = useForm<LoginForm>({
    defaultValues: { email: '', password: '', slide_captcha_token: '' },
  });

  async function onSubmit(values: LoginForm) {
    await fetch('/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email', { required: 'Informe seu email.' })} />
      <input type="password" {...register('password', { required: 'Informe sua senha.' })} />
      <input
        type="hidden"
        {...register('slide_captcha_token', {
          required: 'Resolva o CAPTCHA para continuar.',
        })}
      />

      <SlideCaptcha
        baseUrl={import.meta.env.VITE_API_BASE_URL}
        onSuccess={(token) => {
          setValue('slide_captcha_token', token, { shouldValidate: true });
          clearErrors('slide_captcha_token');
        }}
        onError={() => {
          setValue('slide_captcha_token', '', { shouldValidate: true });
        }}
      />

      {formState.errors.slide_captcha_token ? (
        <p>{formState.errors.slide_captcha_token.message}</p>
      ) : null}

      <button type="submit">Entrar</button>
    </form>
  );
}
```

## Client HTTP

Também é possível usar apenas o client interno:

```ts
import { createSlideCaptchaClient } from '@codedartdev/slide-captcha-react';

const client = createSlideCaptchaClient({
  baseUrl: 'https://api.example.com',
  csrfToken: 'csrf-token',
  headers: {
    'X-App': 'frontend',
  },
});

const challenge = await client.getChallenge();
const result = await client.verifyChallenge({
  challenge_id: challenge.challenge_id,
  x: 120,
  y: 40,
  rotation: 0,
  movements: [{ x: 120, y: 40, r: 0, t: 300 }],
});
```

Opções disponíveis:

- `baseUrl`: prefixo dos endpoints.
- `headers`: objeto, `Headers` ou função que retorna headers.
- `csrfToken`: enviado por padrão como `X-CSRF-TOKEN`.
- `csrfHeaderName`: altera o nome do header CSRF.
- `fetcher`: implementação customizada de `fetch`.
- `credentials`: padrão `same-origin`.
- `challengePath` e `verifyPath`: caminhos customizados se sua aplicação não usa os padrões.

## Erros

Erros são normalizados como `SlideCaptchaError`:

```ts
import { isSlideCaptchaError } from '@codedartdev/slide-captcha-react';

function handleError(error: unknown) {
  if (isSlideCaptchaError(error)) {
    console.log(error.code, error.status, error.reason, error.message);
  }
}
```

Códigos principais:

- `network_error`
- `invalid_json`
- `invalid_response`
- `backend_error`
- `verification_failed`
- `configuration_error`

## Customização visual

Use `className` e sobrescreva as variáveis CSS:

```css
.meu-captcha {
  --scaptcha-primary: #0f766e;
  --scaptcha-border: #cbd5e1;
}
```

```tsx
<SlideCaptcha className="meu-captcha" />
```

Também é possível customizar as cores diretamente pelo componente com `colors`. Os valores aceitam qualquer cor CSS válida; os campos de sombra aceitam valores de `box-shadow`:

```tsx
<SlideCaptcha
  variant="modal"
  colors={{
    background: '#10131a',
    backdrop: 'rgb(0 0 0 / 0.72)',
    border: 'rgb(255 255 255 / 0.12)',
    primary: '#14b8a6',
    primaryHover: '#2dd4bf',
    primaryText: '#001a16',
    text: '#f8fafc',
    mutedText: '#94a3b8',
    accent: '#facc15',
    track: '#334155',
  }}
/>
```

Escolha o tema com `theme="dark"` ou `theme="light"`. O padrão é `dark`:

```tsx
<SlideCaptcha theme="light" />
```

Escolha a apresentação com `variant="inline"` ou `variant="modal"`. O padrão é `inline`, que renderiza apenas o corpo funcional do CAPTCHA:

```tsx
<SlideCaptcha variant="inline" />
```

Para usar a experiência completa de modal, combine `variant="modal"` com `onCancel` para exibir cabeçalho, fechar e cancelar:

```tsx
<SlideCaptcha variant="modal" theme="dark" onCancel={() => setCaptchaOpen(false)} />
```

Chaves disponíveis em `colors` e suas variáveis CSS equivalentes:

| `colors`                         | Variável CSS                        | Elemento                          |
| -------------------------------- | ----------------------------------- | --------------------------------- |
| `accent`                         | `--scaptcha-accent`                 | Barra superior do modal           |
| `background`                     | `--scaptcha-bg`                     | Fundo do painel                   |
| `backdrop`                       | `--scaptcha-backdrop`               | Fundo externo do modal            |
| `badgeBackground`                | `--scaptcha-badge-bg`               | Fundo do badge do header          |
| `badgeBorder`                    | `--scaptcha-badge-border`           | Borda do badge do header          |
| `border`                         | `--scaptcha-border`                 | Bordas gerais                     |
| `borderStrong`                   | `--scaptcha-border-strong`          | Bordas de controles destacados    |
| `danger`                         | `--scaptcha-danger`                 | Texto de erro                     |
| `dangerBackground`               | `--scaptcha-danger-bg`              | Fundo de erro                     |
| `dangerBorder`                   | `--scaptcha-danger-border`          | Borda de erro                     |
| `divider`                        | `--scaptcha-divider`                | Divisores internos                |
| `focus`                          | `--scaptcha-focus`                  | Contorno de foco                  |
| `iconHoverBackground`            | `--scaptcha-icon-hover-bg`          | Hover de botões de ícone          |
| `mutedText`                      | `--scaptcha-muted`                  | Texto secundário                  |
| `panelShadow`                    | `--scaptcha-panel-shadow`           | Sombra do painel                  |
| `panelSoftBackground`            | `--scaptcha-panel-soft`             | Fundo do controle de rotação      |
| `pieceBorder`                    | `--scaptcha-piece-border`           | Borda da peça                     |
| `pieceShadow`                    | `--scaptcha-piece-shadow`           | Sombra da peça                    |
| `primary`                        | `--scaptcha-primary`                | Botão principal e destaque        |
| `primaryHover`                   | `--scaptcha-primary-hover`          | Hover do botão principal          |
| `primaryText`                    | `--scaptcha-primary-text`           | Texto do botão principal          |
| `rotationDivider`                | `--scaptcha-rotation-divider`       | Divisor dos ícones de rotação     |
| `rotationIcon`                   | `--scaptcha-rotation-icon`          | Ícones de rotação                 |
| `rotationThumbShadow`            | `--scaptcha-rotation-thumb-shadow`  | Brilho do marcador do slider      |
| `secondaryButtonBackground`      | `--scaptcha-secondary-bg`           | Fundo do botão secundário         |
| `secondaryButtonHoverBackground` | `--scaptcha-secondary-hover-bg`     | Hover do botão secundário         |
| `secondaryButtonHoverBorder`     | `--scaptcha-secondary-hover-border` | Borda hover do botão secundário   |
| `softText`                       | `--scaptcha-soft`                   | Texto de controles secundários    |
| `stageBackground`                | `--scaptcha-stage-bg`               | Fundo da área da imagem           |
| `subtleText`                     | `--scaptcha-subtle`                 | Texto discreto, status e cancelar |
| `success`                        | `--scaptcha-success`                | Estado resolvido                  |
| `successRing`                    | `--scaptcha-success-ring`           | Destaque da peça resolvida        |
| `text`                           | `--scaptcha-text`                   | Texto principal                   |
| `track`                          | `--scaptcha-track`                  | Trilha do slider                  |

## Scripts

```bash
npm run build
npm run test
npm run lint
npm run typecheck
npm run format
npm run deploy
```

Para rodar o exemplo:

```bash
npm install
npm run dev --workspace @codedartdev/slide-captcha-react-example
```

## Publicação no npm

O deploy gerencia o versionamento automaticamente. Por padrão, ele incrementa `patch`, roda as validações, gera o build, publica no npm e faz push do commit/tag criado pelo `npm version`.

```bash
npm run deploy
```

Outros incrementos:

```bash
npm run deploy -- minor
npm run deploy -- major
npm run deploy -- 1.2.3
npm run deploy -- prerelease --preid beta
```

O script `deploy` exige a árvore Git limpa, roda lint, typecheck, testes e build, executa `npm version`, publica com `npm publish --access public` e envia o commit/tag com `git push --follow-tags`.

O pacote publicado usa somente a build compilada em `dist`. Os campos `main`, `module`, `types` e `exports` apontam para arquivos dentro de `dist`, e a lista `files` publica apenas `dist`, `README.md` e `LICENSE`.

O script `prepack` executa `npm run build` automaticamente antes de `npm pack` e `npm publish`, garantindo que o tarball contenha a build atualizada. O pacote não usa `postinstall`, porque instalar dependências não deve executar build no ambiente do consumidor; isso evita problemas de segurança, compatibilidade com CI, instalações offline e experiência de instalação.

O diretório `src` permanece no repositório como referência técnica e base de desenvolvimento, mas não entra no pacote publicado.
