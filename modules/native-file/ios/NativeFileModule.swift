import ExpoModulesCore
import Foundation

public class NativeFileModule: Module {
  private func fileURL(_ path: String) -> URL {
    if let url = URL(string: path), url.isFileURL { return url }
    return URL(fileURLWithPath: path)
  }

  public func definition() -> ModuleDefinition {
    Name("NativeFile")

    AsyncFunction("prepareReaderAssets") {
      guard let source = Bundle.main.url(forResource: "reader", withExtension: nil) else {
        throw NSError(domain: "NativeFile", code: 3, userInfo: [NSLocalizedDescriptionKey: "Reader assets are missing from the app bundle"])
      }
      let destination = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("reader-assets")
      if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: destination)
      }
      try FileManager.default.copyItem(at: source, to: destination)
    }

    Function("writeFile") { (path: String, content: String) in
      try content.write(toFile: self.fileURL(path).path, atomically: true, encoding: .utf8)
    }

    Function("readFile") { (path: String) in
      try String(contentsOfFile: self.fileURL(path).path, encoding: .utf8)
    }

    Function("copyFile") { (sourcePath: String, destPath: String) in
      let source = self.fileURL(sourcePath)
      let destination = self.fileURL(destPath)
      let access = source.startAccessingSecurityScopedResource()
      defer { if access { source.stopAccessingSecurityScopedResource() } }
      guard try source.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else {
        throw CocoaError(.fileReadUnsupportedScheme)
      }
      if FileManager.default.fileExists(atPath: destination.path) {
        let data = try Data(contentsOf: source)
        try data.write(to: destination, options: .atomic)
      } else {
        try FileManager.default.copyItem(at: source, to: destination)
      }
    }

    AsyncFunction("copyFileToDirectory") { (sourcePath: String, directoryUri: String, fileName: String, mimeType: String, replace: Bool) -> [String: Any] in
      _ = mimeType
      guard !fileName.isEmpty,
            fileName != ".",
            fileName != "..",
            !fileName.contains("/"),
            !fileName.contains("\\") else {
        throw NSError(
          domain: "NativeFile",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid destination file name"]
        )
      }

      let fileManager = FileManager.default
      let directoryURL: URL
      if let parsedURL = URL(string: directoryUri), parsedURL.isFileURL {
        directoryURL = parsedURL
      } else {
        directoryURL = URL(fileURLWithPath: directoryUri, isDirectory: true)
      }
      let access = directoryURL.startAccessingSecurityScopedResource()
      defer { if access { directoryURL.stopAccessingSecurityScopedResource() } }
      let sourceURL = self.fileURL(sourcePath)
      let destinationURL = directoryURL.appendingPathComponent(fileName)
      let stagingURL = directoryURL.appendingPathComponent(".\(fileName).\(UUID().uuidString).tmp")

      guard fileManager.fileExists(atPath: directoryURL.path) else {
        throw NSError(
          domain: "NativeFile",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Destination directory does not exist"]
        )
      }
      if fileManager.fileExists(atPath: destinationURL.path) && !replace {
        throw CocoaError(.fileWriteFileExists)
      }

      defer { try? fileManager.removeItem(at: stagingURL) }
      try fileManager.copyItem(at: sourceURL, to: stagingURL)
      let attributes = try fileManager.attributesOfItem(atPath: stagingURL.path)
      let copiedSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0

      if fileManager.fileExists(atPath: destinationURL.path) {
        _ = try fileManager.replaceItemAt(destinationURL, withItemAt: stagingURL)
      } else {
        try fileManager.moveItem(at: stagingURL, to: destinationURL)
      }
      return ["uri": destinationURL.absoluteString, "size": copiedSize]
    }

    Function("moveFile") { (sourcePath: String, destPath: String) in
      let source = self.fileURL(sourcePath)
      let destination = self.fileURL(destPath)
      if FileManager.default.fileExists(atPath: destination.path) {
        _ = try FileManager.default.replaceItemAt(destination, withItemAt: source)
      } else {
        try FileManager.default.moveItem(at: source, to: destination)
      }
    }

    Function("exists") { (filePath: String) in
      FileManager.default.fileExists(atPath: self.fileURL(filePath).path)
    }

    Function("mkdir") { (filePath: String) in
      try FileManager.default.createDirectory(atPath: self.fileURL(filePath).path, withIntermediateDirectories: true, attributes: nil)
    }

    Function("unlink") { (filePath: String) in
      try FileManager.default.removeItem(atPath: self.fileURL(filePath).path)
    }

    Function("readDir") { (dirPath: String) -> [[String: Any]] in
      let contents = try FileManager.default.contentsOfDirectory(atPath: self.fileURL(dirPath).path)
      return contents.map { fileName in
        let path = (self.fileURL(dirPath).path as NSString).appendingPathComponent(fileName)
        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        return [
          "name": fileName,
          "path": path,
          "isDirectory": isDirectory.boolValue
        ]
      }
    }

    AsyncFunction("downloadFile") { (url: String, destPath: String, method: String, headers: [String: String], body: String?, promise: Promise) in
      guard let remoteURL = URL(string: url),
            ["http", "https"].contains(remoteURL.scheme?.lowercased() ?? "") else {
        promise.reject("INVALID_URL", "Expected an HTTP or HTTPS URL")
        return
      }
      var request = URLRequest(url: remoteURL)
      request.httpMethod = method.uppercased()
      request.allHTTPHeaderFields = headers
      request.httpBody = body?.data(using: .utf8)
      URLSession.shared.downloadTask(with: request) { location, response, error in
        if let error { promise.reject(error); return }
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode), let location else {
          promise.reject("DOWNLOAD_FAILED", "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
          return
        }
        do {
          let destination = self.fileURL(destPath)
          try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
          if FileManager.default.fileExists(atPath: destination.path) {
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: location)
          } else {
            try FileManager.default.moveItem(at: location, to: destination)
          }
          promise.resolve(nil)
        } catch { promise.reject(error) }
      }.resume()
    }

    Constant("DocumentDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("ExternalDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("ExternalCachesDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }
  }
}
