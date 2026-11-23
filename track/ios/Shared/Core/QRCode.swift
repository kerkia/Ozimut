import Foundation

/*
 * Ported from Project Nayuki's QR Code generator library (Java), reduced to byte mode and level M:
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 *
 * The mask penalty is written from ISO/IEC 18004's four rules.
 */

/// A QR code of a text: byte mode, error correction level M, the smallest version that holds it, the mask of lowest
/// penalty. Ported from Project Nayuki's « QR Code generator library » (MIT licence,
/// https://www.nayuki.io/page/qr-code-generator-library; see THIRD-PARTY-NOTICES.md), reduced to what Ozitrac needs:
/// the Apple Watch has no CoreImage, and the iPhone draws its codes the same way.
struct QRCode {
    let version: Int
    let size: Int
    private(set) var modules: [Bool]
    private var isFunction: [Bool]

    /// Error correction codewords per block, and blocks, for level M, by version (index 0 unused).
    private static let eccPerBlock: [Int] = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
                                             26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
    private static let numBlocks: [Int] = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
                                           17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
    /// Level M's two format bits.
    private static let formatM = 0

    private init(version: Int) {
        self.version = version
        size = version * 4 + 17
        modules = Array(repeating: false, count: size * size)
        isFunction = Array(repeating: false, count: size * size)
    }

    func isDark(_ x: Int, _ y: Int) -> Bool {
        x >= 0 && y >= 0 && x < size && y < size && modules[y * size + x]
    }

    static func encode(_ text: String) -> QRCode? {
        encode(bytes: Array(text.utf8))
    }

    /// `mask`: a given mask (tests), else the one of lowest penalty.
    static func encode(bytes: [UInt8], mask forced: Int? = nil) -> QRCode? {
        var version = 0
        for v in 1...40 {
            let ccBits = v < 10 ? 8 : 16
            if bytes.count < (1 << ccBits) && 4 + ccBits + bytes.count * 8 <= dataCodewords(v) * 8 {
                version = v
                break
            }
        }
        guard version > 0 else { return nil }
        var bits: [Bool] = []
        func append(_ val: Int, _ n: Int) {
            var i = n - 1
            while i >= 0 {
                bits.append((val >> i) & 1 == 1)
                i -= 1
            }
        }
        append(4, 4)
        append(bytes.count, version < 10 ? 8 : 16)
        for b in bytes { append(Int(b), 8) }
        let cap = dataCodewords(version) * 8
        append(0, min(4, cap - bits.count))
        append(0, (8 - bits.count % 8) % 8)
        var pad = 0xEC
        while bits.count < cap {
            append(pad, 8)
            pad = pad == 0xEC ? 0x11 : 0xEC
        }
        var data = [UInt8](repeating: 0, count: bits.count / 8)
        for (i, b) in bits.enumerated() where b {
            data[i >> 3] |= UInt8(1 << (7 - (i & 7)))
        }

        var q = QRCode(version: version)
        q.drawFunctionPatterns()
        q.drawCodewords(addEccAndInterleave(data, version: version))
        var best = forced ?? 0
        if forced == nil {
            var lowest = Int.max
            for m in 0..<8 {
                q.applyMask(m)
                q.drawFormatBits(m)
                let p = q.penalty()
                if p < lowest {
                    lowest = p
                    best = m
                }
                q.applyMask(m)
            }
        }
        q.applyMask(best)
        q.drawFormatBits(best)
        return q
    }

    // MARK: capacity and error correction

    private static func rawDataModules(_ ver: Int) -> Int {
        var result = (16 * ver + 128) * ver + 64
        if ver >= 2 {
            let numAlign = ver / 7 + 2
            result -= (25 * numAlign - 10) * numAlign - 55
            if ver >= 7 { result -= 36 }
        }
        return result
    }

    private static func dataCodewords(_ ver: Int) -> Int {
        rawDataModules(ver) / 8 - eccPerBlock[ver] * numBlocks[ver]
    }

