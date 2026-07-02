import { InterviewReport } from "@/components/InterviewReport";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InterviewReportPage({ params }: Props) {
  const { id } = await params;
  return <InterviewReport interviewId={id} />;
}
