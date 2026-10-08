# Segurança

O masterStudy está em desenvolvimento. Ainda não há política de suporte por versões nem garantia de correções para versões antigas. Consulte os limites atuais no [README](README.md) antes de usar dados importantes.

## Relatar uma vulnerabilidade

Não publique tokens, dados pessoais ou detalhes exploráveis em uma issue pública. Quando o GitHub mostrar **Security → Report a vulnerability**, use esse canal privado. Ele depende da habilitação de private vulnerability reporting pelo mantenedor.

Se esse canal estiver indisponível, abra apenas uma solicitação para habilitá-lo, sem detalhes da falha. Não existe um e-mail de segurança declarado neste projeto.

No relato privado, inclua revisão/versão, plataforma, passos mínimos, impacto e uma reprodução com dados fictícios. Não há prazo de resposta prometido.

## Cuidados de desenvolvimento

- Nunca envie `.env`, perfis reais, SQLite pessoal, exports de usuários ou tokens.
- Toda variável `VITE_*` é pública no build do cliente; chaves administrativas pertencem ao servidor.
- Dados de teste e screenshots devem ser fictícios e livres de conteúdo protegido.
- Confira dependências de build e de runtime. `npm audit --omit=dev` sozinho não cobre todas as bibliotecas empacotadas pelo frontend.
- Relacione correções a commits e releases, sem anunciar uma proteção que não foi validada.

A ponte local de captura, a exportação parcial e a distribuição macOS sem notarização têm limites descritos no README. Documentar esses limites não elimina a necessidade de corrigi-los.
