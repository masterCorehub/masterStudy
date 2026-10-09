import Foundation

let campusFlowAppGroup = "group.com.studyhub.desktop"
let campusFlowStateFile = "widget-state.json"

struct CampusFlowTask: Codable, Identifiable {
    let id: String
    let title: String
    let dueDate: String?
    let priority: String?
    let overdue: Bool
}


struct CampusFlowWidgetState: Codable {
    let updatedAt: Double
    let tasks: [CampusFlowTask]

    static let empty = CampusFlowWidgetState(
        updatedAt: Date().timeIntervalSince1970 * 1000,
        tasks: []
    )
}

enum CampusFlowWidgetStorage {
    static func containerURL() -> URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: campusFlowAppGroup
        )
    }

    static func stateURL() -> URL? {
        containerURL()?.appendingPathComponent(campusFlowStateFile)
    }

    static func read() -> CampusFlowWidgetState {
        guard let url = stateURL(),
              let data = try? Data(contentsOf: url),
              let state = try? JSONDecoder().decode(CampusFlowWidgetState.self, from: data)
        else { return .empty }
        return state
    }
}
