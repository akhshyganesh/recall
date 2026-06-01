use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerDocument {
    pub schema_version: u32,
    pub updated_at: String,
    #[serde(default)]
    pub items: Vec<PlannerItem>,
    #[serde(default)]
    pub sketch: PlannerSketch,
    #[serde(default)]
    pub sketches: Vec<PlannerSketch>,
    #[serde(default)]
    pub sketch_folders: Vec<PlannerSketchFolder>,
    #[serde(default)]
    pub settings: PlannerSettings,
    #[serde(default)]
    pub access_policy: PlannerAccessPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub notes: String,
    #[serde(default)]
    pub start_date: Option<String>,
    pub deadline: Option<String>,
    pub tags: Vec<String>,
    pub estimate_minutes: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub archived_at: Option<String>,
    pub timer: PlannerTimerState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerTimerState {
    pub total_seconds: i64,
    pub running_since: Option<String>,
    pub sessions: Vec<PlannerTimerSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerTimerSession {
    pub started_at: String,
    pub ended_at: Option<String>,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerSketch {
    #[serde(default = "default_sketch_id")]
    pub id: String,
    #[serde(default = "default_sketch_title")]
    pub title: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub linked_item_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub shape_count: i64,
    #[serde(default)]
    pub snapshot: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerSketchFolder {
    pub id: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerSettings {
    pub statuses: Vec<PlannerStatusOption>,
    pub priorities: Vec<PlannerOption>,
    pub default_status_id: String,
    pub done_status_id: String,
    pub default_priority_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerStatusOption {
    pub id: String,
    pub label: String,
    pub is_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerOption {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerAccessPolicy {
    pub expose_items: bool,
    pub expose_notes: bool,
    pub expose_timers: bool,
    pub expose_sketches: bool,
    pub include_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerMcpStatus {
    pub running: bool,
    pub endpoint: String,
}

impl Default for PlannerDocument {
    fn default() -> Self {
        Self {
            schema_version: 1,
            updated_at: now_timestamp(),
            items: Vec::new(),
            sketch: PlannerSketch::default(),
            sketches: vec![PlannerSketch::default()],
            sketch_folders: Vec::new(),
            settings: PlannerSettings::default(),
            access_policy: PlannerAccessPolicy::default(),
        }
    }
}

impl Default for PlannerSketch {
    fn default() -> Self {
        Self {
            id: default_sketch_id(),
            title: default_sketch_title(),
            folder_id: None,
            linked_item_id: None,
            tags: Vec::new(),
            updated_at: None,
            shape_count: 0,
            snapshot: None,
        }
    }
}

impl Default for PlannerSettings {
    fn default() -> Self {
        Self {
            statuses: vec![
                PlannerStatusOption {
                    id: "inbox".to_string(),
                    label: "Inbox".to_string(),
                    is_done: false,
                },
                PlannerStatusOption {
                    id: "next".to_string(),
                    label: "Next".to_string(),
                    is_done: false,
                },
                PlannerStatusOption {
                    id: "waiting".to_string(),
                    label: "Waiting".to_string(),
                    is_done: false,
                },
                PlannerStatusOption {
                    id: "done".to_string(),
                    label: "Done".to_string(),
                    is_done: true,
                },
            ],
            priorities: vec![
                PlannerOption {
                    id: "low".to_string(),
                    label: "Low".to_string(),
                },
                PlannerOption {
                    id: "normal".to_string(),
                    label: "Normal".to_string(),
                },
                PlannerOption {
                    id: "high".to_string(),
                    label: "High".to_string(),
                },
            ],
            default_status_id: "inbox".to_string(),
            done_status_id: "done".to_string(),
            default_priority_id: "normal".to_string(),
        }
    }
}

impl Default for PlannerAccessPolicy {
    fn default() -> Self {
        Self {
            expose_items: true,
            expose_notes: false,
            expose_timers: true,
            expose_sketches: false,
            include_completed: false,
        }
    }
}

pub fn now_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn default_sketch_id() -> String {
    "default-sketch".to_string()
}

fn default_sketch_title() -> String {
    "Scratchpad".to_string()
}
