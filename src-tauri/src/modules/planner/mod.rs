pub mod commands;
mod mcp;
pub mod models;
mod store;

pub(crate) type AppResult<T> = Result<T, String>;

pub struct PlannerState {
    pub(crate) mcp: mcp::PlannerMcpServerState,
}

impl PlannerState {
    pub fn new() -> Self {
        Self {
            mcp: mcp::PlannerMcpServerState::default(),
        }
    }
}
