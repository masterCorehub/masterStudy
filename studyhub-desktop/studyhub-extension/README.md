# masterStudy Companion — Capturas

Extensão para Chrome, Edge e Brave. Salva páginas, textos selecionados e conteúdos extraídos no Hub do masterStudy Desktop, pela ponte local `127.0.0.1:47820`.

## Instalação

1. Abra `chrome://extensions` (ou a página de extensões do Edge/Brave).
2. Ative **Modo do desenvolvedor**.
3. Escolha **Carregar sem compactação** e selecione esta pasta `studyhub-extension`.
4. Abra o masterStudy Desktop e use o painel da extensão para salvar o conteúdo.

Se já instalou uma versão anterior, clique em **Atualizar/Recarregar** na página de extensões para aplicar esta versão e autorizar a permissão de alarmes.

## Entrega e conteúdos

O painel captura URL, título, texto e metadados disponíveis. Extrações de vídeos dependem dos dados disponibilizados pela página. Se o aplicativo estiver fechado, a captura fica no armazenamento local da extensão. Novas tentativas acontecem ao abrir a extensão, enviar outra captura e a cada minuto. O ID original é preservado para evitar duplicação.

O desktop mantém sua própria fila em disco e só remove uma entrega quando a interface confirma o armazenamento no Hub. O Hub oferece filtros por origem e tags e grupos por data.

## Limites

A versão web não oferece a ponte local do desktop. Não há validação de instalação real para esta versão no Firefox; seu manifesto usa service worker do Chrome. Os testes automatizados validam o reenvio com rede simulada. Confirme a instalação no navegador, selecione um texto, salve e verifique o conteúdo no Hub antes de depender da extensão para seu fluxo diário.

## Ações sob demanda

Abrir o painel não gera resumo nem chama IA. O painel oferece resumo, perguntas,
transcrição disponível de vídeos, tags manuais ou sugeridas por IA e uma pasta de
conteúdos. O conteúdo original pode ser salvo sem gerar nada.

As ações de IA requerem o masterStudy Desktop atualizado e aberto, com Ollama ou
Gemini configurado em Configurações. A extensão usa o provedor do app pela ponte
local; não guarda chaves. Falhas são exibidas sem substituir a resposta por um
texto simulado. Transcrições dependem da disponibilidade de legendas na página.

No Hub, use Organizar com IA para revisar e editar os tópicos antes de aplicar.
As pastas aparecem como filtro. Os conteúdos podem ser excluídos pela lista
lateral e seguem para a lixeira do app. Recarregue a extensão em
chrome://extensions após atualizar os arquivos.
