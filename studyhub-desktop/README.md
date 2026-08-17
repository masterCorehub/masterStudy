# StudyHub

Aplicação acadêmica para web e desktop com disciplinas, calendário, tarefas,
notas, materiais, projetos, flashcards, Pomodoro, IA local e sincronização por
conta.

## Desenvolvimento

```bash
npm install
npm run dev:web
```

Para Electron:

```bash
npm run dev
```

Copie `.env.example` para `.env` e preencha somente as credenciais públicas do
Supabase. As instruções do backend estão em `supabase/README.md`.

## Qualidade

```bash
npm test
npm run build
npm run test:e2e
npm run test:packaged
npm run audit:prod
```

O teste E2E usa o build em `dist/` sem publicar dados nem abrir um servidor. O
teste empacotado abre `release/linux-unpacked/studyhub-desktop` em um perfil
temporário; também é possível validar o AppImage explicitamente:

```bash
npm run test:packaged -- release/StudyHub-1.1.2-x86_64.AppImage
```

## Distribuição

```bash
npm run dist:linux
npm run dist:win
```

O site usa o mesmo frontend e pode ser publicado pela Vercel conforme
`WEB.md`. Recursos nativos — atalhos globais, widget sempre visível, caminhos
locais, Ollama e laboratório local — ficam disponíveis apenas no Electron.
