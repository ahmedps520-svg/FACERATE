import SwiftUI
import SwiftData

struct AnalysisLoadingView: View {
    @Binding var path: [AppScreen]
    let capturedData: CapturedScanData
    @Environment(\.modelContext) private var modelContext

    @State private var progress: Double = 0
    @State private var statusIndex = 0
    @State private var timer: Timer?

    private let statusMessages = [
        "Building facial mesh...",
        "Calculating landmark vectors...",
        "Estimating facial proportions...",
        "Processing symmetry matrix...",
        "Mapping facial geometry...",
        "Extracting contour profile...",
        "Detecting eye alignment...",
        "Estimating facial structure...",
        "Computing proportional balance...",
        "Generating feature profile...",
        "Refining confidence map..."
    ]

    var body: some View {
        ZStack {
            BackgroundGradient()

            VStack(spacing: 32) {
                Spacer()

                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.1), lineWidth: 14)

                    Circle()
                        .trim(from: 0, to: progress / 100)
                        .stroke(
                            AngularGradient(
                                colors: [.red, .orange, .yellow, .green, .red],
                                center: .center
                            ),
                            style: StrokeStyle(lineWidth: 14, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                        .animation(.easeInOut(duration: 0.4), value: progress)

                    VStack(spacing: 4) {
                        Text("Analyzing")
                            .font(.headline)
                            .foregroundStyle(.white.opacity(0.8))
                        Text("\(Int(progress))%")
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 220, height: 220)
                .padding(.horizontal, 40)

                Text(statusMessages[statusIndex])
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white.opacity(0.7))
                    .transition(.opacity)
                    .id(statusIndex)
                    .animation(.easeInOut(duration: 0.25), value: statusIndex)

                Spacer()
            }
        }
        .navigationBarBackButtonHidden(true)
        .onAppear(perform: startAnalysis)
        .onDisappear { timer?.invalidate() }
    }

    private func startAnalysis() {
        // Total animated duration ~ (statusMessages.count) seconds, per spec:
        // subtitle changes every second, ring fills to 100% as it finishes.
        let totalTicks = statusMessages.count
        var tick = 0

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { t in
            tick += 1
            statusIndex = min(tick, statusMessages.count - 1)
            progress = min(Double(tick) / Double(totalTicks) * 100, 100)

            if tick >= totalTicks {
                t.invalidate()
                finishAnalysis()
            }
        }
    }

    private func finishAnalysis() {
        let (score, features, suggestions) = FeatureAnalyzer.analyze(capturedData)
        let scan = ScanResult(overallScore: score, features: features, suggestions: suggestions)
        modelContext.insert(scan)

        HapticManager.analysisComplete()
        path.append(.results(scan))
    }
}
