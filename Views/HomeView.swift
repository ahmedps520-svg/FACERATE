import SwiftUI
import SwiftData

struct HomeView: View {
    @Binding var path: [AppScreen]
    @Query(sort: \ScanResult.date, order: .reverse) private var scans: [ScanResult]

    var body: some View {
        ZStack {
            BackgroundGradient()

            VStack(spacing: 28) {
                Spacer()

                VStack(spacing: 8) {
                    Image(systemName: "face.dashed")
                        .font(.system(size: 56, weight: .light))
                        .foregroundStyle(.white)
                    Text("FaceScan AI")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }

                Spacer()

                VStack(spacing: 14) {
                    Button {
                        HapticManager.scanStarted()
                        path.append(.scan)
                    } label: {
                        Text("Start Scan")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.white)
                    .foregroundStyle(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                    if let latest = scans.first {
                        Button {
                            path.append(.results(latest))
                        } label: {
                            Text("Previous Scan")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .buttonStyle(.bordered)
                        .tint(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }

                    Button {
                        HapticManager.historyOpened()
                        path.append(.history)
                    } label: {
                        Text("History")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .padding(.horizontal, 24)

                PrivacyBadge()
                    .padding(.top, 4)
                    .padding(.bottom, 24)
            }
        }
        .navigationBarHidden(true)
    }
}

struct PrivacyBadge: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill")
            Text("Everything stays on this device.")
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(.white.opacity(0.7))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }
}

struct BackgroundGradient: View {
    var body: some View {
        LinearGradient(
            colors: [Color.black, Color(red: 0.08, green: 0.08, blue: 0.14)],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }
}
