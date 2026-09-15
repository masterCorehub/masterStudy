import SwiftUI
import WidgetKit

struct CampusFlowEntry: TimelineEntry {
    let date: Date
    let state: CampusFlowWidgetState
}

struct CampusFlowProvider: TimelineProvider {
    func placeholder(in context: Context) -> CampusFlowEntry {
        CampusFlowEntry(date: Date(), state: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (CampusFlowEntry) -> Void) {
        completion(CampusFlowEntry(date: Date(), state: CampusFlowWidgetStorage.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CampusFlowEntry>) -> Void) {
        let entry = CampusFlowEntry(date: Date(), state: CampusFlowWidgetStorage.read())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

private let deepNavy = Color(red: 9 / 255, green: 20 / 255, blue: 38 / 255)
private let mutedSlate = Color(red: 80 / 255, green: 95 / 255, blue: 118 / 255)

struct TasksWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CampusFlowEntry

    private var visibleTasks: [CampusFlowTask] {
        Array(entry.state.tasks.prefix(family == .systemSmall ? 2 : 3))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Tarefas", systemImage: "checklist")
                    .font(.system(size: 13, weight: .bold))
                Spacer()
                Text("\(entry.state.tasks.count)")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            if visibleTasks.isEmpty {
                Spacer()
                VStack(alignment: .leading, spacing: 5) {
                    Image(systemName: "checkmark.circle")
                        .font(.title2)
                        .foregroundStyle(mutedSlate)
                    Text("Tudo em dia")
                        .font(.headline)
                    Text("Nenhuma tarefa pendente")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            } else {
                ForEach(visibleTasks) { task in
                    HStack(alignment: .top, spacing: 8) {
                        Circle()
                            .fill(task.overdue ? Color.red : deepNavy)
                            .frame(width: 6, height: 6)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title)
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1)
                            if let dueDate = task.dueDate {
                                Text(task.overdue ? "Atrasada · \(dueDate)" : dueDate)
                                    .font(.system(size: 10))
                                    .foregroundStyle(task.overdue ? .red : .secondary)
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "campusflow://tasks"))
    }
}

struct PomodoroWidgetView: View {
    let entry: CampusFlowEntry

    private var title: String {
        switch entry.state.pomodoro.mode {
        case "shortBreak": return "Pausa curta"
        case "longBreak": return "Pausa longa"
        default: return "Foco"
        }
    }

    private var endDate: Date? {
        guard let value = entry.state.pomodoro.endTime else { return nil }
        return Date(timeIntervalSince1970: value / 1000)
    }

    private var pausedTime: String {
        let seconds = max(0, entry.state.pomodoro.remainingSeconds)
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(title, systemImage: entry.state.pomodoro.isActive ? "timer" : "pause.circle")
                    .font(.system(size: 13, weight: .bold))
                Spacer()
                Text("\(entry.state.pomodoro.completedCount)")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Group {
                if entry.state.pomodoro.isActive, let endDate {
                    Text(timerInterval: Date()...endDate, countsDown: true)
                } else {
                    Text(pausedTime)
                }
            }
            .font(.system(size: 31, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(deepNavy)
            if let task = entry.state.pomodoro.taskTitle, !task.isEmpty {
                Text(task)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text(entry.state.pomodoro.isActive ? "Sessão em andamento" : "Pronto para começar")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "campusflow://pomodoro"))
    }
}

struct CampusFlowTasksWidget: Widget {
    let kind = "CampusFlowTasksWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CampusFlowProvider()) { entry in
            TasksWidgetView(entry: entry)
        }
        .configurationDisplayName("Próximas tarefas")
        .description("Mostra as tarefas acadêmicas mais urgentes.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CampusFlowPomodoroWidget: Widget {
    let kind = "CampusFlowPomodoroWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CampusFlowProvider()) { entry in
            PomodoroWidgetView(entry: entry)
        }
        .configurationDisplayName("Pomodoro")
        .description("Acompanhe sua sessão de foco no desktop.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct CampusFlowWidgetBundle: WidgetBundle {
    var body: some Widget {
        CampusFlowTasksWidget()
        CampusFlowPomodoroWidget()
    }
}
