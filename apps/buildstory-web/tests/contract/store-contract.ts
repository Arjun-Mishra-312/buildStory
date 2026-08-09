import assert from "node:assert/strict";
import test from "node:test";

type Session = { creatorId: string; name: string; email: string; image: string | null };

type Fixture = {
  ownerSession: Session;
  ownerUserId: string;
  ownerHandle: string;
  followerSession: Session;
  followerUserId: string;
  reportId: string;
  reportSlug: string;
  projectId: string;
};

type MemoryR2BucketLike = { put(key: string, value: Uint8Array): Promise<unknown>; has(key: string): boolean; size(): number };

type StoreBackend = {
  // These modules expose parallel implementations with intentionally identical
  // function names; the contract keeps the adapter boundary dynamic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingestion: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  social: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: Record<string, any>;
  /** The same fake R2 bucket the test file wired up via __setR2ForTests, so this contract can assert on its contents directly. */
  r2Bucket: MemoryR2BucketLike;
  seed: () => Promise<Fixture>;
};

// Wrapped in an async closure so a synchronously-throwing action (mock-store's
// updateReport/addReportMedia/deleteReportMedia are plain functions, not async)
// still produces a promise rejection for assert.rejects to catch - a bare sync
// throw from a non-async `action` propagates immediately instead of rejecting.
async function rejectsCode(action: () => unknown, code: string) {
  await assert.rejects(async () => action(), (error: { code?: string }) => error?.code === code);
}

