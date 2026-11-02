// ShareNote: Greenroom in the iPhone's share sheet (MODELXOFFTOUR, Devin, Oct 30: "Sounds good. But don't forget"). Notes gives no way
// in as a collaborator, so a note comes in by Send a Copy. A share extension cannot open its app, and Apple's open() works only from
// other kinds of extension, so this leaves the text in the App Group the two share, says so, and closes. The app takes it the next
// time it runs (ShareInboxPlugin.swift) and opens Paste a list with it. Nothing is added until the person saves there.
// No plugin and no Capacitor here. The words are held on this phone only, for a day at most.

import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    /// More than any list Paste a list takes (100 lines), and small enough for the group's defaults.
    private let limit = 20000
    private let name = "greenroom.share.inbox"
    /// As ShareInbox.keepFor: what waits longer than this is gone.
    private let keepFor: TimeInterval = 24 * 3600
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0, alpha: 0.6)
        label.text = "Sending to Greenroom…"
        label.textColor = .white
        label.font = .boldSystemFont(ofSize: 20)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        gather { [weak self] text in
            guard let self = self else { return }
            let sent = self.leave(text)
            self.label.text = sent ? "Sent to Greenroom" : "Nothing to send to Greenroom"
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            }
        }
    }

    /// Every piece of text handed over, in order, one to a block. What Notes offers is only known on a phone, so its type names go to
    /// the phone's own log (names of kinds, never the note).
    private func gather(_ done: @escaping (String) -> Void) {
        let items = (extensionContext?.inputItems ?? []).compactMap { $0 as? NSExtensionItem }
        var texts = [String?](repeating: nil, count: items.reduce(0) { $0 + ($1.attachments?.count ?? 0) + 1 })
        let wait = DispatchGroup()
        let lock = NSLock()
        var at = 0
        let plain = UTType.plainText.identifier
        for item in items {
            lock.lock()
            texts[at] = item.attributedContentText?.string
            lock.unlock()
            at += 1
            for p in item.attachments ?? [] {
                let slot = at
                at += 1
                NSLog("ShareNote offered: %@", p.registeredTypeIdentifiers.joined(separator: ", "))
                guard p.hasItemConformingToTypeIdentifier(plain) else { continue }
                wait.enter()
                p.loadItem(forTypeIdentifier: plain, options: nil) { got, _ in
                    let text = Self.words(got)
                    lock.lock()
                    texts[slot] = text
                    lock.unlock()
                    wait.leave()
                }
            }
        }
        wait.notify(queue: .main) {
            // (Text that came both ways reads once.)
            var seen = Set<String>()
            let parts = texts.compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty && seen.insert($0).inserted }
            done(parts.joined(separator: "\n"))
        }
    }

    private static func words(_ got: NSSecureCoding?) -> String? {
        if let s = got as? String { return s }
        if let a = got as? NSAttributedString { return a.string }
        if let d = got as? Data { return String(data: d, encoding: .utf8) }
        if let u = got as? URL, u.isFileURL { return try? String(contentsOf: u, encoding: .utf8) }
        return nil
    }

    /// Into the App Group for the app to take. The app's bundle ID is this one's without .ShareNote. Text still waiting stays ahead of this,
    /// since it was told Sent too, and keeps its own moment, so nothing is held longer than the day we say.
    private func leave(_ text: String) -> Bool {
        let app = (Bundle.main.bundleIdentifier ?? "").replacingOccurrences(of: ".ShareNote", with: "")
        guard !text.isEmpty, let box = UserDefaults(suiteName: "group." + app) else { return false }
        let now = Date().timeIntervalSince1970
        var all = text, at = now
        if let got = box.dictionary(forKey: name), let old = got["text"] as? String, !old.isEmpty, let was = got["at"] as? Double, now - was <= keepFor {
            all = old + "\n" + text
            at = was
        }
        box.set(["text": String(all.prefix(limit)), "at": at] as [String: Any], forKey: name)
        return true
    }
}
