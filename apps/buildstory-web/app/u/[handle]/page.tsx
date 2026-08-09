import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileFollowButton } from "@/components/profile-follow-button";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { getCreatorSession } from "@/lib/auth/runtime";
import { ensureUser, listStoriesByOwner } from "@/lib/ingestion/store";
import { getFollowState, getProfileByHandle, listFollowers, listFollowing } from "@/lib/social/store";
import { builderRoleLabel } from "@/lib/identity/builder-roles";

type PageProps = { params: Promise<{ handle: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle).catch(() => null);
  const title = profile ? `@${profile.handle}` : "Profile not found";
  const description = profile?.bio || undefined;
  const ogImage = `/api/og/profile/${encodeURIComponent(handle)}`;
  const pageUrl = `/u/${encodeURIComponent(handle)}`;
  const imageAlt = profile ? `@${profile.handle} on Buildstory` : "Buildstory — Every build has a story.";
  return {
    title,
    description,
    openGraph: {
      type: "profile",
      title,
      description,
      url: pageUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: imageAlt, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle).catch(() => null);
  if (!profile) notFound();
  const creator = await getCreatorSession();
  const viewer = creator ? await ensureUser(creator).catch(() => null) : null;
  const follow = await getFollowState(profile.id, viewer?.id ?? null).catch(() => ({ followerCount: profile.followerCount, followingCount: profile.followingCount, isFollowedByViewer: false }));
  const stories = await listStoriesByOwner(profile.id, 30).catch(() => []);
  const followers = await listFollowers(profile.id, 20).catch(() => []);
  const following = await listFollowing(profile.id, 20).catch(() => []);
  return (
    <section className="profile-page section-wrap">
      <div className="profile-card profile-card--balanced">
        <span className="avatar avatar--large">{profile.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="section-index">( BUILDER PROFILE )</span>
        <h1>{profile.displayName}{profile.plan === "pro" ? <span className="plan-badge">Pro</span> : null}</h1>
        <p className="profile-card__handle">@{profile.handle}</p>
        {profile.builderRole ? <p className="profile-card__role">{builderRoleLabel(profile.builderRole)}</p> : null}
        {profile.bio ? <p>{profile.bio}</p> : <p>AI-assisted software builder.</p>}
        <div className="profile-card__stats">
          <span><strong>{profile.storyCount}</strong> stories</span>
          <span><strong>{follow.followerCount}</strong> followers</span>
          <span><strong>{follow.followingCount ?? profile.followingCount}</strong> following</span>
        </div>
        <ProfileFollowButton handle={profile.handle} initialFollowed={follow.isFollowedByViewer} isSelf={viewer?.id === profile.id} />
        {viewer?.id === profile.id ? (
          <div className="profile-card__owner-actions" aria-label="Profile owner actions">
            <Link className="button button--secondary button--small" href="/studio/settings">Edit profile</Link>
            <Link className="button button--secondary button--small" href="/studio/projects">Manage projects</Link>
            <Link className="button button--primary button--small" href="/studio/connect">Create story</Link>
          </div>
        ) : null}
      </div>
      <div className="profile-stories">
        <span className="section-index">( PUBLISHED STORIES )</span>
        {stories.length === 0 ? (
          <div className="profile-stories__empty profile-stories__empty--illustrated" role="status">
            <div className="profile-stories__empty-art"><EditorialIllustration kind="profile-first-story" /></div>
            <p>No published stories yet.</p>
          </div>
        ) : (
          <ul>
            {stories.map((story) => (
                <li className="profile-stories__item" key={story.slug}>
                <Link href={`/u/${profile.handle}/${story.slug}`}>
                  <div><span className="profile-story-card__category">{story.category.replaceAll("-", " ")}</span><h3>{story.name}</h3>{story.tagline ? <p>{story.tagline}</p> : null}</div>
                  <span className="profile-story-card__arrow" aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="profile-people">
        <div>
          <span className="section-index">( FOLLOWERS )</span>
          {followers.length === 0 ? (
            <p className="profile-stories__empty">No followers yet.</p>
          ) : (
            <ul className="profile-people__list">
              {followers.map((person) => (
                <li key={person.id}>
                  <Link href={`/u/${person.handle}`}>@{person.handle}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <span className="section-index">( FOLLOWING )</span>
          {following.length === 0 ? (
            <p className="profile-stories__empty">Not following anyone yet.</p>
          ) : (
            <ul className="profile-people__list">
              {following.map((person) => (
                <li key={person.id}>
                  <Link href={`/u/${person.handle}`}>@{person.handle}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
