# Checklist de lançamento SaaS

## Implementado no código

- conta obrigatória quando o backend está configurado;
- sincronização automática com controle de revisão e histórico recuperável;
- arquivos em bucket privado, limite de 50 MB e URLs temporárias;
- convites isolados por item e conteúdo recebido na seção correspondente;
- exclusão de conta pelo servidor;
- sanitização de HTML/SVG, CSP web e isolamento do Electron;
- testes unitários, smoke test Chromium, abertura automatizada do AppImage em
  perfil limpo e CI;
- dependências de execução sem vulnerabilidades conhecidas no `npm audit`.

## Obrigatório antes de cobrar usuários

- aplicar e validar as cinco migrações em um projeto Supabase de produção;
- publicar e testar a função `delete-account`;
- configurar domínio, SMTP transacional, CAPTCHA e limites contra abuso;
- definir planos, cobrança, webhooks, entitlements e política de reembolso;
- publicar Termos de Uso, Política de Privacidade/LGPD e canal de suporte;
- configurar monitoramento de erros, disponibilidade, backups e alertas de
  consumo do banco/storage;
- executar teste de autorização com duas contas reais e revisão externa de
  segurança;
- decidir a distribuição/licença do `ffmpeg-static` antes de vender o desktop;
- assinar instaladores e definir atualização automática segura.

Enquanto os itens externos acima não forem concluídos, o produto deve ser
tratado como beta privado, não como SaaS pronto para venda pública.
