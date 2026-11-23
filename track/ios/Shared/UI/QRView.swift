import SwiftUI

/// A QR code drawn module by module (QRCode), dark on white with its quiet zone, whatever the theme.
struct QRView: View {
    let text: String
    private let code: QRCode?

    init(text: String) {
        self.text = text
        code = QRCode.encode(text)
    }

    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
            guard let code else { return }
            let n = CGFloat(code.size + 8)
            let cell = min(size.width, size.height) / n
            let ox = (size.width - cell * n) / 2 + cell * 4
            let oy = (size.height - cell * n) / 2 + cell * 4
            var p = Path()
            for y in 0..<code.size {
                for x in 0..<code.size where code.isDark(x, y) {
                    // a hair larger, so that no seam shows between neighbours
                    p.addRect(CGRect(x: ox + CGFloat(x) * cell, y: oy + CGFloat(y) * cell, width: cell + 0.3, height: cell + 0.3))
                }
            }
            ctx.fill(p, with: .color(.black))
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel(Text(text))
    }
}
