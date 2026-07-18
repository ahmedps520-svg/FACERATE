import Foundation
import SwiftData

/// A single completed, locally-stored scan. Nothing here is ever
/// transmitted anywhere — SwiftData persists it to an on-device store only.
@Model
final class ScanResult {
    var date: Date
    var overallScore: Double
    var features: [FacialFeatureResult]
    var suggestions: [String]

    init(
        date: Date = .now,
        overallScore: Double,
        features: [FacialFeatureResult],
        suggestions: [String]
    ) {
        self.date = date
        self.overallScore = overallScore
        self.features = features
        self.suggestions = suggestions
    }
}

/// Codable value type so SwiftData can store an array of these directly
/// as an attribute on ScanResult.
struct FacialFeatureResult: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var kind: FeatureKind
    var detected: Bool
    var confidence: Double // 0...1
    var summary: String
}

enum FeatureKind: String, Codable, CaseIterable, Identifiable {
    case faceShape = "Face Shape"
    case jawline = "Jawline"
    case chin = "Chin"
    case cheekbones = "Cheekbones"
    case eyeShape = "Eye Shape"
    case eyeSpacing = "Eye Spacing"
    case canthalTilt = "Canthal Tilt"
    case eyebrows = "Eyebrows"
    case noseWidth = "Nose Width"
    case noseLength = "Nose Length"
    case lipFullness = "Lip Fullness"
    case facialSymmetry = "Facial Symmetry"
    case foreheadHeight = "Forehead Height"
    case facialProportions = "Facial Proportions"
    case headShape = "Head Shape"
    case skinTexture = "Skin Texture"
    case headTilt = "Head Tilt"
    case poseQuality = "Pose Quality"
    case lightingQuality = "Lighting Quality"

    var id: String { rawValue }

    // NOTE: double-check these against SF Symbols.app for your deployment
    // target — a couple are close substitutes rather than exact matches.
    var symbolName: String {
        switch self {
        case .faceShape, .headShape: return "circle.dashed"
        case .jawline: return "square.dashed"
        case .chin: return "chevron.down"
        case .cheekbones: return "cube.transparent"
        case .eyeShape, .eyeSpacing, .canthalTilt: return "eye"
        case .eyebrows: return "scribble.variable"
        case .noseWidth, .noseLength: return "triangle"
        case .lipFullness: return "smiley"
        case .facialSymmetry: return "arrow.left.and.right"
        case .foreheadHeight: return "rectangle.portrait"
        case .facialProportions: return "ruler"
        case .skinTexture: return "sparkles"
        case .headTilt: return "gyroscope"
        case .poseQuality: return "viewfinder"
        case .lightingQuality: return "sun.max"
        }
    }
}
