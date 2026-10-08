# Como contribuir

O pacote ativo está em `studyhub-desktop/`. Leia seu `AGENTS.md` e as instruções do [README](README.md).

## Preparar o ambiente

Use Node.js 24 e npm. A camada desktop utiliza `node:sqlite`; a versão do runtime é parte do contrato do projeto.

```bash
cd studyhub-desktop
npm ci
cp .env.example .env
```

Preencha apenas as chaves públicas indicadas no exemplo. Variáveis `VITE_*` ficam disponíveis no cliente. Nunca use `service_role`, tokens privados ou dados pessoais em fixtures.

## Fluxo de trabalho

1. Abra uma issue com problema e critério de conclusão, ou escolha uma existente.
2. Crie uma branch curta, como `codex/fix-reader-resume`. Confira `git status` antes de editar e preserve mudanças de outras tarefas.
3. Faça uma mudança com escopo claro. Regras de dados reutilizáveis vão em `src/domain/`; integrações em `src/services/` ou `electron/`.
4. Execute as verificações aplicáveis e atualize a documentação afetada.
5. Abra um pull request explicando problema, resultado, testes e limites. Para mudanças visuais, anexe evidência com dados fictícios.
6. Só faça merge após revisar o diff e as verificações. Configure a proteção de `main` no GitHub quando o plano e a visibilidade permitirem.

## Verificação

```bash
npm test
npm run build
npm run test:e2e
```

`npm ci` instala o lockfile sem recalcular versões. Os testes E2E precisam de Chromium: `npx playwright install chromium`. Testes com fixtures não comprovam Supabase real ou comportamento nativo. Valide o pacote na plataforma afetada quando alterar Electron ou pontes de sistema.

Use commits descritivos, como `fix: preserva posição de leitura ao reabrir`. Evite misturar ajuste visual, migração e dependências sem relação na mesma revisão.

## Segurança e suporte

Para problemas de segurança, siga [SECURITY.md](SECURITY.md). Nas issues comuns, remova chaves, caminhos privados, livros protegidos e conteúdo pessoal das capturas.

## Licença

A licença de reutilização ainda não foi definida. A visibilidade pública não é uma concessão automática de licença. A decisão deve ser registrada pelo mantenedor antes de distribuir o projeto como software de código aberto.
