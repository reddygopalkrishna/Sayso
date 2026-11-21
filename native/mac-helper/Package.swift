// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SaysoHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "SaysoHelper", targets: ["SaysoHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", exact: "1.1.1"),
    ],
    targets: [
        // Protocol + message loop; no OS frameworks, so it is fast to test.
        .target(name: "SaysoHelperCore"),
        // Thin OS adapters: Fn event tap, microphone, WhisperKit, pasteboard + synthetic keys.
        .target(
            name: "SaysoHelperMac",
            dependencies: [
                "SaysoHelperCore",
                .product(name: "WhisperKit", package: "WhisperKit"),
            ]
        ),
        .executableTarget(name: "SaysoHelper", dependencies: ["SaysoHelperCore", "SaysoHelperMac"]),
        .testTarget(name: "SaysoHelperCoreTests", dependencies: ["SaysoHelperCore"]),
    ],
    swiftLanguageModes: [.v6]
)
