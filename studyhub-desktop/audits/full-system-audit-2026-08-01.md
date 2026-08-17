# Auditoria completa — StudyHub / CampusFlow

Data: 1º de agosto de 2026  
Escopo: aplicação Web, Electron, sincronização Supabase, colaboração, arquivos, IA, qualidade, segurança e prontidão para SaaS.

## Veredito executivo

O produto já é um **beta funcional com bastante valor**, mas ainda **não está pronto para venda pública como SaaS pago**. O build e os testes atuais passam, porém a cobertura automatizada não representa os fluxos reais do usuário e ainda há riscos de perda/sumiço de conteúdo, permissões de compartilhamento inconsistentes, diferenças grandes entre Web e Electron e alguns erros confirmados em caminhos centrais.

A melhor decisão agora é interromper temporariamente a expansão de módulos e executar uma etapa de **estabilização do núcleo**: notas, tarefas, calendário, Pomodoro, arquivos, sincronização e compartilhamento.

## Evidências verificadas

- `npm test`: passou, sem falhas.
- `npm run build`: passou.
- E2E: existem somente **2 cenários**, ambos da autenticação sem login. Não há E2E autenticado para nota, tarefa, arquivo, calendário, sincronização, compartilhamento, IA ou Pomodoro.
- Build Web: há chunks muito grandes. WebLLM gera aproximadamente 6 MB minificados; o editor rico, cerca de 1,33 MB; a fonte Material Symbols, cerca de 3,96 MB.
- AppImage atual: aproximadamente 199 MB.
- Auditoria completa de dependências: encontrou vulnerabilidades transitivas no conjunto de empacotamento (`brace-expansion`, `fast-uri` e `tar`). Elas são ligadas principalmente ao processo de build do Electron, não ao código servido diretamente no navegador.
- A verificação visual atual com navegador automatizado não foi executada porque requer autorização explícita. Portanto, os achados visuais abaixo derivados do código precisam de uma segunda rodada com capturas atuais em desktop e mobile.

## O que está bom e deve ser preservado

- O Electron usa `contextIsolation`, sandbox, `nodeIntegration: false` e bloqueios de navegação/pop-ups.
- Há validação de caminhos e extensões em várias operações nativas.
- A implantação Web possui CSP, HSTS, bloqueio de iframe e cache adequado para assets versionados.
- Já existem migrações de estado, backup de revisões e merge de sincronização.
- O Supabase usa bucket privado e URLs assinadas no fluxo de Materiais.
- A IA acadêmica no desktop já possui uma base interessante: Ollama, fontes selecionadas, FTS5, escopo por matéria/semestre e citações.
- Há estilos globais de foco visível e preferência de redução de movimento.

## Bloqueadores P0

| Problema confirmado | Impacto | Correção recomendada |
|---|---|---|
| A barra superior chama `store.toggleTimer()` e usa `store.isPaused`, mas esses membros não existem no store atual do Pomodoro. | O botão pode lançar erro em tempo de execução e exibir estado incorreto. | Unificar a API do timer e adicionar teste de interação da barra. |
| O editor salva automaticamente após 1 segundo, embora a experiência pedida seja salvar somente ao clicar em **Salvar**. | “Descartar” volta apenas ao último autosave; histórico de versões perde utilidade; há risco de alteração não intencional. | Manter rascunho local no componente e persistir somente no comando Salvar; avisar sobre alterações pendentes ao sair. |
| Quando não há `activeNoteId`, o editor ainda pode usar `notesList[0]`, contrariando o comentário no próprio código. | Uma rota incompleta pode abrir/alterar a nota errada. | Exigir ID válido; mostrar estado “nota não encontrada” ou criar uma nova nota explicitamente. |
| Imagens coladas são gravadas em base64 dentro do HTML e do estado completo. Na sincronização, data URLs são removidas. | Estoura cota do `localStorage` e a imagem pode sumir em outro dispositivo. | Enviar imagens ao Storage, salvar apenas referência e usar URLs assinadas/cache local. |
| A busca global não abre corretamente a maioria dos resultados. Cursos não levam `courseId`; nota/tarefa/disciplina não definem o item ativo. | “Enter abrir” frequentemente leva só à seção, não ao conteúdo selecionado. | Padronizar cada resultado como `{screen, entityType, entityId, context}` e testar todos os tipos. |
| O calendário usa `studyItems` para gerar eventos, mas não o inclui nas dependências do `useMemo`. | Uma nota/aula criada pode não aparecer até outro estado mudar. | Incluir a dependência e estabilizar o `Set` de disciplinas visíveis com `useMemo`. |
| Datas são calculadas em vários fluxos com `toISOString().slice(0, 10)`. | Em UTC-3, depois das 21h um item pode ser considerado do dia seguinte. | Usar a função local já existente em todos os módulos e adicionar testes em fusos UTC-3/UTC+14. |
| O compartilhamento em tempo real completo existe essencialmente para notas; curso, disciplina, tarefa e projeto são importados como cópia. | A interface promete permissões e colaboração que não são realmente aplicadas. | Implementar entidades compartilhadas normalizadas com revisão/permissão ou renomear temporariamente para “Enviar uma cópia”. |
| Telas de tarefa e projeto permitem editar/excluir itens compartilhados sem aplicar consistentemente `reader/commenter/editor`. | Violação funcional de autorização e expectativa do usuário. | Bloquear ações na UI e, principalmente, nas RPC/RLS do servidor. |
| O timer e o áudio podem existir em mais de uma janela/renderizador. | Som duplicado e transições duplicadas entre foco/pausa, problema já percebido no uso. | Tornar o processo principal do Electron a autoridade do timer/áudio; na Web, usar eleição de líder entre abas. |
| A IA Web usa modelos pequenos sem orçamento robusto de contexto, streaming, cancelamento ou continuação. | Respostas fracas, truncadas e erro de janela de contexto. | Serviço único de IA, recuperação por trechos, orçamento de tokens e continuação baseada em `finish_reason`. |
| Há fallback de IA que pode produzir texto plausível sem evidência. | Pode apresentar conteúdo inventado como resposta acadêmica. | Nunca simular resposta de IA; informar indisponibilidade ou ausência de evidência. |

