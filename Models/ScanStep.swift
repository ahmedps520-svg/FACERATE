import Foundation

enum ScanStep: Int, CaseIterable, Identifiable {
    case straight, turnLeft, turnRight, lookUp, lookDown, smile, neutral

    var id: Int { rawValue }

    var instruction: String {
        switch self {
        case .straight: return "Look Straight"
        case .turnLeft: return "Turn Left"
        case .turnRight: return "Turn Right"
        case .lookUp: return "Look Up"
        case .lookDown: return "Look Down"
        case .smile: return "Smile Naturally"
        case .neutral: return "Return to Neutral Expression"
        }
    }

    var stepNumber: Int { rawValue + 1 }
    static var total: Int { allCases.count }
}

/// One snapshot of ARKit face-tracking data captured when a step is confirmed.
struct StepSample {
    let step: ScanStep
    let yawRadians: Float
    let pitchRadians: Float
    let rollRadians: Float
    let smileStrength: Float // average of left/right mouth-smile blend shapes
    let leftEyeBlink: Float
    let rightEyeBlink: Float
    let capturedAt: Date
}

/// Everything gathered during the camera scan, handed off to the
/// analysis screen once all 7 steps are confirmed.
struct CapturedScanData: Hashable {
    let id = UUID()
    var samples: [StepSampleBox]

    static func == (lhs: CapturedScanData, rhs: CapturedScanData) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// StepSample isn't Hashable (Date/Float are fine, but we keep this
/// wrapper so CapturedScanData can conform cheaply without fuss).
struct StepSampleBox {
    let sample: StepSample
}
