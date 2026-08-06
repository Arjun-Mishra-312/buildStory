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

type StoreBackend = {
  // These modules expose parallel implementations with intentionally identical
  // function names; the contract keeps the adapter boundary dynamic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingestion: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  social: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: Record<string, any>;
  seed: () => Promise<Fixture>;
};

async function rejectsCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: { code?: string }) => error?.code === code);
}

export function runStoreContract(name: string, backend: StoreBackend) {
  test(`${name}: shared ingestion, social, and account contract`, async () => {
    const { ingestion, social, account } = backend;
    const fixture = await backend.seed();

    const owner = await ingestion.ensureUser(fixture.ownerSession);
    assert.equal(owner.id, fixture.ownerUserId, "ensureUser keeps the existing owner identity");
    assert.equal((await ingestion.ensureUser(fixture.ownerSession)).handle, fixture.ownerHandle, "handles are sticky");

    const follower = await ingestion.ensureUser(fixture.followerSession);
    assert.equal(follower.id, fixture.followerUserId, "second creator is provisioned");

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
    await social.deleteComment(comment.id, fixture.followerUserId, "member");
    const deleted = (await social.listComments(fixture.reportId)).find((item: { id: string }) => item.id === comment.id);
    assert.equal(deleted?.body, "", "deleted comment bodies are not returned");

    const filed = await social.fileContentReport(fixture.followerUserId, "report", fixture.reportId, "other", "Please review this note.");
    assert.equal((await social.listContentReports("open")).some((item: { id: string }) => item.id === filed.id), true);
    await social.resolveContentReport(filed.id, "actioned", fixture.ownerUserId);
    assert.equal((await social.listContentReports("actioned")).some((item: { id: string }) => item.id === filed.id), true);

    const publicStory = await ingestion.getPublishedStory(fixture.ownerHandle, fixture.reportSlug);
    assert.equal(publicStory?.reportId, fixture.reportId, "canonical publication lookup is owner-scoped");
    assert.equal((await ingestion.listPublishedStories(1)).length, 1, "published story list honors its limit");
    assert.equal((await ingestion.searchPublishedStories("mina", 10)).length >= 1, true, "search only returns public projections");

    const exported = await account.exportAccountData(fixture.ownerUserId);
    assert.equal(exported.profile.id, fixture.ownerUserId);
    assert.equal(exported.reports.some((item: { id: string }) => item.id === fixture.reportId), true);
    await rejectsCode(() => ingestion.getReport(fixture.followerSession.creatorId, fixture.reportId), "not_found");

    await ingestion.unpublishReport(fixture.ownerSession.creatorId, fixture.reportId);
    assert.equal(await ingestion.getPublishedStory(fixture.ownerHandle, fixture.reportSlug), null, "unpublish removes the canonical page");
    await ingestion.publishReport(fixture.ownerSession.creatorId, fixture.reportId);
    assert.equal((await ingestion.getPublishedStory(fixture.ownerHandle, fixture.reportSlug))?.reportId, fixture.reportId, "republish restores the canonical page");
  });
}