export function runStoreContract(name: string, backend: StoreBackend) {
  test(`${name}: shared ingestion, social, and account contract`, async () => {
    const { ingestion, social, account, r2Bucket } = backend;
    const fixture = await backend.seed();

    const owner = await ingestion.ensureUser(fixture.ownerSession);
    assert.equal(owner.id, fixture.ownerUserId, "ensureUser keeps the existing owner identity");
    assert.equal((await ingestion.ensureUser(fixture.ownerSession)).handle, fixture.ownerHandle, "handles are sticky");

    const follower = await ingestion.ensureUser(fixture.followerSession);
    assert.equal(follower.id, fixture.followerUserId, "second creator is provisioned");

    assert.equal(await ingestion.findUserByIdentity("github", "gh-unlinked-subject"), null, "unknown identity resolves to nothing");
    await ingestion.linkIdentity(fixture.ownerUserId, "github", "gh-owner-subject", fixture.ownerSession.email);
    const byIdentity = await ingestion.findUserByIdentity("github", "gh-owner-subject");
    assert.equal(byIdentity?.authSubject, fixture.ownerSession.creatorId, "a linked identity resolves back to the owner's original authSubject");
    await ingestion.linkIdentity(fixture.ownerUserId, "github", "gh-owner-subject", fixture.ownerSession.email);
    assert.equal((await ingestion.findUserByIdentity("github", "gh-owner-subject"))?.userId, fixture.ownerUserId, "linking the same identity twice is idempotent");

    const byEmail = await ingestion.findUserByVerifiedEmail(fixture.ownerSession.email.toUpperCase());
    assert.equal(byEmail?.authSubject, fixture.ownerSession.creatorId, "verified-email lookup is case-insensitive and matches the owner");
    assert.equal(await ingestion.findUserByVerifiedEmail("nobody-with-this-email@buildstory.local"), null, "no match for an unknown email");

    await ingestion.markEmailVerified(fixture.ownerUserId);

    assert.equal((await ingestion.getIdentityForUser(fixture.ownerUserId, "github"))?.subject, "gh-owner-subject", "the owner's linked github subject is resolvable by userId");
    assert.equal(await ingestion.getIdentityForUser(fixture.followerUserId, "github"), null, "a user with no linked github identity resolves to nothing");

    assert.deepEqual(await social.followUser(fixture.followerUserId, fixture.ownerUserId), { followed: true });
    assert.deepEqual(await social.followUser(fixture.followerUserId, fixture.ownerUserId), { followed: false }, "follow is idempotent");
    assert.equal((await social.getFollowState(fixture.ownerUserId, fixture.followerUserId)).isFollowedByViewer, true);

    const reaction = await social.setReaction(fixture.reportId, fixture.followerUserId, "fire");
    assert.equal(reaction.viewerReaction, "fire");
    const reactionAgain = await social.setReaction(fixture.reportId, fixture.followerUserId, "fire");
    assert.equal(reactionAgain.viewerReaction, null, "same reaction toggles off");
    const notifications = await social.listNotifications(fixture.ownerUserId);
    assert.equal(notifications.filter((item: { kind: string }) => item.kind === "reaction").length, 1, "reaction notification is deduplicated");

    const comment = await social.createComment(fixture.reportId, fixture.followerUserId, "A useful public note", null);
    const reply = await social.createComment(fixture.reportId, fixture.ownerUserId, "Thanks for the context", comment.id);
    assert.equal(reply.parentCommentId, comment.id);
    assert.equal((await social.listComments(fixture.reportId, 1)).length, 1, "comment reads are bounded");
    assert.deepEqual(await social.setCommentUpvote(comment.id, fixture.ownerUserId, true), { upvoteCount: 1, viewerHasUpvoted: true });
    assert.deepEqual(await social.setCommentUpvote(comment.id, fixture.ownerUserId, true), { upvoteCount: 1, viewerHasUpvoted: true }, "comment upvotes are idempotent");
    assert.equal((await social.getCommentViewerState(fixture.reportId, fixture.ownerUserId)).upvotedCommentIds.includes(comment.id), true);
    await social.deleteComment(comment.id, fixture.followerUserId, "member");
    const deleted = (await social.listComments(fixture.reportId)).find((item: { id: string }) => item.id === comment.id);
    assert.equal(deleted?.body, "", "deleted comment bodies are not returned");
    await rejectsCode(() => social.setCommentUpvote(comment.id, fixture.ownerUserId, true), "not_found");

    const filed = await social.fileContentReport(fixture.followerUserId, "report", fixture.reportId, "other", "Please review this note.");
    assert.equal((await social.listContentReports("open")).some((item: { id: string }) => item.id === filed.id), true);
    await social.resolveContentReport(filed.id, "actioned", fixture.ownerUserId);
    assert.equal((await social.listContentReports("actioned")).some((item: { id: string }) => item.id === filed.id), true);

    const publicStory = await ingestion.getPublishedStory(fixture.ownerHandle, fixture.reportSlug);
    assert.equal(publicStory?.reportId, fixture.reportId, "canonical publication lookup is owner-scoped");
    assert.equal((await ingestion.listPublishedStories(1)).length, 1, "published story list honors its limit");
    assert.equal((await ingestion.searchPublishedStories("mina", 10)).length >= 1, true, "search only returns public projections");
    const publicModelId = publicStory.models[0]?.id;
    assert.equal(typeof publicModelId, "string");
    const explored = await ingestion.explorePublishedStories({ category: publicStory.category, models: [publicModelId] });
    assert.equal(explored.stories.some((item: { reportId?: string }) => item.reportId === fixture.reportId), true, "Explore filters the public index by category and model id");
    assert.equal(explored.facets.models.reduce((sum: number, item: { requestShare: number }) => sum + item.requestShare, 0), 100, "public model-call shares total 100%");

    const peopleResults = await social.searchProfiles(fixture.ownerHandle, 10);
    assert.equal(peopleResults.some((item: { id: string }) => item.id === fixture.ownerUserId), true, "people search matches by handle");

    const ownerStories = await ingestion.listStoriesByOwner(fixture.ownerUserId);
    assert.equal(ownerStories.length, 1, "owner's story list returns their published story");
    assert.equal((await social.getProfileByHandle(fixture.ownerHandle)).storyCount, ownerStories.length, "profile story counts reflect published canonical stories");
    assert.equal(ownerStories[0].slug, fixture.reportSlug, "owner story list projects the same public slug");
    assert.equal((await ingestion.listStoriesByOwner(fixture.followerUserId)).length, 0, "owner story list is scoped to the requested owner");

    const unverifiedProject = await ingestion.getProjectForVerification(fixture.ownerSession.creatorId, fixture.projectId);
    assert.equal(unverifiedProject.verifiedRepoAt, null, "a project starts unverified");
    await rejectsCode(
      () => ingestion.getProjectForVerification(fixture.followerSession.creatorId, fixture.projectId),
      "not_found",
    );
    assert.equal(await ingestion.getPublicProjectVerification(fixture.ownerHandle, fixture.reportSlug), null, "public verification read is null before verifying");
    const verified = await ingestion.markProjectRepoVerified(fixture.ownerSession.creatorId, fixture.projectId);
    assert.equal(typeof verified.verifiedRepoAt, "string");
    assert.equal((await ingestion.getProjectForVerification(fixture.ownerSession.creatorId, fixture.projectId)).verifiedRepoAt, verified.verifiedRepoAt);
    assert.equal(await ingestion.getPublicProjectVerification(fixture.ownerHandle, fixture.reportSlug), verified.verifiedRepoAt, "the public read reflects the same verification once set");

    const exported = await account.exportAccountData(fixture.ownerUserId);
    assert.equal(exported.profile.id, fixture.ownerUserId);
    assert.equal(exported.reports.some((item: { id: string }) => item.id === fixture.reportId), true);
    // The scan data itself must be in the export, not just report metadata -
    // it's the most personal thing Buildstory holds and was previously
    // missing here even though Settings promised "scanner records". The
    // seeded Orbit Notes fixture predates source-snapshot storage on the
    // mock-store backend (sourceSnapshot: null there by design), so this
    // only asserts the export entry exists and is correctly keyed - the
    // d1-store backend's own seed carries a real snapshot and is asserted
    // more strongly by narrative.test.ts and account.test.ts.
    const exportedScan = exported.scans.find((item: { reportId: string }) => item.reportId === fixture.reportId);
    assert.ok(exportedScan, "export includes a scan entry for the seeded report");
    assert.equal(exported.uploadSessions.length > 0, true, "export includes upload session history");
    await rejectsCode(() => ingestion.getReport(fixture.followerSession.creatorId, fixture.reportId), "not_found");

    await rejectsCode(() => ingestion.updateReport(fixture.ownerSession.creatorId, fixture.reportId, { category: "not-a-category" }), "invalid_category");
    await ingestion.unpublishReport(fixture.ownerSession.creatorId, fixture.reportId);
    assert.equal(await ingestion.getPublishedStory(fixture.ownerHandle, fixture.reportSlug), null, "unpublish removes the canonical page");
    assert.equal((await ingestion.explorePublishedStories({ query: fixture.reportSlug })).stories.length, 0, "unpublish removes the story from the public Explore index");
    await ingestion.updateReport(fixture.ownerSession.creatorId, fixture.reportId, { category: null });
    await rejectsCode(() => ingestion.publishReport(fixture.ownerSession.creatorId, fixture.reportId), "missing_category");
    await ingestion.updateReport(fixture.ownerSession.creatorId, fixture.reportId, { category: "web-apps" });
    await ingestion.publishReport(fixture.ownerSession.creatorId, fixture.reportId);
    assert.equal((await ingestion.getPublishedStory(fixture.ownerHandle, fixture.reportSlug))?.reportId, fixture.reportId, "republish restores the canonical page");

    // Editing a report (artifact links, media) intentionally demotes a published report to
    // draft_changes - exercised last, after the unpublish/republish flow above, so it doesn't
    // interfere with that flow's own published-state assertions.
    const updatedArtifact = await ingestion.updateReport(fixture.ownerSession.creatorId, fixture.reportId, {
      artifact: { projectUrl: "https://example.com/app", repoUrl: "https://github.com/example/app" },
    });
    assert.equal(updatedArtifact.artifact.projectUrl, "https://example.com/app");
    assert.equal(updatedArtifact.artifact.repoUrl, "https://github.com/example/app");
    await rejectsCode(
      () => ingestion.updateReport(fixture.ownerSession.creatorId, fixture.reportId, { artifact: { videoUrl: "not-a-url" } }),
      "invalid_artifact_url",
    );

    const media1 = await ingestion.addReportMedia(fixture.ownerSession.creatorId, fixture.reportId, {
      r2Key: `${fixture.reportId}/a.png`,
      contentType: "image/png",
      byteSize: 1024,
      kind: "cover",
    });
    assert.equal(media1.url, `/media/${fixture.reportId}/a.png`);
    assert.equal((await ingestion.listReportMedia(fixture.reportId)).length, 1, "media is listed for its report");
    await ingestion.deleteReportMedia(fixture.ownerSession.creatorId, media1.id);
    assert.equal((await ingestion.listReportMedia(fixture.reportId)).length, 0, "deleted media no longer lists");

    // Account deletion must be the last thing this contract does with the fixture, since it
    // permanently removes the owner and everything they own. Uploads a real object into the
    // fake R2 bucket the test file wired up, so this can assert the object - not just the D1/
    // memory metadata row - is gone afterward: the exact privacy gap deleteAccount must close.
    const media2 = await ingestion.addReportMedia(fixture.ownerSession.creatorId, fixture.reportId, {
      r2Key: `${fixture.reportId}/before-deletion.png`,
      contentType: "image/png",
      byteSize: 4,
      kind: "screenshot",
    });
    await r2Bucket.put(media2.r2Key, new Uint8Array([1, 2, 3, 4]));
    assert.equal(r2Bucket.has(media2.r2Key), true, "sanity check: the object exists before account deletion");
    const exportedBeforeDeletion = await account.exportAccountData(fixture.ownerUserId);
    assert.equal(exportedBeforeDeletion.media.some((item: { id: string }) => item.id === media2.id), true, "export includes uploaded media");

    await account.deleteAccount(fixture.ownerUserId);
    assert.equal(r2Bucket.has(media2.r2Key), false, "deleting the account also deletes the R2 object, not just its metadata row");
    await rejectsCode(() => account.exportAccountData(fixture.ownerUserId), "not_found");
  });
}
