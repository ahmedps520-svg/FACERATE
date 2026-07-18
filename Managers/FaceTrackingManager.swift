import ARKit
import SwiftUI
import Combine

/// Drives an ARFaceTrackingConfiguration session (front TrueDepth camera),
/// derives head pose (yaw/pitch/roll) and expression strength from the
/// face anchor each frame, and validates the current ScanStep.
///
/// Requires a device with a TrueDepth camera (iPhone X or later).
/// Everything here runs on-device; no frames or data ever leave the app.
final class FaceTrackingManager: NSObject, ObservableObject, ARSessionDelegate {

    @Published var currentStepIndex: Int = 0
    @Published var stepConfirmed: Bool = false
    @Published var isFaceVisible: Bool = false
    @Published var samples: [StepSampleBox] = []
    @Published var isFinished: Bool = false

    let session = ARSession()

    // How long the pose must be held before a step is confirmed.
    private let holdDuration: TimeInterval = 0.5
    private var holdStartedAt: Date?

    // Thresholds — tune on-device; these are reasonable starting points.
    private let turnThreshold: Float = 0.35     // radians, ~20°
    private let pitchThreshold: Float = 0.28    // radians, ~16°
    private let smileThreshold: Float = 0.5     // blend shape 0...1
    private let neutralSmileMax: Float = 0.15
    private let neutralAngleMax: Float = 0.15

    var currentStep: ScanStep? {
        ScanStep(rawValue: currentStepIndex)
    }

    func start() {
        guard ARFaceTrackingConfiguration.isSupported else { return }
        let config = ARFaceTrackingConfiguration()
        config.isLightEstimationEnabled = true
        session.delegate = self
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    func stop() {
        session.pause()
    }

    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        guard let faceAnchor = anchors.compactMap({ $0 as? ARFaceAnchor }).first else { return }
        isFaceVisible = true
        evaluate(faceAnchor: faceAnchor)
    }

    func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        if anchors.contains(where: { $0 is ARFaceAnchor }) {
            isFaceVisible = false
            holdStartedAt = nil
        }
    }

    private func evaluate(faceAnchor: ARFaceAnchor) {
        guard let step = currentStep, !isFinished else { return }

        let (yaw, pitch, roll) = eulerAngles(from: faceAnchor.transform)
        let smileL = faceAnchor.blendShapes[.mouthSmileLeft]?.floatValue ?? 0
        let smileR = faceAnchor.blendShapes[.mouthSmileRight]?.floatValue ?? 0
        let smile = (smileL + smileR) / 2
        let blinkL = faceAnchor.blendShapes[.eyeBlinkLeft]?.floatValue ?? 0
        let blinkR = faceAnchor.blendShapes[.eyeBlinkRight]?.floatValue ?? 0

        let matches: Bool
        switch step {
        case .straight:
            matches = abs(yaw) < neutralAngleMax && abs(pitch) < neutralAngleMax && smile < neutralSmileMax
        case .turnLeft:
            matches = yaw > turnThreshold
        case .turnRight:
            matches = yaw < -turnThreshold
        case .lookUp:
            matches = pitch > pitchThreshold
        case .lookDown:
            matches = pitch < -pitchThreshold
        case .smile:
            matches = smile > smileThreshold
        case .neutral:
            matches = abs(yaw) < neutralAngleMax && abs(pitch) < neutralAngleMax && smile < neutralSmileMax
        }

        guard matches else {
            holdStartedAt = nil
            return
        }

        if holdStartedAt == nil {
            holdStartedAt = .now
        }

        if let started = holdStartedAt, Date.now.timeIntervalSince(started) >= holdDuration {
            confirmStep(step, yaw: yaw, pitch: pitch, roll: roll, smile: smile, blinkL: blinkL, blinkR: blinkR)
        }
    }

    private func confirmStep(_ step: ScanStep, yaw: Float, pitch: Float, roll: Float, smile: Float, blinkL: Float, blinkR: Float) {
        let sample = StepSample(
            step: step,
            yawRadians: yaw,
            pitchRadians: pitch,
            rollRadians: roll,
            smileStrength: smile,
            leftEyeBlink: blinkL,
            rightEyeBlink: blinkR,
            capturedAt: .now
        )
        samples.append(StepSampleBox(sample: sample))
        holdStartedAt = nil

        HapticManager.stepCompleted()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
            stepConfirmed = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self else { return }
            self.stepConfirmed = false
            if self.currentStepIndex + 1 < ScanStep.total {
                self.currentStepIndex += 1
            } else {
                self.isFinished = true
                self.stop()
            }
        }
    }

    /// Extracts yaw/pitch/roll (radians) from ARKit's face-anchor transform.
    private func eulerAngles(from transform: simd_float4x4) -> (yaw: Float, pitch: Float, roll: Float) {
        let pitch = asin(-transform.columns.2.y)
        let yaw = atan2(transform.columns.2.x, transform.columns.2.z)
        let roll = atan2(transform.columns.0.y, transform.columns.1.y)
        return (yaw, pitch, roll)
    }
}
