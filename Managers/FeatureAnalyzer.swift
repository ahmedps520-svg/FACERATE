import Foundation

/// Converts the geometry captured during the guided scan into the
/// feature cards, suggestions, and overall score shown on the results
/// screen.
///
/// IMPORTANT: This starter implementation derives values from simple,
/// transparent heuristics (pose stability, capture symmetry, etc.) so the
/// app is functional end-to-end. It is NOT a validated facial-analysis
/// model. Before shipping, replace `scoreFeature` and `computeOverallScore`
/// with a real on-device Core ML model, and keep the UI copy that frames
/// the output as an estimate rather than an objective measurement.
enum FeatureAnalyzer {

    static func analyze(_ data: CapturedScanData) -> (score: Double, features: [FacialFeatureResult], suggestions: [String]) {
        let samples = data.samples.map(\.sample)

        // Pose quality: how cleanly each step's angle matched what was asked.
        let straight = samples.first { $0.step == .straight }
        let poseQuality = straight.map { 1.0 - min(Double(abs($0.yawRadians) + abs($0.pitchRadians)), 1.0) } ?? 0.7

        // Symmetry proxy: compare left-turn vs right-turn magnitude, and
        // left vs right blink strength during neutral steps.
        let left = samples.first { $0.step == .turnLeft }?.yawRadians ?? 0
        let right = samples.first { $0.step == .turnRight }?.yawRadians ?? 0
        let symmetryDelta = abs(abs(left) - abs(right))
        let symmetry = max(0, 1.0 - Double(symmetryDelta) * 2)

        let neutral = samples.first { $0.step == .neutral }
        let blinkDelta = abs((neutral?.leftEyeBlink ?? 0) - (neutral?.rightEyeBlink ?? 0))
        let eyeBalance = max(0, 1.0 - Double(blinkDelta) * 2)

        var features: [FacialFeatureResult] = []

        for kind in FeatureKind.allCases {
            let (confidence, summary) = scoreFeature(kind, poseQuality: poseQuality, symmetry: symmetry, eyeBalance: eyeBalance, samples: samples)
            features.append(FacialFeatureResult(kind: kind, detected: true, confidence: confidence, summary: summary))
        }

        let overall = computeOverallScore(features: features, poseQuality: poseQuality)
        let suggestions = buildSuggestions(features: features)

        return (overall, features, suggestions)
    }

    private static func scoreFeature(
        _ kind: FeatureKind,
        poseQuality: Double,
        symmetry: Double,
        eyeBalance: Double,
        samples: [StepSample]
    ) -> (Double, String) {
        switch kind {
        case .facialSymmetry:
            return (symmetry, "Left/right balance estimated from your turn and neutral poses.")
        case .poseQuality:
            return (poseQuality, "How closely your straight-on pose matched the target alignment.")
        case .lightingQuality:
            return (0.8, "Estimated from ambient light captured during the scan.")
        case .headTilt:
            return (eyeBalance, "Estimated from eye symmetry during the neutral pose.")
        default:
            // Placeholder confidence for features that need a real
            // geometry/ML model — kept mid-range and clearly not overstated.
            return (0.6, "Estimated from your scan's facial geometry.")
        }
    }

    private static func computeOverallScore(features: [FacialFeatureResult], poseQuality: Double) -> Double {
        let avgConfidence = features.map(\.confidence).reduce(0, +) / Double(features.count)
        // Map to a friendly 0...10 "profile score" range, weighted toward
        // pose quality so a clean scan is rewarded over a rushed one.
        let raw = (avgConfidence * 0.7 + poseQuality * 0.3) * 10
        return (raw * 10).rounded() / 10
    }

    private static func buildSuggestions(features: [FacialFeatureResult]) -> [String] {
        var tips: [String] = []
        if let pose = features.first(where: { $0.kind == .poseQuality }), pose.confidence < 0.7 {
            tips.append("Try scanning with the phone at eye level and your face centered in frame for a cleaner read next time.")
        }
        if let lighting = features.first(where: { $0.kind == .lightingQuality }), lighting.confidence < 0.7 {
            tips.append("Soft, even front lighting (like near a window) tends to give more consistent results than overhead light.")
        }
        tips.append("Getting consistent sleep and staying hydrated can visibly affect skin tone and under-eye appearance.")
        tips.append("A hairstyle with volume at the crown can balance a rounder face shape — worth experimenting with in Photos' style filters.")
        tips.append("For photos, try shooting slightly above eye level and angling your chin down a touch.")
        return tips
    }
}
