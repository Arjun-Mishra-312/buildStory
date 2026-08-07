import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { parseGithubRepoUrl } from "@/lib/github/repo-url";
import {
  ensureUser,
  getIdentityForUser,
  getProjectForVerification,
  markProjectRepoVerified,
} from "@/lib/ingestion/store";
import { repositoryFingerprintFromRemote } from "@/lib/repository-fingerprint";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

type RouteContext = { params: Promise<{ projectId: string }> };

type GithubRepoResponse = {
  private: boolean;
  html_url: string;
  owner?: { id?: number };
};

export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);

    const { projectId } = await context.params;
    const user = await ensureUser(creator);
    await checkRateLimit("repo_verify", creator.creatorId, 10, 3_600, request);

    const body = (await request.json().catch(() => null)) as { repoUrl?: unknown } | null;
    const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
    if (!repoUrl) return jsonError("invalid_repo_url", "repoUrl is required.", 422);

    const parsed = parseGithubRepoUrl(repoUrl);
    if (!parsed) {
      return jsonError("invalid_repo_url", "Only https://github.com/<owner>/<repo> URLs are supported.", 422);
    }

    // Ownership + not_found check up front, before any GitHub call or identity lookup.
    const project = await getProjectForVerification(creator.creatorId, projectId);

    const identity = await getIdentityForUser(user.id, "github");
    if (!identity) {
      return jsonError(
        "github_not_linked",
        "Sign in with GitHub at least once to link an account before verifying a repository.",
        409,
      );
    }

    if (project.fingerprintBasis !== "canonical-remote") {
      return jsonError(
        "project_not_remote_scanned",
        "This project wasn't scanned with a Git remote configured, so it can't be matched to a repository.",
        422,
      );
    }

    const githubResponse = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "buildstory" },
    });
    if (githubResponse.status === 404) {
      return jsonError("repo_not_found", "That repository could not be found on GitHub, or it's private.", 404);
    }
    if (!githubResponse.ok) {
      return jsonError("github_unavailable", "GitHub did not respond. Try again shortly.", 502);
    }
    const repo = (await githubResponse.json()) as GithubRepoResponse;

    if (repo.private) {
      return jsonError("private_repo_unsupported", "Only public repositories can be verified right now.", 422);
    }
    if (!repo.owner?.id || String(repo.owner.id) !== identity.subject) {
      return jsonError("repo_owner_mismatch", "Your linked GitHub account doesn't own this repository.", 403);
    }

    const remoteFingerprint = await repositoryFingerprintFromRemote(repo.html_url);
    if (!remoteFingerprint || remoteFingerprint !== project.repositoryFingerprint) {
      return jsonError(
        "fingerprint_mismatch",
        "This repository doesn't match what was scanned for this project.",
        409,
      );
    }

    const result = await markProjectRepoVerified(creator.creatorId, projectId);
    return Response.json(
      { verifiedRepoAt: result.verifiedRepoAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
