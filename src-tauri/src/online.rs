use crate::core::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::{
    io::Read,
    sync::Mutex,
    time::{Duration, Instant},
};

static LAST: Mutex<Option<Instant>> = Mutex::new(None);
fn client(contact: &str) -> Result<reqwest::blocking::Client> {
    if contact.len() < 5
        || contact.len() > 200
        || !contact.is_ascii()
        || contact.chars().any(|c| c.is_control())
        || !(contact.contains('@') || contact.starts_with("https://"))
    {
        return Err(
            "Provide a real contact email or project URL for the MusicBrainz User-Agent".into(),
        );
    }
    reqwest::blocking::Client::builder()
        .user_agent(format!("TagForge/1.0.0 ({contact})"))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let u = attempt.url();
            let host = u.host_str().unwrap_or("");
            if attempt.previous().len() > 5 {
                attempt.error("Too many redirects")
            } else if u.scheme() == "https"
                && (host == "coverartarchive.org"
                    || host == "archive.org"
                    || host.ends_with(".archive.org"))
            {
                attempt.follow()
            } else {
                attempt.error("Untrusted redirect")
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}
fn throttle() {
    let mut last = LAST.lock().unwrap();
    if let Some(time) = *last {
        let elapsed = time.elapsed();
        if elapsed < Duration::from_millis(1100) {
            std::thread::sleep(Duration::from_millis(1100) - elapsed);
        }
    }
    *last = Some(Instant::now());
}
pub fn search(query: &str, contact: &str) -> Result<Value> {
    if query.trim().is_empty() || query.len() > 500 {
        return Err("Enter a search query of 1–500 characters".into());
    }
    let c = client(contact)?;
    throttle();
    let response = c
        .get("https://musicbrainz.org/ws/2/recording/")
        .query(&[("query", query), ("fmt", "json"), ("limit", "20")])
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    response
        .take(2_000_001)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 2_000_000 {
        return Err("Response too large".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
pub fn cover(release: &str, contact: &str) -> Result<String> {
    if release.len() != 36
        || release.chars().enumerate().any(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c != '-'
            } else {
                !c.is_ascii_hexdigit()
            }
        })
    {
        return Err("Invalid MusicBrainz release ID".into());
    }
    let c = client(contact)?;
    throttle();
    let response = c
        .get(format!(
            "https://coverartarchive.org/release/{release}/front-500"
        ))
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_string();
    if !matches!(mime.as_str(), "image/jpeg" | "image/png") {
        return Err("Unsupported artwork type".into());
    }
    let mut bytes = Vec::new();
    response
        .take(20 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Artwork exceeds 20 MB".into());
    }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_requests_do_not_reach_the_network() {
        assert!(search("", "").is_err());
        assert!(search("Song", "invalid").is_err());
        assert!(search("Song", "contact@example.com\r\nInjected: yes").is_err());
        assert!(cover("../../not-a-release", "").is_err());
    }
    #[test]
    fn requests_are_spaced_at_least_one_second() {
        *LAST.lock().unwrap() = None;
        throttle();
        let begin = Instant::now();
        throttle();
        assert!(begin.elapsed() >= Duration::from_secs(1));
    }
}
