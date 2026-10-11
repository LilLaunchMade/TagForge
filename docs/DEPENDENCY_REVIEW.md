# Dependency review

The GPL-compatible license audit covers the locked Windows dependency graph. Exact notices are retained in `docs/licenses`. The project uses MIT alternatives for dual MIT/Apache dependencies and retains MPL notices for file-level MPL components. WebView2 remains a separately licensed Microsoft runtime.

The RustSec audit identified **RUSTSEC-2024-0436**, an unmaintained `paste` 1.0.15 compile-time macro dependency of Lofty 0.25.4. It alleges a maintenance concern, not a runtime vulnerability, and provides no patched upgrade. This specific advisory is accepted temporarily with an explicit reason in `deny.toml`; revisit it at the next dependency review. Source: https://rustsec.org/advisories/RUSTSEC-2024-0436 .

An initial all-platform audit also reported unmaintained `proc-macro-error` through Linux GTK dependencies. These are outside the Windows-only build graph; the audit configuration now targets both Windows MSVC and GNU explicitly. This does not claim Linux support or a clean Linux dependency audit.

Do not claim that the dependency graph has no maintenance advisories. Re-run the audits before publishing, as advisory databases and dependency availability change over time.
