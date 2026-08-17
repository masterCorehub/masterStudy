import { SCREEN_IDS } from "../app/screenIds";

export const imageAssets = {
  brandModule: "/assets/brand-module.png",
  brandFlashcards: "/assets/brand-flashcards.png",
  avatarDashboard: "/assets/avatar-dashboard.png",
  avatarModule: "/assets/avatar-module.png",
  avatarImmersion: "/assets/avatar-immersion.png",
  avatarStudent: "/assets/avatar-student.png",
  tutorHelena: "/assets/tutor-helena.png",
  avatarSmall: "/assets/avatar-small.png",
  videoFrame: "/assets/video-frame.png",
  noteAttachment: "/assets/note-attachment.png",
  noteAnatomy: "/assets/note-anatomy.png",
  noteBrain: "/assets/note-brain.png",
};

export const courses = [
  {
    id: "course-neuro",
    title: "Neurociência Aplicada",
    progress: 70,
    modules: [
      {
        id: "module-01",
        title: "Introdução à Neurociência",
        lessonCount: 12,
        lessons: [
          {
            id: "lesson-01",
            title: "A base fisiológica da aprendizagem",
            subtitle: "Módulo 1 • Aula guiada",
            assetIds: ["asset-audio-01", "asset-video-01", "asset-pdf-01"],
          },
        ],
      },
    ],
  },
];

export const lessonAssets = [
  {
    id: "asset-video-01",
    kind: "video",
    title: "Aula_Intro.mp4",
    localPath: "C:\\Users\\alexa\\Videos\\Aula_Intro.mp4",
    libraryPath: "%APPDATA%\\StudyHub\\library\\module-01\\Aula_Intro.mp4",
    sizeBytes: 157286400,
    durationSeconds: 2120,
  },
  {
    id: "asset-audio-01",
    kind: "audio",
    title: "Resumo_Audio.mp3",
    localPath: "C:\\Users\\alexa\\Music\\Resumo_Audio.mp3",
    libraryPath: "%APPDATA%\\StudyHub\\library\\module-01\\Resumo_Audio.mp3",
    sizeBytes: 27525120,
    durationSeconds: 2120,
  },
  {
    id: "asset-pdf-01",
    kind: "pdf",
    title: "Apostila_Modulo_1.pdf",
    localPath: "C:\\Users\\alexa\\Documents\\Apostila_Modulo_1.pdf",
    libraryPath: "%APPDATA%\\StudyHub\\library\\module-01\\Apostila_Modulo_1.pdf",
    sizeBytes: 2516582,
  },
];

export const shellNavigation = [
  { id: SCREEN_IDS.DASHBOARD, label: "My Courses", icon: "book", activeIcon: "book" },
  { id: SCREEN_IDS.TASKS, label: "Tasks", icon: "task_alt", activeIcon: "task_alt" },
  { id: SCREEN_IDS.FLASHCARDS, label: "Flashcards", icon: "quiz", activeIcon: "quiz" },
  { id: "notes", label: "Notes", icon: "edit_note", activeIcon: "edit_note" },
];

export const dashboardData = {
  progress: 70,
  welcomeTitle: "Welcome back, Scholar",
  welcomeSubtitle: "Continue your journey. You are 70% through this week's goals.",
  modules: [
    {
      id: "algorithms",
      icon: "terminal",
      accent: "primary",
      title: "Advanced Algorithms",
      subtitle: "Module 04 • 12 Lessons",
      avatars: ["A", "B"],
    },
    {
      id: "system-design",
      icon: "design_services",
      accent: "tertiary",
      title: "System Design",
      subtitle: "Module 02 • 8 Lessons",
      progress: 45,
    },
  ],
  reviewWidget: {
    title: "Flashcards",
    due: 24,
    subtitle: "Keep your memory fresh. 24 cards waiting for review today.",
  },
  activity: [
    {
      id: "quiz",
      icon: "check_circle",
      iconColor: "text-green-600",
      title: "Completed Quiz 3",
      subtitle: "2 hours ago",
    },
    {
      id: "notes",
      icon: "edit_document",
      iconColor: "text-[color:var(--primary)]",
      title: "Updated Notes: Big O",
      subtitle: "Yesterday",
    },
  ],
};

