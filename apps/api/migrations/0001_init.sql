PRAGMA foreign_keys = ON;
CREATE TABLE projects (
 id TEXT PRIMARY KEY, github_repository_id INTEGER NOT NULL UNIQUE,
 github_owner TEXT NOT NULL, github_repo TEXT NOT NULL, display_name TEXT NOT NULL,
 description TEXT, repo_url TEXT NOT NULL, homepage_url TEXT,
 first_launched_at TEXT NOT NULL, latest_launched_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),
 position_lat REAL NOT NULL, position_lon REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE launches (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 github_deployment_id INTEGER NOT NULL, github_run_id INTEGER NOT NULL,
 commit_sha TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment='production'), target_url TEXT,
 status_url TEXT NOT NULL, deployed_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
 UNIQUE(project_id,github_deployment_id)
);
CREATE INDEX idx_projects_latest ON projects(status,latest_launched_at DESC,id DESC);
CREATE INDEX idx_launches_recent ON launches(recorded_at DESC,id DESC);
CREATE INDEX idx_launches_project ON launches(project_id,recorded_at DESC,id DESC);
CREATE TABLE moderation_audit(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
