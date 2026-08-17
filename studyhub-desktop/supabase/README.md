# Backend Supabase do StudyHub

O frontend usa somente a URL pública e a chave `publishable`/`anon`. Nunca
adicione a `service_role` ao `.env`, à Vercel ou ao aplicativo Electron.

## Publicação inicial

1. Crie um projeto no Supabase.
2. Vincule a CLI ao projeto e aplique as migrações, nesta ordem:

   ```bash
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

   Se usar o SQL Editor, execute uma única vez os arquivos de
   `migrations/001_...sql` até `005_...sql`, respeitando a ordem numérica.
3. Publique a função de exclusão de conta:

   ```bash
   supabase functions deploy delete-account
   ```

4. Em **Authentication > URL Configuration**, configure a URL do site e os
   redirecionamentos permitidos, incluindo:

   - `https://SEU_DOMINIO/?auth=confirmed`
   - `https://SEU_DOMINIO/?auth=recovery`
   - `http://127.0.0.1:5173/**` apenas para desenvolvimento
5. Antes de abrir cadastros ao público, configure SMTP próprio, limite de
   envio, proteção contra abuso/CAPTCHA e os modelos de confirmação e
   recuperação de senha.

## O que as migrações entregam

- estado privado por conta, revisão otimista e até 30 snapshots recuperáveis;
- RLS por usuário em todas as tabelas;
- convites por item, sem expor o workspace inteiro;
- notas, disciplinas, tarefas, projetos, cursos e aulas compartilháveis;
- bucket privado `studyhub-files`, links temporários e arquivos de até 50 MB;
- eventos Realtime para estado da conta e convites;
- edição online de notas compartilhadas e comentários atribuídos em tempo real;
- remoção da conta por função protegida no servidor.

## Verificação mínima

Depois da publicação, crie duas contas de teste e confirme:

1. uma conta não consegue consultar `account_state` da outra;
2. convite pendente mostra somente o item convidado;
3. recusar ou revogar remove o acesso ao arquivo privado;
4. um leitor não atualiza `shared_entities`, mas um editor aceito consegue;
5. excluir a conta remove login, linhas e objetos privados.

Use projetos separados de desenvolvimento e produção. Faça backup do banco
antes de aplicar novas migrações em produção.
