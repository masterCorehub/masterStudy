# Verificação de Ollama e Gemini — 2026-10-06

## Resultado atual

- Ollama: endpoint real `http://127.0.0.1:11434` indisponível, inclusive fora do sandbox. O executável não foi encontrado no PATH, em `/usr/local/bin/ollama` ou `/opt/homebrew/bin/ollama`; `/Applications/Ollama.app` não existe.
- A configuração encontrada em `StudyHub-development/ai-provider.json` seleciona Ollama, usa `gemini-3.6-flash` e não contém chave Gemini criptografada. Valores secretos não foram exibidos.
- Aplicativo Mac gerado: a ponte `window.studyhubDesktop.academicAI` está presente e os métodos IPC funcionam. Usando perfil temporário, o chat informa serviço Ollama indisponível ou chave Gemini ausente, conforme o provedor.
- Gemini real: sem chave disponível, não foi possível validar geração, quota ou permissão no Google. O modelo padrão está listado na documentação oficial.

## Testes realizados

1. Chamada real de status Ollama, sem geração pois não há serviço/modelo disponível.
2. Inicialização do aplicativo Mac gerado com perfil temporário, seguida de chamadas reais de configuração, status e chat via IPC. Perfil encerrado e removido.
3. Nove verificações com respostas simuladas no serviço de provedores: resposta Ollama, adaptação Gemma, configuração Gemini, proteção da chave na resposta pública, seleção do modelo Gemini, instrução de sistema/roles/JSON, propagação de erro de quota, restauração de configuração quando o teste falha e erro de chave ausente. Nenhuma chamada real ao Google.
4. Reprodução isolada do erro de início Ollama sem executável: `spawn ollama ENOENT`, com evento `error` sem tratamento.

## Problemas encontrados

- `startOllama()` não registra um listener para o evento assíncrono `error` do processo filho. O `try/catch` não captura esse evento; clicar em iniciar sem executável pode encerrar o processo principal. O Diário também tenta iniciar Ollama automaticamente se o status do provedor estiver indisponível, inclusive quando Gemini está selecionado sem chave.
- O estado Gemini disponível significa apenas chave presente e descriptografável. O teste de conexão é necessário para confirmar validade, acesso ao modelo e quota.
- Configuração central Gemini depende da ponte Electron. Na versão web, os botões salvar/testar chamam essa ponte inexistente. Diário usa WebLLM no navegador; disciplinas têm fallback direto ao Ollama.
- Capturas/Hub usa `localAiEngine.js`, que consulta Ollama diretamente e ignora a seleção central Gemini.
- O endpoint editável da disciplina não é encaminhado ao serviço desktop: este usa `127.0.0.1:11434` fixo.

## Para ativar

Ollama requer instalação, serviço em execução e pelo menos um modelo baixado. Gemini requer chave do Google AI Studio em Configurações → IA, salvar provedor e testar conexão. Não inserir a chave em código, documentos ou mensagens.

Fontes: https://docs.ollama.com/quickstart e https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash
