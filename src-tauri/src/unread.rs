use serde::Serialize;
use std::collections::HashMap;
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub route_id: String,
    pub count: u32,
    pub source: String,
}
#[derive(Default)]
pub struct Unread {
    entries: HashMap<String, Entry>,
    pub revision: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub unread_counts: Vec<Entry>,
    pub total: u32,
    pub revision: u64,
}
fn priority(s: &str) -> u8 {
    if s == "telegram-app-badge" {
        3
    } else if s.starts_with("gmail-") || s.ends_with("-dom") {
        2
    } else if s == "title" {
        1
    } else {
        0
    }
}
impl Unread {
    pub fn update(&mut self, id: &str, count: u32, source: &str) {
        let count = count.min(9999);
        if self.entries.get(id).is_some_and(|e| {
            priority(&e.source) > priority(source) || (e.count == count && e.source == source)
        }) {
            return;
        }
        self.entries.insert(
            id.into(),
            Entry {
                route_id: id.into(),
                count,
                source: source.into(),
            },
        );
        self.revision += 1;
    }
    pub fn remove(&mut self, id: &str) {
        if self.entries.remove(id).is_some() {
            self.revision += 1;
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            unread_counts: self.entries.values().cloned().collect(),
            total: self.entries.values().map(|e| e.count).sum(),
            revision: self.revision,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn priority_revision_cleanup() {
        let mut u = Unread::default();
        u.update("a", 5, "gmail-dom");
        u.update("a", 0, "title");
        assert_eq!(u.snapshot().total, 5);
        assert_eq!(u.revision, 1);
        u.update("a", 0, "gmail-dom");
        assert_eq!(u.snapshot().total, 0);
        u.remove("a");
        assert_eq!(u.revision, 3);
    }
}
