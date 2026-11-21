import SwiftUI

/// A button that acts only once held for `seconds` (Stop: held two seconds), a ring filling meanwhile.
struct HoldButton: View {
    let title: String
    var seconds: Double = 2
    var size: CGFloat = 140
    var color: Color = .red
    let action: () -> Void

    @State private var pressing = false

    var body: some View {
        ZStack {
            Circle().fill(color.opacity(0.15))
            Circle().stroke(color.opacity(0.3), lineWidth: size / 16)
            Circle()
                .trim(from: 0, to: pressing ? 1 : 0)
                .stroke(color, style: StrokeStyle(lineWidth: size / 16, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(pressing ? .linear(duration: seconds) : .easeOut(duration: 0.2), value: pressing)
            Text(title)
                .font(.system(size: size / 7, weight: .bold))
                .foregroundColor(color)
                .multilineTextAlignment(.center)
                .padding(size / 10)
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .onLongPressGesture(minimumDuration: seconds, maximumDistance: 60, perform: {
            pressing = false
            action()
        }, onPressingChanged: { pressing = $0 })
        .accessibilityAddTraits(.isButton)
    }
}
