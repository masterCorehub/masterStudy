# masterStudy na web

O app web utiliza a interface React compilada pelo Vite. O Electron não é necessário para publicar essa versão.

## Desenvolvimento e build

Na pasta `studyhub-desktop`, com Node.js 24 e dependências instaladas:

```bash
npm run dev:web
npm run build
npm run preview:web
```

O build gera `dist/`. Recursos de sistema, janelas flutuantes e algumas ferramentas locais exigem o desktop.

## Vercel

Importe `masterCorehub/masterStudy` e defina **Root Directory: studyhub-desktop**. O `vercel.json` configura `npm run build`, saída `dist/`, cabeçalhos e rotas. O projeto também possui uma função em `api/`, por isso a publicação completa usa esse diretório, não só os arquivos estáticos.

Configure as variáveis públicas:

```dotenv
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
VITE_PUBLIC_APP_URL=https://seu-dominio.example
```

Nunca coloque credenciais administrativas em `VITE_*`; esses valores entram no cliente. O endereço atual do app é `https://master-study-three.vercel.app/`.

Siga [supabase/README.md](supabase/README.md) para migrações, permissões e função de exclusão de conta. Inclua o domínio público e os destinos de confirmação/recuperação nas URLs autorizadas do serviço de autenticação.

Depois de renomear o repositório, confira se a integração Git da Vercel aponta para `masterStudy`. Valide o deployment correspondente ao commit, cadastro, entrada, recuperação e persistência antes de anunciar a atualização do app publicado.
