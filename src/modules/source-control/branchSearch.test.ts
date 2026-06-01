import { describe, expect, it } from "vitest";
import { searchBranches } from "./branchSearch";

const snapshot = {
  current: "main",
  localBranches: [
    { name: "main", current: true, upstream: "origin/main" },
    { name: "feature/local", current: false, upstream: null },
  ],
  remoteBranches: [
    {
      name: "origin/main",
      remote: "origin",
      shortName: "main",
    },
    {
      name: "origin/feature/remote",
      remote: "origin",
      shortName: "feature/remote",
    },
  ],
};

describe("searchBranches", () => {
  it("filters local and remote branches by query", () => {
    const result = searchBranches(snapshot, "feature");

    expect(result.localBranches.map((branch) => branch.name)).toEqual([
      "feature/local",
    ]);
    expect(result.remoteBranches.map((branch) => branch.name)).toEqual([
      "origin/feature/remote",
    ]);
  });

  it("detects exact matches and blocks duplicate branch creation", () => {
    const result = searchBranches(snapshot, "main");

    expect(result.exactLocalMatch?.name).toBe("main");
    expect(result.exactRemoteMatch?.name).toBe("origin/main");
    expect(result.canCreateBranch).toBe(false);
  });

  it("allows creating a new branch when the query is unused", () => {
    const result = searchBranches(snapshot, "feature/new");

    expect(result.exactLocalMatch).toBeNull();
    expect(result.exactRemoteMatch).toBeNull();
    expect(result.canCreateBranch).toBe(true);
  });
});
