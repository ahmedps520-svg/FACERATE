import SwiftUI
import SwiftData

@main
struct FaceScanAIApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: ScanResult.self)
    }
}