export const moduleData = {
  title: "Neuroanatomia Funcional",
  subtitle: "Exploração aprofundada da estrutura e organização do sistema nervoso central e periférico, focando na correlação entre anatomia, vias neurais e funções cognitivas complexas.",
  moduleNumber: 4,
  duration: "12h 30m",
  progress: 68,
  tutor: {
    name: "Dra. Helena Voss",
    role: "Instrutora Principal",
    image: imageAssets.tutorHelena,
  },
  stats: {
    materials: 12,
    xp: 350,
  },
  lessons: [
    {
      id: "lesson-01",
      title: "1. Introdução ao Sistema Nervoso",
      kindLabel: "Vídeo",
      durationLabel: "45m",
      status: "completed",
    },
    {
      id: "lesson-02",
      title: "2. Medula Espinhal e Tronco Encefálico",
      kindLabel: "Vídeo",
      durationLabel: "52m",
      status: "completed",
    },
    {
      id: "lesson-03",
      title: "3. Cerebelo e Vias Motoras",
      kindLabel: "Vídeo",
      durationLabel: "1h 10m",
      status: "current",
      progressLabel: "Em andamento (25m)",
    },
    {
      id: "lesson-04",
      title: "Material Complementar: Vias Motoras",
      kindLabel: "Leitura",
      durationLabel: "15 Páginas",
      status: "pending",
    },
    {
      id: "lesson-05",
      title: "4. Diencéfalo e Gânglios da Base",
      kindLabel: "Vídeo",
      durationLabel: "58m",
      status: "locked",
    },
  ],
  tools: {
    flashcards: {
      title: "Flashcards",
      description: "Revise 42 termos anatômicos chave deste módulo com repetição espaçada.",
      pendingLabel: "Revisão diária pendente",
    },
    notes: {
      title: "Notas Rápidas",
      items: [
        "**Cerebelo:** Manutenção do equilíbrio e postura.",
        "Lembrar da diferença entre vias aferentes e eferentes nos pedúnculos cerebelares.",
        "*Dica da Dra. Helena:* Focar na organização somatotópica.",
      ],
    },
  },
};

export const lessonDetailedData = {
  id: "lesson-03",
  title: "Aula 3: Cerebelo e Vias Motoras",
  description: "Explore as estruturas do cerebelo e como elas se integram às vias motoras para coordenar o movimento suave e o equilíbrio.",
  moduleTitle: "Módulo 1: Neuroanatomia Básica",
  index: "3/8",
  progressCurrent: "08:14",
  progressTotal: "24:00",
  progressRatio: 0.34,
  image: imageAssets.videoFrame,
  sidebarLessons: [
    { id: "sl1", title: "Aula 1: Tronco Encefálico", duration: "12 min", type: "Vídeo", status: "completed" },
    { id: "sl2", title: "Aula 2: Nervos Cranianos", duration: "18 min", type: "Vídeo", status: "completed" },
    { id: "sl3", title: "Aula 3: Cerebelo e Vias Motoras", duration: "24 min", type: "Vídeo", status: "current" },
    { id: "sl4", title: "Aula 4: Diencéfalo e Gânglios", duration: "15 min", type: "Leitura", status: "locked" },
    { id: "sl5", title: "Quiz: Consolidação", duration: "10 questões", type: "Exercício", status: "locked" },
  ]
};

export const flashcardData = {
  eyebrow: "Revisão Espaçada",
  title: "Neuroanatomia Funcional",
  dailyProgress: 48,
  dailyProgressLabel: "24 de 50 cartões",
  deckTitle: "Sistema Nervoso Central",
  cardNumber: "#104",
  question: "Qual a principal função do Córtex Motor Primário e em qual giro ele se localiza?",
  answer:
    "Controla os movimentos voluntários do lado oposto do corpo. Localiza-se no Giro Pré-central (Lobo Frontal).",
  feedbackActions: [
    { id: "hard", label: "Difícil", subtitle: "Rever em 10m", accent: "text-[color:var(--error)]" },
    { id: "medium", label: "Médio", subtitle: "Rever em 1 dia", accent: "text-[color:var(--on-surface)]" },
    { id: "easy", label: "Fácil", subtitle: "Rever em 4 dias", accent: "text-[color:var(--primary)]" },
  ],
  retentionBars: [40, 65, 50, 85, 70, 90, 30],
  schedule: [
    { id: "s1", icon: "priority_high", iconAccent: "text-[color:var(--error)]", title: "Fisiologia Celular", subtitle: "12 cartões pendentes", time: "Agora", raised: true },
    { id: "s2", icon: "schedule", iconAccent: "text-[color:var(--primary)]", title: "Patologia Geral", subtitle: "45 cartões", time: "em 2 horas" },
    { id: "s3", icon: "wb_twilight", iconAccent: "text-[color:var(--on-surface-variant)]", title: "Farmacologia", subtitle: "18 cartões", time: "Amanhã" },
  ],
};