    private static func addEccAndInterleave(_ data: [UInt8], version: Int) -> [UInt8] {
        let blocksN = numBlocks[version]
        let eccLen = eccPerBlock[version]
        let raw = rawDataModules(version) / 8
        let numShort = blocksN - raw % blocksN
        let shortLen = raw / blocksN
        let divisor = rsDivisor(eccLen)
        var blocks: [[UInt8]] = []
        var k = 0
        for i in 0..<blocksN {
            let len = shortLen - eccLen + (i < numShort ? 0 : 1)
            let dat = Array(data[k..<(k + len)])
            k += len
            var block = dat + [UInt8](repeating: 0, count: shortLen + 1 - dat.count)
            let ecc = rsRemainder(dat, divisor)
            for (j, e) in ecc.enumerated() { block[block.count - eccLen + j] = e }
            blocks.append(block)
        }
        var result: [UInt8] = []
        result.reserveCapacity(raw)
        for i in 0..<blocks[0].count {
            for j in 0..<blocks.count where i != shortLen - eccLen || j >= numShort {
                result.append(blocks[j][i])
            }
        }
        return result
    }

    private static func rsDivisor(_ degree: Int) -> [UInt8] {
        var result = [UInt8](repeating: 0, count: degree)
        result[degree - 1] = 1
        var root: UInt8 = 1
        for _ in 0..<degree {
            for j in 0..<degree {
                result[j] = rsMultiply(result[j], root)
                if j + 1 < degree { result[j] ^= result[j + 1] }
            }
            root = rsMultiply(root, 0x02)
        }
        return result
    }

    private static func rsRemainder(_ data: [UInt8], _ divisor: [UInt8]) -> [UInt8] {
        var result = [UInt8](repeating: 0, count: divisor.count)
        for b in data {
            let factor = b ^ result[0]
            result.removeFirst()
            result.append(0)
            for i in 0..<result.count {
                result[i] ^= rsMultiply(divisor[i], factor)
            }
        }
        return result
    }

    private static func rsMultiply(_ x: UInt8, _ y: UInt8) -> UInt8 {
        var z = 0
        var i = 7
        while i >= 0 {
            z = (z << 1) ^ ((z >> 7) * 0x11D)
            z ^= ((Int(y) >> i) & 1) * Int(x)
            i -= 1
        }
        return UInt8(z & 0xFF)
    }

    // MARK: drawing

    private mutating func setFunction(_ x: Int, _ y: Int, _ dark: Bool) {
        modules[y * size + x] = dark
        isFunction[y * size + x] = true
    }

    private mutating func drawFunctionPatterns() {
        for i in 0..<size {
            setFunction(6, i, i % 2 == 0)
            setFunction(i, 6, i % 2 == 0)
        }
        drawFinder(3, 3)
        drawFinder(size - 4, 3)
        drawFinder(3, size - 4)
        let pos = alignmentPositions()
        let n = pos.count
        for i in 0..<n {
            for j in 0..<n where !((i == 0 && j == 0) || (i == 0 && j == n - 1) || (i == n - 1 && j == 0)) {
                drawAlignment(pos[i], pos[j])
            }
        }
        drawFormatBits(0)
        drawVersion()
    }

    private mutating func drawFinder(_ x: Int, _ y: Int) {
        for dy in -4...4 {
            for dx in -4...4 {
                let dist = max(abs(dx), abs(dy))
                let xx = x + dx, yy = y + dy
                if xx >= 0 && xx < size && yy >= 0 && yy < size {
                    setFunction(xx, yy, dist != 2 && dist != 4)
                }
            }
        }
    }

    private mutating func drawAlignment(_ x: Int, _ y: Int) {
        for dy in -2...2 {
            for dx in -2...2 {
                setFunction(x + dx, y + dy, max(abs(dx), abs(dy)) != 1)
            }
        }
    }

    private func alignmentPositions() -> [Int] {
        if version == 1 { return [] }
        let numAlign = version / 7 + 2
        let step = (version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4) * 2
        var result = [Int](repeating: 0, count: numAlign)
        result[0] = 6
        var pos = size - 7
        var i = numAlign - 1
        while i >= 1 {
            result[i] = pos
            pos -= step
            i -= 1
        }
        return result
    }

    private mutating func drawFormatBits(_ mask: Int) {
        let data = QRCode.formatM << 3 | mask
        var rem = data
        for _ in 0..<10 { rem = (rem << 1) ^ ((rem >> 9) * 0x537) }
        let bits = (data << 10 | rem) ^ 0x5412
        func bit(_ i: Int) -> Bool { (bits >> i) & 1 != 0 }
        for i in 0...5 { setFunction(8, i, bit(i)) }
        setFunction(8, 7, bit(6))
        setFunction(8, 8, bit(7))
        setFunction(7, 8, bit(8))
        for i in 9..<15 { setFunction(14 - i, 8, bit(i)) }
        for i in 0..<8 { setFunction(size - 1 - i, 8, bit(i)) }
        for i in 8..<15 { setFunction(8, size - 15 + i, bit(i)) }
        setFunction(8, size - 8, true)
    }

