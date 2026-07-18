import SwiftUI
import SwiftData

enum AppScreen: Hashable {
    case home
    case scan
    case analyzing(CapturedScanData)
    case results(ScanResult)
    case history
}

struct ContentView: View {
    @State private var path: [AppScreen] = []

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(path: $path)
                .navigationDestination(for: AppScreen.self) { screen in
                    switch screen {
                    case .home:
                        HomeView(path: $path)
                    case .scan:
                        CameraScanView(path: $path)
                    case .analyzing(let data):
                        AnalysisLoadingView(path: $path, capturedData: data)
                    case .results(let scan):
                        ResultsView(scan: scan, path: $path)
                    case .history:
                        HistoryView(path: $path)
                    }
                }
        }
        .preferredColorScheme(.dark)
        .tint(.accentColor)
    }
}
