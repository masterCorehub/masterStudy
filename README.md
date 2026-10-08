<p align="center"><img src="branding/logo.svg" width="104" alt="Logo do masterStudy: livro aberto"></p>

<h1 align="center">masterStudy</h1>

<p align="center">Organize sua rotina. Conecte suas ideias. Continue aprendendo.</p>

<p align="center"><a href="https://studyhub-desktop.vercel.app/">Acessar o app</a> · <a href="https://github.com/alexandre-wayss/masterStudy/releases">Releases</a> · <a href="https://github.com/alexandre-wayss/masterStudy/issues">Reportar um problema</a></p>

O **masterStudy** é um aplicativo de organização acadêmica e estudo para web e desktop. Ele reúne disciplinas, tarefas, livros, notas e revisões em um ambiente que acompanha o caminho entre planejar e aprender.

Projeto mantido por [Alexandre Wayss](https://github.com/alexandre-wayss), desenvolvido e evoluído com apoio de ferramentas de IA. A proposta é um produto utilizável e um projeto para demonstrar decisões, implementação e manutenção de software.

## Funcionalidades

| Área | O que você pode fazer |
| --- | --- |
| Hoje | Conferir tarefas do dia, agenda, hábitos, hidratação e notas fixadas |
| Cursos e disciplinas | Organizar matérias, aulas, avaliações e materiais de estudo |
| Agenda e tarefas | Acompanhar compromissos, prazos, subtarefas e entregas |
| Estúdio de Estudo | Manter conversas por assunto e usar fontes e ferramentas de IA |
| Biblioteca e leitor | Importar PDF/EPUB, ler, grifar, anotar e retomar o progresso |
| Notas | Organizar por pastas e tags, relacionar ideias e explorar conexões |
| Revisões | Praticar com flashcards e acompanhar revisões |
| Diário e Sticky Notes | Registrar reflexões, ideias rápidas e lembretes |
| Capturas & Hub | Guardar textos e referências encontrados durante a pesquisa |
| Personalização | Escolher temas e organizar menu e visão do dia |

Há recursos auxiliares para aulas, mídia, idiomas, programação, tradução e reconhecimento de texto. A disponibilidade depende da plataforma e da configuração.

## Fluxo de uso

**Planejar → reunir materiais → estudar → anotar → revisar.**

Para preparar uma prova, organize a disciplina e o prazo, reúna os materiais, estude um capítulo, registre sua explicação e pratique com perguntas de revisão. Você escolhe e confirma cada ação; não precisa usar todas as áreas nem seguir uma sequência fixa.

Comece com **uma tarefa, um material e uma nota**. O app web usa conta; não há credenciais públicas de demonstração neste repositório.

## Web e desktop

[Acesse a versão web](https://studyhub-desktop.vercel.app/) pelo navegador. O desktop acrescenta integração com o sistema, como janelas flutuantes, acesso a arquivos e ferramentas locais.

Instaladores estarão em [Releases](https://github.com/alexandre-wayss/masterStudy/releases) quando disponibilizados. O projeto possui alvos de empacotamento para macOS, Windows e Linux, mas isso não comprova uma release validada em todos eles. Pacotes macOS locais usam assinatura ad-hoc e não equivalem a distribuição notarizada pela Apple.

## Executar localmente

Use **Node.js 24**, npm e Git. Execute os comandos no pacote da aplicação:

```bash
git clone https://github.com/alexandre-wayss/masterStudy.git
cd masterStudy/studyhub-desktop
npm ci
cp .env.example .env
```

Preencha o `.env` com a URL do seu projeto Supabase, a chave pública de cliente e o endereço público do app, conforme o exemplo. Nunca use uma chave administrativa em variáveis `VITE_*`. Veja [configuração do Supabase](studyhub-desktop/supabase/README.md) e [deploy web](studyhub-desktop/WEB.md).

```bash
npm run dev:web # Interface no navegador.
npm run dev     # Aplicativo desktop com Electron.
```

## Estrutura

```text
masterStudy/
├── branding/               # Marca do produto
├── .github/                # CI e modelos de colaboração
├── README.md               # Apresentação e início rápido
├── CONTRIBUTING.md         # Fluxo de contribuição
├── SECURITY.md             # Orientações de segurança
└── studyhub-desktop/
    ├── src/                # Interface, domínio, serviços e estado
    ├── electron/           # Integração desktop
    ├── native/             # Pontes de plataforma
    ├── public/             # Recursos do aplicativo
    ├── tests/              # Testes automatizados
    ├── scripts/            # Desenvolvimento e distribuição
    ├── supabase/           # Conta, permissões e sincronização
    └── studyhub-extension/ # Extensão de captura
```

O nome técnico `studyhub-desktop` e identificadores antigos são mantidos para preservar compatibilidade com dados e integrações existentes.

## Qualidade e tecnologias

React, Vite e Electron sustentam a interface web/desktop. O projeto também utiliza Zustand, Supabase, leitores PDF/EPUB e Playwright.

Na pasta `studyhub-desktop`:

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

A CI executa testes e build a cada envio ou pull request. A auditoria de dependências roda separadamente e tem uma [pendência conhecida na cadeia de narração local](https://github.com/alexandre-wayss/masterStudy/issues/1). Testes simulados não substituem a validação de serviços reais e dos pacotes distribuídos.

## Dados e limites atuais

- Sincronização não transfere necessariamente todos os livros e anexos locais.
- A exportação em Configurações é parcial; preserve os arquivos originais importantes.
- IA precisa de configuração e revisão; serviços online podem receber o contexto enviado.
- Notificações dependem de permissão e podem parar ao encerrar o app.
- A extensão envia capturas ao desktop aberto; a ponte local não é um serviço público.

## Contribuição e suporte

Leia [CONTRIBUTING.md](CONTRIBUTING.md). Para falhas, informe passos, versão, plataforma e resultado esperado. Use dados fictícios nas evidências. Para vulnerabilidades, siga [SECURITY.md](SECURITY.md).

## Licença

A licença de reutilização ainda não foi definida pelo mantenedor.