## Web x Electron: paridade real

| Recurso | Electron | Web | Situação |
|---|---|---|---|
| Conta e sincronização | Sim | Sim | Funciona, mas sincroniza um JSON completo e precisa de fila offline durável. |
| Notas e desenhos | Sim | Sim | Imagens incorporadas ainda não têm persistência multiplataforma segura. |
| Upload em Materiais | Arquivo local/Storage conforme fluxo | Supabase Storage | É o fluxo Web mais completo. |
| Anexo em nota | Seletor nativo | Sem fluxo Web equivalente completo | Corrigir. |
| Anexo em tarefa | Seletor nativo | Sem fluxo Web equivalente completo | Corrigir. |
| Arquivos de projetos | Seletor nativo | Sem fluxo Web equivalente completo | Corrigir. |
| Arquivo direto na disciplina | Nativo | Incompleto | Corrigir. |
| Leitor de arquivo local | Sim | Limitado pelo navegador | Exibir capability e usar upload/IndexedDB quando aplicável. |
| Ollama | Sim | Não deve ser prometido como confiável em site HTTPS | Na Web, oferecer WebLLM ou provedor remoto opcional. |
| WebLLM | Opcional | Sim, se WebGPU disponível | Detecção e UX de modelos precisam melhorar. |
| Atalhos globais | Sim | Não | Mostrar claramente que é recurso do desktop. |
| Janelas flutuantes/always-on-top | Sim | Não real fora da aba | Adaptar para Picture-in-Picture/document PiP quando suportado ou modo compacto interno. |

Recomendação: criar um serviço único `FileService` com três adaptadores — `ElectronLocal`, `SupabaseStorage` e `BrowserIndexedDB` — e nunca deixar um botão fechar sem informar por que o recurso não está disponível naquela plataforma.

## Dados, sincronização e risco de perda

Hoje o estado é mantido como um grande objeto Zustand, persistido no `localStorage`, duplicado em SQLite no Electron e enviado como um único JSON para `account_state` no Supabase. O SQLite apaga e reinsere as linhas normalizadas em toda gravação. A nuvem rejeita estados acima de aproximadamente 7,5 MB.

Isso funciona em perfil pequeno, mas não escala para um SaaS com muitos semestres, imagens, materiais e colaboração. Também aumenta o risco de sobrescrita e torna conflitos difíceis de resolver.

Correção estrutural recomendada:

1. Criar tabelas por entidade: notas, tarefas, disciplinas, cursos, aulas, projetos, decks e sessões.
2. Adotar `updated_at`, revisão, tombstone e operação idempotente por item.
3. Manter uma fila offline persistente em IndexedDB/SQLite com retry e backoff.
4. Exibir estado de sincronização por item: salvo localmente, enviando, sincronizado, conflito ou erro.
5. Manter o snapshot atual apenas como migração/backup temporário.
6. Fazer restore automático testado e oferecer lixeira/versionamento para conteúdo importante.

