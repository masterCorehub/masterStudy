# Recuperação de senha na versão publicada

O destino da recuperação é configurado por `VITE_PUBLIC_APP_URL`. O Vite inclui essa variável no build; alterar o `.env` exige gerar novamente o aplicativo.

1. No Supabase, em **Authentication → URL Configuration**, configure **Site URL** como `https://studyhub-desktop.vercel.app`.
2. Em **Redirect URLs**, autorize `https://studyhub-desktop.vercel.app/?auth=recovery` (e `https://studyhub-desktop.vercel.app/?auth=confirmed` para confirmação de cadastro).
3. Na Vercel, configure `VITE_PUBLIC_APP_URL=https://studyhub-desktop.vercel.app` no ambiente de produção e faça um novo deploy.
4. No build local para Mac, use a mesma variável no `.env` e gere novamente o aplicativo.
5. Solicite um novo e-mail de recuperação. A página web deve mostrar o formulário de nova senha.

A versão instalada usa o Site URL do Supabase quando não há URL pública configurada. Um Site URL ainda apontando para localhost causa o redirecionamento observado. O protocolo desktop `campusflow://` atualmente não implementa o retorno de autenticação.

Documentação: https://supabase.com/docs/guides/auth/redirect-urls

## Correção do fluxo entre Mac e navegador

O login normal mantém PKCE. O pedido de recuperação usa um cliente separado em modo implicit, sem persistência de sessão ou leitura automática da URL. Assim, abrir o e-mail em outro navegador não exige o verificador PKCE armazenado no aplicativo.

O cliente que recebe o retorno identifica tokens no fragmento e processa esse callback no modo correspondente. Metadados de recuperação são capturados antes do SDK limpar o fragmento; o App também trata `PASSWORD_RECOVERY` e sai do modo de recuperação após a atualização.

A versão web precisa receber este código em um novo deploy, além da configuração do Supabase. Solicite um e-mail novo na versão atualizada; e-mails antigos ainda podem carregar o fluxo anterior.

Cobertura automatizada: retorno em navegador limpo sem verificador PKCE, atualização de senha e abertura de Hoje, link expirado com opção de reenviar, link sem sessão impedindo atualização e pedido de e-mail sem desafio PKCE. APIs e credenciais dos testes são fictícias.
