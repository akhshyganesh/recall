import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

export type ReadResult =
	| { kind: "text"; content: string; size: number }
	| { kind: "binary"; size: number }
	| { kind: "toolarge"; size: number; limit: number };

export type GitRepoInfo = {
	repoRoot: string;
	branch: string;
	upstream: string | null;
	isDetached: boolean;
};

export type GitChangedFile = {
	path: string;
	originalPath: string | null;
	indexStatus: string;
	worktreeStatus: string;
	staged: boolean;
	unstaged: boolean;
	untracked: boolean;
	statusLabel: string;
};

export type GitStatusSnapshot = {
	repoRoot: string;
	branch: string;
	upstream: string | null;
	ahead: number;
	behind: number;
	isDetached: boolean;
	truncated: boolean;
	changedFiles: GitChangedFile[];
};

export type GitDiffResult = {
	diffText: string;
	truncated: boolean;
};

export type GitDiffContentResult = {
	originalContent: string;
	modifiedContent: string;
	isBinary: boolean;
	fallbackPatch: string;
	truncated: boolean;
};

export type GitCommitResult = {
	commitSha: string;
	summary: string;
};

export type GitPushResult = {
	remote: string | null;
	branch: string | null;
	pushed: boolean;
};

export type GitBranchMutationResult = {
	branch: string;
};

export type GitLogEntry = {
	sha: string;
	shortSha: string;
	author: string;
	authorEmail: string;
	timestampSecs: number;
	parents: string[];
	subject: string;
	filesChanged: number;
	insertions: number;
	deletions: number;
};

export type GitCommitFileChange = {
	path: string;
	originalPath: string | null;
	status: string;
	statusLabel: string;
	added: number;
	removed: number;
	isBinary: boolean;
};

export type GitPanelSnapshot = {
	repo: GitRepoInfo | null;
	status: GitStatusSnapshot | null;
};

export type GitLocalBranch = {
	name: string;
	current: boolean;
	upstream: string | null;
};

export type GitRemoteBranch = {
	name: string;
	remote: string;
	shortName: string;
};

export type GitBranchSnapshot = {
	current: string | null;
	localBranches: GitLocalBranch[];
	remoteBranches: GitRemoteBranch[];
};

export type GitDiscardEntry = {
	path: string;
	untracked: boolean;
};