    private mutating func drawVersion() {
        guard version >= 7 else { return }
        var rem = version
        for _ in 0..<12 { rem = (rem << 1) ^ ((rem >> 11) * 0x1F25) }
        let bits = version << 12 | rem
        for i in 0..<18 {
            let b = (bits >> i) & 1 != 0
            let a = size - 11 + i % 3
            let c = i / 3
            setFunction(a, c, b)
            setFunction(c, a, b)
        }
    }

    private mutating func drawCodewords(_ data: [UInt8]) {
        var i = 0
        var right = size - 1
        while right >= 1 {
            if right == 6 { right = 5 }
            for vert in 0..<size {
                for j in 0..<2 {
                    let x = right - j
                    let upward = ((right + 1) & 2) == 0
                    let y = upward ? size - 1 - vert : vert
                    if !isFunction[y * size + x] && i < data.count * 8 {
                        modules[y * size + x] = (data[i >> 3] >> (7 - (i & 7))) & 1 != 0
                        i += 1
                    }
                }
            }
            right -= 2
        }
    }

    private mutating func applyMask(_ m: Int) {
        for y in 0..<size {
            for x in 0..<size {
                let invert: Bool
                switch m {
                case 0: invert = (x + y) % 2 == 0
                case 1: invert = y % 2 == 0
                case 2: invert = x % 3 == 0
                case 3: invert = (x + y) % 3 == 0
                case 4: invert = (x / 3 + y / 2) % 2 == 0
                case 5: invert = x * y % 2 + x * y % 3 == 0
                case 6: invert = (x * y % 2 + x * y % 3) % 2 == 0
                default: invert = ((x + y) % 2 + x * y % 3) % 2 == 0
                }
                let k = y * size + x
                if invert && !isFunction[k] { modules[k].toggle() }
            }
        }
    }

    // MARK: the penalty of a mask (the four rules of ISO/IEC 18004)

    private func penalty() -> Int {
        var result = 0
        var line = [Bool](repeating: false, count: size)
        for y in 0..<size {
            for x in 0..<size { line[x] = modules[y * size + x] }
            result += QRCode.runPenalty(line) + 40 * QRCode.finderLike(line)
        }
        for x in 0..<size {
            for y in 0..<size { line[y] = modules[y * size + x] }
            result += QRCode.runPenalty(line) + 40 * QRCode.finderLike(line)
        }
        for y in 0..<(size - 1) {
            for x in 0..<(size - 1) {
                let c = modules[y * size + x]
                if c == modules[y * size + x + 1] && c == modules[(y + 1) * size + x] && c == modules[(y + 1) * size + x + 1] {
                    result += 3
                }
            }
        }
        let dark = modules.reduce(0) { $0 + ($1 ? 1 : 0) }
        let total = size * size
        let k = max(0, (abs(dark * 20 - total * 10) + total - 1) / total - 1)
        return result + k * 10
    }

    /// Runs of five modules or more of one colour: 3 + the run's length beyond five.
    private static func runPenalty(_ line: [Bool]) -> Int {
        var r = 0
        var run = 1
        for i in 1..<line.count {
            if line[i] == line[i - 1] {
                run += 1
            } else {
                if run >= 5 { r += run - 2 }
                run = 1
            }
        }
        if run >= 5 { r += run - 2 }
        return r
    }

    /// 1:1:3:1:1 dark-light-dark-light-dark with four light modules on one side (outside the symbol is light).
    private static func finderLike(_ line: [Bool]) -> Int {
        let a: [Bool] = [false, false, false, false, true, false, true, true, true, false, true]
        let b: [Bool] = [true, false, true, true, true, false, true, false, false, false, false]
        var n = 0
        for start in -10..<line.count {
            for pattern in [a, b] {
                var ok = true
                for (j, want) in pattern.enumerated() {
                    let p = start + j
                    let got = p >= 0 && p < line.count ? line[p] : false
                    if got != want {
                        ok = false
                        break
                    }
                }
                if ok { n += 1 }
            }
        }
        return n
    }
}
