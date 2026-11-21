// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SaysoHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "SaysoHelper", targets: ["SaysoHelper"]),
    ],
    targets: [
        .target(name: "SaysoHelperCore"),
        .executableTarget(name: "SaysoHelper", dependencies: ["SaysoHelperCore"]),
        .testTarget(name: "SaysoHelperCoreTests", dependencies: ["SaysoHelperCore"]),
    ],
    swiftLanguageModes: [.v6]
)
