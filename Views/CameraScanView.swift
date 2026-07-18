import SwiftUI
import ARKit
import SceneKit

struct CameraScanView: View {
    @Binding var path: [AppScreen]
    @StateObject private var tracker = FaceTrackingManager()

    var body: some View {
        ZStack {
            ARFaceCameraRepresentable(session: tracker.session)
                .ignoresSafeArea()

            LinearGradient(
                colors: [.black.opacity(0.55), .clear, .black.opacity(0.6)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack {
                header
                Spacer()
                instructionCard
                Spacer()
                footerHint
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .navigationBarBackButtonHidden(true)
        .onAppear { tracker.start() }
        .onDisappear { tracker.stop() }
        .onChange(of: tracker.isFinished) { _, finished in
            if finished {
                let data = CapturedScanData(samples: tracker.samples)
                path.append(.analyzing(data))
            }
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            HStack {
                Button {
                    tracker.stop()
                    path.removeLast()
                } label: {
                    Image(systemName: "xmark")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }
                Spacer()
                Text("Step \(min(tracker.currentStepIndex + 1, ScanStep.total)) of \(ScanStep.total)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }

            ProgressView(value: Double(tracker.currentStepIndex), total: Double(ScanStep.total))
                .tint(.white)
        }
    }

    private var instructionCard: some View {
        VStack(spacing: 16) {
            if !tracker.isFaceVisible {
                Text("Position your face in the frame")
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.85))
            } else if let step = tracker.currentStep {
                ZStack {
                    Circle()
                        .strokeBorder(tracker.stepConfirmed ? Color.green : Color.white.opacity(0.4), lineWidth: 4)
                        .frame(width: 96, height: 96)
                    if tracker.stepConfirmed {
                        Image(systemName: "checkmark")
                            .font(.system(size: 36, weight: .bold))
                            .foregroundStyle(.green)
                            .transition(.scale.combined(with: .opacity))
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 30, weight: .semibold))
                            .foregroundStyle(.white)
                            .rotationEffect(rotation(for: step))
                    }
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: tracker.stepConfirmed)

                Text(step.instruction)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
            }
        }
        .padding(28)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 8)
    }

    private var footerHint: some View {
        Text("Hold each pose steady for a moment")
            .font(.footnote)
            .foregroundStyle(.white.opacity(0.6))
    }

    private func rotation(for step: ScanStep) -> Angle {
        switch step {
        case .straight, .smile, .neutral: return .degrees(0)
        case .turnLeft: return .degrees(-90)
        case .turnRight: return .degrees(90)
        case .lookUp: return .degrees(0)
        case .lookDown: return .degrees(180)
        }
    }
}

/// Wraps an ARSCNView so the ARFaceTrackingManager's ARSession can drive
/// a live camera preview. The face geometry itself isn't rendered — this
/// is a plain passthrough camera feed for user framing.
struct ARFaceCameraRepresentable: UIViewRepresentable {
    let session: ARSession

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView()
        view.session = session
        view.automaticallyUpdatesLighting = true
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {}
}
