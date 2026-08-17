# CampusFlow - Documento de Produto e Arquitetura

## 1. Resumo do Conceito
O CampusFlow é um ecossistema de gestão acadêmica projetado para centralizar a jornada universitária. Ele transforma o caos de múltiplas disciplinas, prazos e plataformas em um fluxo de trabalho estruturado que promove o foco e reduz a ansiedade.

## 2. Problemas que o Software Resolve
- **Desorganização:** Dispersão de materiais e prazos entre e-mails, LMS (Moodle/Canvas) e grupos de WhatsApp.
- **Sobrecarga Mental:** A dificuldade de priorizar o que estudar quando tudo parece urgente.
- **Procrastinação:** Falta de um plano de ação claro e ferramentas de foco integradas.
- **Insegurança de Desempenho:** Incerteza sobre notas necessárias e frequência mínima.

## 3. Personas Principais
- **Ana (A Sobrecarregada):** Trabalha e estuda, tem pouco tempo e precisa de máxima eficiência nas sessões de estudo.
- **Lucas (O Inseguro):** Tem dificuldade com exatas, precisa monitorar notas constantemente para não reprovar.
- **Carla (A Organizada):** Gosta de planejar tudo com antecedência e quer uma visão estética e funcional do seu progresso.

## 4. Arquitetura da Informação (Sitemap)
- **Dashboard (Início):** Visão "Hoje", Próximas Atividades, Progresso.
- **Acadêmico:**
    - **Calendário:** Mensal, Semanal, Diário.
    - **Disciplinas:** Lista de matérias -> Página detalhada (Notas, Frequência, Materiais).
    - **Tarefas:** Kanban, Lista, Timeline.
- **Ferramentas de Foco:**
    - **Planejador:** Sugestão de cronograma.
    - **Pomodoro:** Timer e histórico de sessões.
- **Conhecimento:**
    - **Anotações/Materiais:** Editor de texto e repositório de arquivos.
    - **Revisões (Flashcards):** Sistema de repetição espaçada.
- **Análise:**
    - **Desempenho:** Relatórios de notas, horas e frequência.

## 5. Fluxos Principais
1. **Configuração Inicial:** Onboarding -> Curso -> Semestre -> Disciplinas -> Horários.
2. **Ciclo de Estudo:** Selecionar Tarefa -> Planejar Sessão -> Iniciar Pomodoro -> Concluir e Registrar.
3. **Gestão de Notas:** Adicionar Avaliação -> Receber Nota -> Visualizar Impacto na Média Final.

## 6. Proposta de Direções Visuais

### Direção A: "Deep Focus" (Foco Profundo)
- **Estilo:** Minimalista extremo, alta densidade de espaços em branco (whitespace).
- **Cores:** Base neutra (E8EAF0), acentos em Azul Profundo para autoridade e calma.
- **Tipografia:** Sans-serif geométrica (Inter) para clareza técnica.

### Direção B: "Creative Academic" (Acadêmico Criativo)
- **Estilo:** Moderno com cantos arredondados generosos e sombras suaves.
- **Cores:** Azul Violeta (8B5CF6) como cor primária, usando as cores das disciplinas para criar um código visual vibrante mas controlado.
- **Tipografia:** Tipografia humanista para uma sensação mais acolhedora.
