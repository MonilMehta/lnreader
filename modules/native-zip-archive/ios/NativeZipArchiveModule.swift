import ExpoModulesCore
import Foundation
import ZIPFoundation

public class NativeZipArchiveModule: Module {
  private func fileURL(_ path: String) -> URL {
    if let url = URL(string: path), url.isFileURL { return url }
    return URL(fileURLWithPath: path)
  }

  private func merge(_ source: URL, into destination: URL) throws {
    let manager = FileManager.default
    try manager.createDirectory(at: destination, withIntermediateDirectories: true)
    for item in try manager.contentsOfDirectory(at: source, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey]) {
      let properties = try item.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
      guard properties.isSymbolicLink != true else { throw CocoaError(.fileReadInvalidFileName) }
      let target = destination.appendingPathComponent(item.lastPathComponent)
      guard (try? target.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != true else {
        throw CocoaError(.fileReadInvalidFileName)
      }
      if properties.isDirectory == true {
        try merge(item, into: target)
      } else if manager.fileExists(atPath: target.path) {
        _ = try manager.replaceItemAt(target, withItemAt: item)
      } else {
        try manager.moveItem(at: item, to: target)
      }
    }
  }

  private func unzip(_ source: URL, _ destination: URL) throws {
    let manager = FileManager.default
    let staging = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? manager.removeItem(at: staging) }
    // Validate the whole archive before replacing existing plugin/backup files.
    try manager.createDirectory(at: staging, withIntermediateDirectories: true)
    try manager.unzipItem(at: source, to: staging)
    try merge(staging, into: destination)
  }

  private func zip(_ source: URL, _ destination: URL) throws {
    let staging = destination.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".zip")
    defer { try? FileManager.default.removeItem(at: staging) }
    try FileManager.default.zipItem(at: source, to: staging, shouldKeepParent: false, compressionMethod: .deflate)
    if FileManager.default.fileExists(atPath: destination.path) {
      _ = try FileManager.default.replaceItemAt(destination, withItemAt: staging)
    } else {
      try FileManager.default.moveItem(at: staging, to: destination)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("NativeZipArchive")

    AsyncFunction("unzip") { (source: String, destination: String) in
      try self.unzip(self.fileURL(source), self.fileURL(destination))
    }
    AsyncFunction("zip") { (source: String, destination: String) in
      try self.zip(self.fileURL(source), self.fileURL(destination))
    }
    AsyncFunction("remoteUnzip") { (destination: String, url: URL, headers: [String: String], promise: Promise) in
      var request = URLRequest(url: url)
      request.allHTTPHeaderFields = headers
      URLSession.shared.downloadTask(with: request) { location, response, error in
        if let error { promise.reject(error); return }
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), let location else {
          promise.reject("REMOTE_UNZIP_FAILED", "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
          return
        }
        do {
          try self.unzip(location, self.fileURL(destination))
          promise.resolve(nil)
        } catch { promise.reject(error) }
      }.resume()
    }
    AsyncFunction("remoteZip") { (source: String, url: URL, headers: [String: String], promise: Promise) in
      let archive = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".zip")
      do { try self.zip(self.fileURL(source), archive) }
      catch { promise.reject(error); return }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.allHTTPHeaderFields = headers
      URLSession.shared.uploadTask(with: request, fromFile: archive) { data, response, error in
        defer { try? FileManager.default.removeItem(at: archive) }
        if let error { promise.reject(error); return }
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
          promise.reject("REMOTE_ZIP_FAILED", "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
          return
        }
        promise.resolve(data.flatMap { String(data: $0, encoding: .utf8) } ?? "")
      }.resume()
    }
  }
}