export const native = {
	workspaceCurrentDir: () => invoke<string>("workspace_current_dir"),
	workspaceAuthorize: (path: string) =>
		invoke<string>("workspace_authorize", {
			path,
			workspace: currentWorkspaceEnv(),
		}),
	readFile: (path: string) =>
		invoke<ReadResult>("fs_read_file", {
			path,
			workspace: currentWorkspaceEnv(),
		}),
	writeFile: (path: string, content: string) =>
		invoke<void>("fs_write_file", {
			path,
			content,
			workspace: currentWorkspaceEnv(),
		}),
	canonicalize: (path: string) =>
		invoke<string>("fs_canonicalize", {
			path,
			workspace: currentWorkspaceEnv(),
		}),
	createFile: (path: string) =>
		invoke<void>("fs_create_file", { path, workspace: currentWorkspaceEnv() }),
	createDir: (path: string) =>
		invoke<void>("fs_create_dir", { path, workspace: currentWorkspaceEnv() }),
	gitResolveRepo: (cwd: string) =>
		invoke<GitRepoInfo | null>("git_resolve_repo", {
			cwd,
			workspace: currentWorkspaceEnv(),
		}),
	gitPanelSnapshot: (cwd: string) =>
		invoke<GitPanelSnapshot>("git_panel_snapshot", {
			cwd,
			workspace: currentWorkspaceEnv(),
		}),
	gitStatus: (repoRoot: string) =>
		invoke<GitStatusSnapshot>("git_status", {
			repoRoot,
			workspace: currentWorkspaceEnv(),
		}),
	gitListBranches: (repoRoot: string) =>
		invoke<GitBranchSnapshot>("git_list_branches", {
			repoRoot,
			workspace: currentWorkspaceEnv(),
		}),
	gitSwitchBranch: (repoRoot: string, name: string) =>
		invoke<GitBranchMutationResult>("git_switch_branch", {
			repoRoot,
			name,
			workspace: currentWorkspaceEnv(),
		}),
	gitSwitchRemoteBranch: (repoRoot: string, name: string) =>
		invoke<GitBranchMutationResult>("git_switch_remote_branch", {
			repoRoot,
			name,
			workspace: currentWorkspaceEnv(),
		}),
	gitCreateBranch: (
		repoRoot: string,
		name: string,
		startPoint?: string | null,
	) =>
		invoke<GitBranchMutationResult>("git_create_branch", {
			repoRoot,
			name,
			startPoint: startPoint ?? null,
			workspace: currentWorkspaceEnv(),
		}),
	gitDiff: (repoRoot: string, path: string | null, staged: boolean) =>
		invoke<GitDiffResult>("git_diff", {
			repoRoot,
			path,
			staged,
			workspace: currentWorkspaceEnv(),
		}),
	gitDiffContent: (
		repoRoot: string,
		path: string,
		staged: boolean,
		originalPath?: string | null,
	) =>
		invoke<GitDiffContentResult>("git_diff_content", {
			repoRoot,
			path,
			staged,
			originalPath: originalPath ?? null,
			workspace: currentWorkspaceEnv(),
		}),
	gitStage: (repoRoot: string, paths: string[]) =>
		invoke<void>("git_stage", {
			repoRoot,
			paths,
			workspace: currentWorkspaceEnv(),
		}),
	gitUnstage: (repoRoot: string, paths: string[]) =>
		invoke<void>("git_unstage", {
			repoRoot,
			paths,
			workspace: currentWorkspaceEnv(),
		}),
	gitDiscard: (repoRoot: string, entries: GitDiscardEntry[]) =>
		invoke<void>("git_discard", {
			repoRoot,
			entries,
			workspace: currentWorkspaceEnv(),
		}),
	gitCommit: (repoRoot: string, message: string) =>
		invoke<GitCommitResult>("git_commit", {
			repoRoot,
			message,
			workspace: currentWorkspaceEnv(),
		}),
	gitFetch: (repoRoot: string) =>
		invoke<void>("git_fetch", {
			repoRoot,
			workspace: currentWorkspaceEnv(),
		}),
	gitPullFfOnly: (repoRoot: string) =>
		invoke<void>("git_pull_ff_only", {
			repoRoot,
			workspace: currentWorkspaceEnv(),
		}),
	gitPush: (repoRoot: string) =>
		invoke<GitPushResult>("git_push", {
			repoRoot,
			workspace: currentWorkspaceEnv(),
		}),
	gitPublishBranch: (repoRoot: string) =>
		invoke<GitPushResult>("git_publish_branch", {
			repoRoot,
			workspace: currentWorkspaceEnv(),
		}),
	gitLog: (repoRoot: string, options?: { limit?: number; beforeSha?: string }) =>
		invoke<GitLogEntry[]>("git_log", {
			repoRoot,
			limit: options?.limit ?? null,
			beforeSha: options?.beforeSha ?? null,
			workspace: currentWorkspaceEnv(),
		}),
	gitShowCommit: (repoRoot: string, sha: string) =>
		invoke<GitDiffResult>("git_show_commit", {
			repoRoot,
			sha,
			workspace: currentWorkspaceEnv(),
		}),
	gitCommitFiles: (repoRoot: string, sha: string) =>
		invoke<GitCommitFileChange[]>("git_commit_files", {
			repoRoot,
			sha,
			workspace: currentWorkspaceEnv(),
		}),
	gitCommitFileDiff: (
		repoRoot: string,
		sha: string,
		path: string,
		originalPath?: string | null,
	) =>
		invoke<GitDiffContentResult>("git_commit_file_diff", {
			repoRoot,
			sha,
			path,
			originalPath: originalPath ?? null,
			workspace: currentWorkspaceEnv(),
		}),
	gitRemoteUrl: (repoRoot: string, name?: string) =>
		invoke<string | null>("git_remote_url", {
			repoRoot,
			name: name ?? null,
			workspace: currentWorkspaceEnv(),
		}),
};
