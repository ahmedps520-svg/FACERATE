import SwiftUI
import SwiftData
import Charts

struct HistoryView: View {
    @Binding var path: [AppScreen]
    @Query(sort: \ScanResult.date, order: .reverse) private var scans: [ScanResult]

    var body: some View {
        ZStack {
            BackgroundGradient()

            ScrollView {
                VStack(spacing: 24) {
                    Text("History")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.top, 20)

                    if scans.count > 1 {
                        ProgressGraphView(scans: scans)
                            .padding(.horizontal, 20)
                    }

                    VStack(spacing: 12) {
                        ForEach(scans) { scan in
                            Button {
                                path.append(.results(scan))
                            } label: {
                                HistoryCard(scan: scan, isNewest: scan.id == scans.first?.id)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)

                    if scans.isEmpty {
                        Text("No scans yet")
                            .foregroundStyle(.white.opacity(0.5))
                            .padding(.top, 60)
                    }
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    path.removeLast()
                } label: {
                    Image(systemName: "chevron.left").foregroundStyle(.white)
                }
            }
        }
    }
}

struct HistoryCard: View {
    let scan: ScanResult
    let isNewest: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(label(for: scan.date))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                Text(scan.date.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
            }
            Spacer()
            Text(String(format: "%.1f", scan.overallScore))
                .font(.title3.weight(.bold))
                .foregroundStyle(isNewest ? .green : .white)
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func label(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}
