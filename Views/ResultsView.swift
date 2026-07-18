import SwiftUI

struct ResultsView: View {
    let scan: ScanResult
    @Binding var path: [AppScreen]

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ZStack {
            BackgroundGradient()

            ScrollView {
                VStack(spacing: 24) {
                    Text("Face Analysis Complete")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.top, 20)

                    scoreCard

                    VStack(alignment: .leading, spacing: 12) {
                        sectionTitle("Detected Features")
                        LazyVGrid(columns: columns, spacing: 14) {
                            ForEach(scan.features) { feature in
                                FeatureCard(feature: feature)
                            }
                        }
                    }
                    .padding(.horizontal, 20)

                    VStack(alignment: .leading, spacing: 12) {
                        sectionTitle("Suggestions")
                        VStack(spacing: 10) {
                            ForEach(scan.suggestions, id: \.self) { tip in
                                SuggestionRow(text: tip)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .onAppear { HapticManager.resultsShown() }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    path.removeAll { if case .home = $0 { return true }; return false }
                    path = []
                } label: {
                    Image(systemName: "house.fill").foregroundStyle(.white)
                }
            }
        }
    }

    private var scoreCard: some View {
        VStack(spacing: 8) {
            Text("Overall Facial Profile")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white.opacity(0.7))
            Text(String(format: "%.1f / 10", scan.overallScore))
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text("Estimated profile score from this scan — not an objective measure.")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.5))
                .padding(.horizontal, 40)
        }
        .padding(.vertical, 24)
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 20)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.headline)
            .foregroundStyle(.white)
    }
}

struct FeatureCard: View {
    let feature: FacialFeatureResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: feature.kind.symbolName)
                    .foregroundStyle(.white.opacity(0.8))
                Spacer()
                Text("\(Int(feature.confidence * 100))%")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
            }
            Text(feature.kind.rawValue)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
            Text(feature.summary)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(3)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct SuggestionRow: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "sparkle")
                .foregroundStyle(.yellow)
                .padding(.top, 2)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