## Compartilhamento e colaboração

O modelo atual é uma boa prova de conceito, mas precisa ser esclarecido:

- Nota compartilhada: possui o fluxo mais próximo de colaboração real.
- Disciplina, curso, aula, tarefa e projeto: em grande parte são cópias importadas na conta do destinatário.
- Revogar um compartilhamento que virou cópia não remove nem marca consistentemente o conteúdo local.
- A UI de projeto e tarefa não respeita todas as permissões.
- Convites são exibidos dentro do app; não foi encontrado um envio transacional de e-mail completo.
- Convites pendentes podem receber payload textual antes da aceitação em algumas políticas; o ideal é expor somente metadados do convite até o aceite.

Antes de vender colaboração, escolher uma semântica por recurso:

- **Cópia:** destinatário recebe snapshot independente; sem “editor”.
- **Compartilhado ao vivo:** uma entidade canônica, permissões no servidor, histórico, revogação e atualizações em tempo real.

Para trabalhos em grupo, o próximo modelo correto é workspace com membros, papéis, comentários, menções, atividades, responsáveis e histórico — não duplicar o estado inteiro de cada conta.

## Arquivos

O fluxo Web em Materiais já envia para bucket privado. O restante da aplicação ainda apresenta paridade irregular. Também faltam:

- progresso e cancelamento de upload;
- limite e consumo de cota visíveis;
- validação de conteúdo por assinatura/magic bytes no servidor;
- thumbnails e estado de processamento;
- deduplicação por hash;
- limpeza confiável de objetos órfãos;
- política de retenção e exclusão de conta;
- varredura de malware quando o produto abrir upload para usuários externos.

O caminho local do computador pode continuar no Electron, mas nunca funciona como referência compartilhável na Web. Para sincronizar, o arquivo precisa ir ao Storage ou ficar explicitamente marcado como “somente neste computador”.

## IA

### Desktop

A base local é promissora e mantém privacidade. Deve receber:

- um serviço compartilhado entre editor, disciplina e chat;
- streaming e cancelamento consistentes;
- orçamento de contexto antes da chamada;
- continuação segura quando a resposta termina por limite;
- testes com PDF inválido, arquivo ausente e Ollama indisponível;
- tela de fontes realmente indexadas e botão para remover/reindexar.

### Web

Os modelos WebLLM atuais, Qwen 0.5B e Llama 1B, são leves, mas limitados para conteúdo acadêmico complexo. O produto precisa:

- mostrar somente modelos WebLLM compatíveis na Web e somente modelos Ollama no desktop;
- verificar contexto seguro, adaptador WebGPU, memória, espaço e compatibilidade, não apenas `navigator.gpu`;
- mostrar tamanho/download/cache e permitir cancelar/remover modelo;
- extrair texto de PDF/TXT/Markdown no navegador e buscar apenas trechos relevantes;
- não enviar todos os textos da disciplina para uma janela de 4096 tokens;
- fazer streaming, reconhecer truncamento e oferecer “continuar”;
- citar somente fontes cujo conteúdo foi realmente lido;
- remover respostas fictícias quando não há motor disponível.

## UX e produto

### Corrigir primeiro

- Unificar a marca: hoje aparecem StudyHub, CampusFlow e Silk Learning.
- Padronizar o idioma; Materiais ainda mistura português e inglês.
- Substituir `alert`, `prompt` e `confirm` nativos por diálogos consistentes.
- Validar rotas/`screen` desconhecidas e mostrar fallback em vez de área vazia.
- Diminuir a janela mínima principal de 1280×860 e testar 1366×768.
- Adicionar armadilha/restauração de foco nos modais.
- Oferecer alternativa por teclado no Kanban.
- Criar “Mais” na navegação mobile; hoje itens depois dos primeiros cinco podem ficar escondidos.
- Definir uma taxonomia única: Curso, Disciplina, Aula, Material, Nota e Arquivo.
- Criar onboarding orientado: semestre → disciplinas → horários → primeira tarefa/nota.

### Adições de alto valor depois da estabilização

- Central de notificações com preferências e horários silenciosos.
- Importação/exportação ICS e CSV.
- Revisão semanal automática: atrasos, provas, frequência, metas e plano seguinte.
- Lixeira e histórico de versões para todas as entidades críticas.
- Busca global que abre o objeto e busca dentro de PDFs/notas.
- PWA para captura rápida/offline no celular.
- Modelos ABNT/IEEE e relatórios técnicos.
- Integrações com calendário/Drive/LMS somente depois da consolidação do núcleo.

