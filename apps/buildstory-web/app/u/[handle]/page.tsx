import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileFollowButton } from "@/components/profile-follow-button";
import { getCreatorSession } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";
import { getFollowState, getProfileByHandle } from "@/lib/social/store";

type PageProps = { params: Promise<{ handle: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle).catch(() => null);
  return { title: profile ? `@${profile.handle}` : "Profile not found" };
}

export default async function ProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle).catch(() => null);
  if (!profile) notFound();
  const creator = await getCreatorSession();
  const viewer = creator ? await ensureUser(creator).catch(() => null) : null;
  const follow = await getFollowState(profile.id, viewer?.id ?? null).catch(() => ({ followerCount: profile.followerCount, followingCount: profile.followingCount, isFollowedByViewer: false }));
  return <section className="profile-page section-wrap"><div className="profile-card"><span className="avatar avatar--large">{profile.displayName.slice(0, 1).toUpperCase()}</span><span className="section-index">( BUILDER PROFILE )</span><h1>{profile.displayName}</h1><p className="profile-card__handle">@{profile.handle}</p>{profile.bio ? <p>{profile.bio}</p> : <p>AI-assisted software builder.</p>}<div className="profile-card__stats"><span><strong>{profile.storyCount}</strong> stories</span><span><strong>{follow.followerCount}</strong> followers</span><span><strong>{profile.followingCount}</strong> following</span></div><ProfileFollowButton handle={profile.handle} initialFollowed={follow.isFollowedByViewer} isSelf={viewer?.id === profile.id} /></div></section>;
}
