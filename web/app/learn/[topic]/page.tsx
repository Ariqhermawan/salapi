import { notFound } from "next/navigation";
import LearnArticleScreen from "@/components/screens/LearnArticleScreen";
import { LEARN_TOPICS, type LearnTopicId } from "@/lib/learn-content";

export const metadata = { title: "Learn · Salapi" };

export default async function LearnArticlePage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  if (!LEARN_TOPICS.includes(topic as LearnTopicId)) notFound();
  return <LearnArticleScreen topic={topic as LearnTopicId} />;
}
