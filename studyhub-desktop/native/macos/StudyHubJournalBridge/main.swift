import AppKit
import Foundation

private struct JournalPayload: Decodable {
    let title: String
    let body: String
    let mediaPaths: [String]?
}

private func writeError(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

private final class ShareDelegate: NSObject, NSSharingServiceDelegate {
    private var finished = false

    private func finish(exitCode: Int32, message: String? = nil) {
        guard !finished else { return }
        finished = true
        if let message {
            if exitCode == 0 {
                print(message)
            } else {
                writeError(message)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NSApp.terminate(nil)
        }
        if exitCode != 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                exit(exitCode)
            }
        }
    }

    func sharingService(_ sharingService: NSSharingService, didShareItems items: [Any]) {
        finish(exitCode: 0, message: "OK")
    }

    func sharingService(
        _ sharingService: NSSharingService,
        didFailToShareItems items: [Any],
        error: Error
    ) {
        finish(exitCode: 4, message: "O Diário recusou a entrada: \(error.localizedDescription)")
    }

    func timeout() {
        finish(exitCode: 5, message: "O Diário demorou demais para confirmar a entrada.")
    }
}

guard CommandLine.arguments.count >= 2 else {
    writeError("Informe o arquivo JSON com a entrada do StudyHub.")
    exit(2)
}

do {
    let payloadURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let payload = try JSONDecoder().decode(JournalPayload.self, from: Data(contentsOf: payloadURL))
    let title = payload.title.trimmingCharacters(in: .whitespacesAndNewlines)
    let body = payload.body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else {
        throw NSError(domain: "StudyHubJournalBridge", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "A entrada do diário está vazia."
        ])
    }

    let content = NSMutableAttributedString()
    if !title.isEmpty {
        content.append(NSAttributedString(
            string: title,
            attributes: [
                .font: NSFont.boldSystemFont(ofSize: 22),
                .foregroundColor: NSColor.labelColor,
            ]
        ))
        content.append(NSAttributedString(string: "\n\n"))
    }
    content.append(NSAttributedString(
        string: body,
        attributes: [
            .font: NSFont.systemFont(ofSize: 16),
            .foregroundColor: NSColor.labelColor,
        ]
    ))

    var items: [Any] = [content]
    for mediaPath in payload.mediaPaths ?? [] {
        let url = URL(fileURLWithPath: mediaPath)
        if FileManager.default.fileExists(atPath: url.path) {
            items.append(url)
        }
    }

    let services = NSSharingService.sharingServices(forItems: items)
    guard let journalService = services.first(where: {
        $0.title.localizedCaseInsensitiveCompare("Journal") == .orderedSame ||
        $0.title.localizedCaseInsensitiveCompare("Diário") == .orderedSame
    }) else {
        throw NSError(domain: "StudyHubJournalBridge", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "Ative Diário em Ajustes do Sistema > Geral > Itens de Início e Extensões > Por App."
        ])
    }

    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    app.activate(ignoringOtherApps: true)

    let delegate = ShareDelegate()
    journalService.delegate = delegate
    DispatchQueue.main.async {
        journalService.perform(withItems: items)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
        delegate.timeout()
    }
    app.run()
} catch {
    writeError(error.localizedDescription)
    exit(3)
}
