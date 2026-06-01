import type {
  GitBranchSnapshot,
  GitLocalBranch,
  GitRemoteBranch,
} from "@/lib/native";

export type BranchSearchResults = {
  localBranches: GitLocalBranch[];
  remoteBranches: GitRemoteBranch[];
  exactLocalMatch: GitLocalBranch | null;
  exactRemoteMatch: GitRemoteBranch | null;
  canCreateBranch: boolean;
  normalizedQuery: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function localBranchMatches(branch: GitLocalBranch, query: string): boolean {
  if (!query) return true;
  const name = branch.name.toLowerCase();
  const upstream = branch.upstream?.toLowerCase() ?? "";
  return name.includes(query) || upstream.includes(query);
}

function remoteBranchMatches(branch: GitRemoteBranch, query: string): boolean {
  if (!query) return true;
  const name = branch.name.toLowerCase();
  const shortName = branch.shortName.toLowerCase();
  const remote = branch.remote.toLowerCase();
  return (
    name.includes(query) || shortName.includes(query) || remote.includes(query)
  );
}

function branchNameTaken(snapshot: GitBranchSnapshot | null, rawQuery: string): boolean {
  const query = rawQuery.trim();
  if (!snapshot || !query) return false;
  return (
    snapshot.localBranches.some((branch) => branch.name === query) ||
    snapshot.remoteBranches.some(
      (branch) => branch.name === query || branch.shortName === query,
    )
  );
}

export function searchBranches(
  snapshot: GitBranchSnapshot | null,
  query: string,
): BranchSearchResults {
  const normalizedQuery = normalize(query);
  const localBranches = (snapshot?.localBranches ?? []).filter((branch) =>
    localBranchMatches(branch, normalizedQuery),
  );
  const remoteBranches = (snapshot?.remoteBranches ?? []).filter((branch) =>
    remoteBranchMatches(branch, normalizedQuery),
  );
  const exactLocalMatch =
    snapshot?.localBranches.find(
      (branch) => branch.name.toLowerCase() === normalizedQuery,
    ) ?? null;
  const exactRemoteMatch =
    snapshot?.remoteBranches.find(
      (branch) =>
        branch.name.toLowerCase() === normalizedQuery ||
        branch.shortName.toLowerCase() === normalizedQuery,
    ) ?? null;

  return {
    localBranches,
    remoteBranches,
    exactLocalMatch,
    exactRemoteMatch,
    canCreateBranch:
      query.trim().length > 0 && !branchNameTaken(snapshot, query),
    normalizedQuery,
  };
}
