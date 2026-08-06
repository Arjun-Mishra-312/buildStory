import type { Metadata } from "next";
import { MarketingLanding } from "@/components/marketing/landing";

export const metadata: Metadata = { title: "About Buildstory", description: "Why Buildstory keeps the decisions behind software in the story." };

export default function AboutPage() { return <MarketingLanding />; }