## Código e manutenção

Há concentração excessiva de responsabilidade:

- `AcademicSubjectScreenV2.jsx`: mais de 4 mil linhas.
- `LessonScreen.jsx`, `ImmersionScreen.jsx`, `NoteEditorScreen.jsx` e `useStore.js`: aproximadamente 2,4–2,9 mil linhas cada.
- `RichTextEditor.jsx`: cerca de 1,7 mil linhas e já foi foco de regressões de colagem, KaTeX e NodeView.
- `styles.css`: cerca de 6,7 mil linhas.
- Existem mais de 10 mil linhas em telas antigas aparentemente não utilizadas.
- `file-library.js` ainda é um stub planejado.

Recomendação: dividir por domínio e feature, criar stores/selectors menores, remover ou arquivar legado somente após testes de rota, e criar testes focados para o editor antes de novas extensões.

## Performance e distribuição

- Lazy-load WebLLM somente quando a IA for aberta.
- Lazy-load Mermaid/Monaco/PDF.js por recurso.
- Trocar a fonte completa Material Symbols por ícones usados ou SVGs da biblioteca adotada.
- Carregar apenas subconjuntos latinos e pesos necessários da Inter.
- Definir budget de bundle no CI.
- Assinar builds do desktop e implementar atualização automática, canal estável/beta e rollback.
- Produzir instaladores adequados (AppImage/DEB ou RPM e Windows instalado), não apenas portable.
- Revisar assets de áudio remotos para funcionamento offline e privacidade.

## Segurança, privacidade e operação SaaS

Antes de cobrança pública:

- executar testes RLS com duas contas e tentativas de acesso cruzado;
- revisar todas as RPCs e permissões no backend, não apenas esconder botões;
- adicionar rate limits, CAPTCHA e proteção contra abuso;
- configurar e-mail transacional de domínio próprio;
- implementar observabilidade de erros, métricas, uptime e alertas;
- criar painel mínimo de suporte/admin sem acesso indevido a conteúdo;
- documentar backup, restauração e resposta a incidentes;
- oferecer exportação e exclusão verificável dos dados;
- publicar Termos, Privacidade, retenção, subprocessadores e fluxo LGPD;
- revisar licenças de FFmpeg, modelos de IA, fontes, ícones e assets;
- fazer revisão externa de segurança antes do lançamento pago.

O código do cliente não pode guardar segredos. Toda regra de autorização crítica precisa existir em RLS/RPC/Edge Function, independentemente da interface.

## Plano recomendado

### Fase 1 — Estabilização P0

1. Corrigir Pomodoro/áudio entre janelas.
2. Tornar o Salvar das notas realmente manual e corrigir descarte/versões.
3. Migrar imagens e anexos de nota para Storage.
4. Corrigir data/fuso, calendário e busca global.
5. Aplicar permissões reais ou declarar compartilhamento como cópia.
6. Unificar seleção/upload/abertura de arquivos Web e Desktop.
7. Corrigir a IA Web para não truncar, misturar modelos ou inventar fallback.
8. Adicionar monitoramento de erros.

### Fase 2 — Confiabilidade automatizada

Criar E2E autenticado para:

- criar, salvar, reabrir, excluir e restaurar nota;
- colar/redimensionar imagem e verificar em outro navegador;
- tarefa/subtarefas/calendário/fuso;
- Pomodoro em app, widget e duas janelas;
- upload/download/exclusão e cota;
- sincronização offline/online e conflito;
- convite, aceite, reader/commenter/editor e revogação;
- AppImage com perfil limpo e migrado.

### Fase 3 — Escala e UX

Migrar sincronização para entidades, criar fila offline, refatorar hotspots, melhorar acessibilidade, responsividade, PWA, onboarding e otimização de bundles.

### Fase 4 — Comercialização

Adicionar site público, planos, cobrança, entitlements, quotas, trials, e-mail, analytics, suporte, documentação legal, operação e builds assinados.

## Critério de prontidão

O produto pode ser oferecido a um grupo controlado de beta testers depois da Fase 1. Para vender publicamente, as Fases 1 e 2 devem estar concluídas e a Fase 4 precisa cobrir pelo menos cobrança, quotas, observabilidade, suporte, privacidade/LGPD, segurança e recuperação de dados.

