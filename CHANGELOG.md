# Changelog

## 0.2.0 — 2026-10-12

- Require form-bound CAPTCHA snapshots; invalidate stale operations and preserve exact JSON values.
- Coordinate with Laravel Slide CAPTCHA 0.3.0 and the other SDK releases.

## 0.1.10

- Propaga `AbortSignal` ao carregar e verificar desafios e cancela operações
  obsoletas no hook React.
- Documenta o proxy same-origin de imagens temporárias usado pela integração
  com `@codedartdev/coinsentry-next`.
