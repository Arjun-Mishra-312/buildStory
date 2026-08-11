import type { Metadata } from "next";
import { MarketingLanding } from "@/components/marketing/landing";

export const metadata: Metadata = { title: "About Buildstory", description: "How Buildstory turns AI-assisted build history into a private report of facts, patterns, and turning points." };

export default function AboutPage() { return <MarketingLanding />; }
