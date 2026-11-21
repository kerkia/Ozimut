import Foundation

enum PushResult: Equatable {
    case ok(ack: Int, next: Int?, stop: Bool)
    /// 401: the device was removed from its account.
    case unauthorized
    /// 409: the run is closed on the server.
    case closed
    /// 413: too many fixes in one batch.
    case tooLarge
    /// 429: wait `next` seconds.
    case slow(next: Int?)
    case failed(String)
}

protocol TrackPushing: AnyObject {
    func push(key: String, body: Data, done: @escaping (PushResult) -> Void)
}

enum TrackAPIError: Error, Equatable {
    /// 400 { error: "code" }: unknown, used or expired code.
    case code
    /// 429.
    case tooMany
    case unauthorized
    case http(Int)
    case network(String)
    case answer
}

struct PairResult {
    var device: String
    var key: String
    var account: TrackAccount
    var watchers: [String]
    var settings: TrackSettings
    var webToken: String?
}

/// The device side of the tracking API (design.md « Device protocol »). Ordinary URLSession requests (not background
/// sessions), no cookies: the device is known by its key alone.
final class TrackClient: TrackPushing {
    let base: URL
    private let session: URLSession

    init(base: URL) {
        self.base = base
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 30
        c.timeoutIntervalForResource = 60
        c.waitsForConnectivity = false
        c.httpShouldSetCookies = false
        c.httpCookieAcceptPolicy = .never
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: c)
    }

    func url(_ path: String) -> URL {
        URL(string: path, relativeTo: base)?.absoluteURL ?? base.appendingPathComponent(path)
    }

    private func request(_ path: String, body: Data, bearer: String?) -> URLRequest {
        var r = URLRequest(url: url(path))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { r.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        r.httpBody = body
        return r
    }

    func push(key: String, body: Data, done: @escaping (PushResult) -> Void) {
        session.dataTask(with: request("api/track/push", body: body, bearer: key)) { data, response, error in
            guard let http = response as? HTTPURLResponse else {
                done(.failed(error?.localizedDescription ?? "network"))
                return
            }
            let obj = JSON.object(data)
            switch http.statusCode {
            case 200:
                guard let ack = JSON.int(obj?["ack"]) else {
                    done(.failed("answer"))
                    return
                }
                done(.ok(ack: ack, next: JSON.int(obj?["next"]), stop: (obj?["stop"] as? Bool) ?? false))
            case 401: done(.unauthorized)
            case 409: done(.closed)
            case 413: done(.tooLarge)
            case 429: done(.slow(next: JSON.int(obj?["next"])))
            default: done(.failed("HTTP \(http.statusCode)"))
            }
        }.resume()
    }

    /// A JSON POST; answers the status and the JSON object (if any).
    func post(_ path: String, _ json: [String: Any], bearer: String? = nil, using s: URLSession? = nil) async throws -> (Int, [String: Any]?) {
        let body = try JSONSerialization.data(withJSONObject: json)
        let req = request(path, body: body, bearer: bearer)
        do {
            let (data, response) = try await (s ?? session).data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (code, JSON.object(data))
        } catch {
            throw TrackAPIError.network(error.localizedDescription)
        }
    }

    // MARK: pairing

    func pair(code: String, device: [String: Any]) async throws -> PairResult {
        let (status, obj) = try await post("api/track/pair", ["code": code, "device": device])
        switch status {
        case 200: break
        case 400, 404: throw TrackAPIError.code
        case 429: throw TrackAPIError.tooMany
        default: throw TrackAPIError.http(status)
        }
        guard let obj, let dev = obj["device"] as? String, let key = obj["key"] as? String,
              let account = TrackAccount(json: obj["account"] as? [String: Any]) else { throw TrackAPIError.answer }
        return PairResult(device: dev, key: key, account: account,
                          watchers: (obj["watchers"] as? [String]) ?? [],
                          settings: TrackSettings(json: obj["settings"] as? [String: Any]),
                          webToken: obj["webToken"] as? String)
    }

    /// A watch's claim: `nil` while no account has claimed it.
    func claim(claim: String, key: String, kind: String, model: String, version: String) async throws -> (TrackAccount, TrackSettings)? {
        let (status, obj) = try await post("api/track/claim", ["claim": claim, "key": key, "kind": kind, "model": model, "version": version])
        switch status {
        case 202: return nil
        case 200:
            if (obj?["paired"] as? Bool) == false { return nil }
            guard let account = TrackAccount(json: obj?["account"] as? [String: Any]) else { throw TrackAPIError.answer }
            return (account, TrackSettings(json: obj?["settings"] as? [String: Any]))
        case 429: throw TrackAPIError.tooMany
        default: throw TrackAPIError.http(status)
        }
    }

    /// A one-time token signing a web view in to the device's account.
    func webToken(key: String) async throws -> String {
        let (status, obj) = try await post("api/track/webtoken", [:], bearer: key)
        if status == 401 { throw TrackAPIError.unauthorized }
        guard status == 200, let t = obj?["token"] as? String else { throw TrackAPIError.http(status) }
        return t
    }

    func pushToken(key: String, kind: String, token: String, env: String) async throws {
        let (status, _) = try await post("api/track/pushtoken", ["kind": kind, "token": token, "env": env], bearer: key)
        if status == 401 { throw TrackAPIError.unauthorized }
        guard (200..<300).contains(status) else { throw TrackAPIError.http(status) }
    }

    /// A pair code for the device's own account, made through a session of that account: `webtoken` → `session`
    /// (its cookie kept in a session of its own) → `pair-code`. Used by the iPhone to pair its Apple Watch.
    func pairCodeForAccount(key: String, account: Int) async throws -> String {
        let token = try await webToken(key: key)
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieAcceptPolicy = .always
        c.httpShouldSetCookies = true
        c.timeoutIntervalForRequest = 30
        let s = URLSession(configuration: c)
        defer { s.finishTasksAndInvalidate() }
        let (st1, _) = try await post("api/track/session", ["token": token], using: s)
        guard (200..<400).contains(st1) else { throw TrackAPIError.http(st1) }
        let (st2, obj) = try await post("api/track/pair-code", ["account": account], using: s)
        guard st2 == 200, let code = obj?["code"] as? String else { throw TrackAPIError.http(st2) }
        return code
    }
}
