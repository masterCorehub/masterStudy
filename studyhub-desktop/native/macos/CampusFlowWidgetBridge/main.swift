import Foundation
import WidgetKit

let input = FileHandle.standardInput.readDataToEndOfFile()
guard !input.isEmpty else {
    FileHandle.standardError.write(Data("Nenhum estado recebido.\n".utf8))
    exit(2)
}

do {
    _ = try JSONDecoder().decode(CampusFlowWidgetState.self, from: input)
    guard let url = CampusFlowWidgetStorage.stateURL() else {
        throw NSError(
            domain: "CampusFlowWidgetBridge",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "App Group indisponível. Configure a assinatura no Xcode."]
        )
    }
    try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    try input.write(to: url, options: .atomic)
    WidgetCenter.shared.reloadTimelines(ofKind: "CampusFlowTasksWidget")
    WidgetCenter.shared.reloadTimelines(ofKind: "CampusFlowPomodoroWidget")
    print(url.path)
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
