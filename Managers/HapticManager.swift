import UIKit

enum HapticManager {
    static func stepCompleted() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func scanStarted() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func analysisComplete() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func resultsShown() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    static func historyOpened() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}
