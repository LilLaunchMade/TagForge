fn main() {
    #[cfg(feature = "desktop")]
    {
        println!("cargo:rerun-if-changed=windows-manifest.xml");
        let attributes = tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new()
                .app_manifest(include_str!("windows-manifest.xml")),
        );
        tauri_build::try_build(attributes).expect("Unable to generate application resources");
    }
}
