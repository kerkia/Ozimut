import SwiftUI

/// Ozitrac's two roles on one iPhone (docs/track/ozitrac.md « The apps »): « Ma course » (being followed) and « Je suis »
/// (following). The run and the two-minute test cover the screen; the other pages come as sheets.
struct RootView: View {
    @EnvironmentObject var m: AppModel

    private static func isCover(_ p: Page?) -> Bool {
        p == .tracker || p == .selfTest
    }

    private var cover: Binding<Page?> {
        Binding(get: { RootView.isCover(m.page) ? m.page : nil },
                set: { v in if v != nil || RootView.isCover(m.page) { m.page = v } })
    }

    private var sheet: Binding<Page?> {
        Binding(get: { RootView.isCover(m.page) ? nil : m.page },
                set: { v in if v != nil || !RootView.isCover(m.page) { m.page = v } })
    }

    var body: some View {
        TabView(selection: $m.tab) {
            NavigationStack { MeView() }
                .tabItem { Label(L("tab.me"), systemImage: "figure.run") }
                .tag(Tab.me)
            NavigationStack { FollowListView() }
                .tabItem { Label(L("tab.follow"), systemImage: "person.2.fill") }
                .tag(Tab.follow)
        }
        .tint(.orange)
        .overlay(alignment: .top) {
            if let n = m.notice {
                NoticeBanner(text: n) { m.notice = nil }
            }
        }
        .fullScreenCover(item: cover) { p in
            TrackerFlowView(page: p).environmentObject(m)
        }
        .sheet(item: sheet) { p in
            NavigationStack { pageView(p) }.environmentObject(m)
        }
    }

    @ViewBuilder private func pageView(_ p: Page) -> some View {
        switch p {
        case .invite: InviteView()
        case .runs: RunsView()
        case .zone: ZoneView()
        case .pair: PairView()
        case let .join(link): JoinView(link: link)
        case let .follow(c): FollowView(c: c)
        case .tracker, .selfTest: EmptyView()
        }
    }
}

struct NoticeBanner: View {
    let text: String
    let close: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            Text(text).font(.callout).foregroundColor(.white)
            Spacer()
            Button(action: close) {
                Image(systemName: "xmark").foregroundColor(.white)
            }
            .accessibilityLabel(L("common.close"))
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.black.opacity(0.85)))
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { close() }
        }
    }
}

/// A sheet's « Fermer » button.
struct Closable: ViewModifier {
    @EnvironmentObject var m: AppModel

    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("common.close")) { m.page = nil }
            }
        }
    }
}

extension View {
    func closable() -> some View { modifier(Closable()) }
}
