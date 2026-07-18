import SwiftUI
import Charts

struct ProgressGraphView: View {
    let scans: [ScanResult]
    @State private var animate = false

    private var chronological: [ScanResult] { scans.sorted { $0.date < $1.date } }
    private var average: Double {
        guard !scans.isEmpty else { return 0 }
        return scans.map(\.overallScore).reduce(0, +) / Double(scans.count)
    }
    private var highest: ScanResult? { scans.max { $0.overallScore < $1.overallScore } }
    private var newest: ScanResult? { scans.max { $0.date < $1.date } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Progress")
                .font(.headline)
                .foregroundStyle(.white)

            Chart {
                ForEach(chronological) { scan in
                    LineMark(
                        x: .value("Date", scan.date),
                        y: .value("Score", animate ? scan.overallScore : average)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(.white)

                    PointMark(
                        x: .value("Date", scan.date),
                        y: .value("Score", animate ? scan.overallScore : average)
                    )
                    .foregroundStyle(color(for: scan))
                    .symbolSize(scan.id == newest?.id ? 90 : 40)
                }

                RuleMark(y: .value("Average", average))
                    .foregroundStyle(.white.opacity(0.3))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
            .chartYScale(domain: 0...10)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 3)) { _ in
                    AxisValueLabel().foregroundStyle(.white.opacity(0.5))
                }
            }
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel().foregroundStyle(.white.opacity(0.5))
                    AxisGridLine().foregroundStyle(.white.opacity(0.1))
                }
            }
            .frame(height: 180)
            .onAppear {
                withAnimation(.easeOut(duration: 0.9)) { animate = true }
            }
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func color(for scan: ScanResult) -> Color {
        if scan.id == highest?.id { return .green }
        if scan.id == newest?.id { return .yellow }
        return .white.opacity(0.7)
    }
}
