# StudyHub no navegador

O StudyHub pode ser executado como site sem Electron.

## Desenvolvimento

```bash
npm run dev:web
```

Depois abra `http://127.0.0.1:5173` no navegador.

## Build e preview

```bash
npm run build
npm run preview:web
```

O conteúdo da pasta `dist/` pode ser publicado em qualquer hospedagem de
arquivos estáticos. Para produção, configure o servidor para redirecionar
rotas desconhecidas para `index.html`.

## Vercel

O projeto já inclui `vercel.json`. Na Vercel, importe o repositório e use as
variáveis de ambiente da produção:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
VITE_PUBLIC_APP_URL=https://seu-dominio.com
```

O build usa `npm run build` e publica a pasta `dist`. Não coloque a `service_role`
key do Supabase no frontend.

Antes da primeira publicação, aplique as migrações e publique a função de
exclusão descritas em `supabase/README.md`. Também inclua o domínio da Vercel
nas URLs permitidas do Supabase Auth; sem isso, confirmação de e-mail e
recuperação de senha apontarão para o endereço errado.

## O que muda no navegador

Os dados locais continuam persistidos pelo `localStorage` e a sincronização
com Supabase continua disponível quando configurada. As funções específicas do
Electron são detectadas automaticamente e não quebram a aplicação web:

- atalhos globais do sistema;
- janelas separadas e widget do Pomodoro sempre visível;
- abrir arquivos por caminho local e selecionar pastas/arquivos pelo sistema;
- Ollama local, laboratório de código e recursos nativos de leitura/voz.

Quando possível, o app usa o equivalente web, como links externos, upload do
navegador e a tela normal do Pomodoro. Recursos que dependem de arquivos locais
ou de serviços instalados no computador devem ser usados no aplicativo Desktop.