export const immersionData = {
  steps: [
    { id: "listen", icon: "headphones", label: "Ouvir", active: true },
    { id: "video", icon: "play_circle", label: "Aula" },
    { id: "pdf", icon: "menu_book", label: "PDF" },
    { id: "mixed", icon: "library_music", label: "PDF+Áudio" },
    { id: "audio", icon: "hearing", label: "Só Áudio" },
  ],
  lessonTitle: "Introdução à Neurociência",
  lessonSubtitle: "Módulo 1 • A base fisiológica da aprendizagem",
  progressCurrent: "12:45",
  progressTotal: "35:20",
  progressRatio: 0.34,
  notes: [
    {
      id: "n1",
      time: "05:12",
      accent: "border-[color:var(--primary)] text-[color:var(--primary)]",
      text: "A neuroplasticidade é mais ativa nos primeiros 20 minutos de foco absoluto.",
    },
    {
      id: "n2",
      time: "11:30",
      accent: "border-[color:var(--tertiary)] text-[color:var(--tertiary)]",
      text: "Revisar conceito de consolidação sináptica vs consolidação de sistemas.",
    },
  ],
};

export const notesData = {
  totalNotes: 24,
  totalModules: 4,
  filters: ["Todos os Módulos", "Física Quântica", "Cálculo III"],
  list: [
    {
      id: "note-01",
      title: "Princípio da Incerteza de Heisenberg",
      content: "A formulação fundamental afirma que é impossível determinar simultaneamente, com precisão arbitrária, a posição e o momento de uma partícula. Δx·Δp ≥ ℏ/2. Isso não é uma limitação dos instrumentos, mas uma propriedade intrínseca da natureza ondulatória da matéria. Revisar o experimento da fenda dupla para a prova de amanhã.",
      module: "Física Quântica",
      time: "Hoje, 14:30",
      pinned: true,
      accent: "primary",
      images: [imageAssets.noteAttachment],
      moreImagesCount: 2,
    },
    {
      id: "note-02",
      title: "Integrais de Linha",
      content: "Lembrar do Teorema de Green. Uma integral de linha sobre uma curva fechada simples C orientada positivamente no plano é igual à integral dupla sobre a região D delimitada por C. Cuidado com o sentido da parametrização!",
      module: "Cálculo III",
      time: "Ontem",
      pinned: false,
      accent: "tertiary",
    },
    {
      id: "note-03",
      title: "Modernismo no Brasil",
      content: "Semana de Arte Moderna (1922). Rompimento com o parnasianismo. Principais autores: Mário de Andrade (Macunaíma), Oswald de Andrade, Manuel Bandeira. Focar na primeira fase (heroica/destrutiva).",
      module: "Literatura",
      time: "12 Mai",
      pinned: false,
      accent: "on-surface",
    },
    {
      id: "note-04",
      title: "Sistema Ósseo - Crânio",
      content: "Forames do crânio e nervos cranianos que os atravessam.",
      module: "Anatomia",
      time: "",
      pinned: false,
      accent: "error",
      images: [imageAssets.noteAnatomy],
    }
  ],
  editor: {
    title: "Resumo: Córtex Pré-frontal",
    module: "Módulo 3",
    subject: "Neuroanatomia Funcional",
    status: "Salvo agora",
    reference: {
      concept: "O córtex pré-frontal é crucial para funções executivas, planejamento de comportamentos cognitivos complexos e tomada de decisão.",
      image: imageAssets.noteBrain,
      imageCaption: "Fig 1: Mapeamento Cortical",
    },
    content: "O estudo da região frontal revela complexidades fascinantes. A **área de Brodmann 9 e 10** está intimamente ligada à memória de trabalho.\n\n- Regulação da atenção seletiva.\n- Inibição de impulsos inadequados.\n- Integração temporal de eventos."
  }
};
