import { Navigate, useParams } from "react-router-dom";

import { contestsApi } from "@/api/services";
import { FeedbackForm } from "@/components/FeedbackForm";

/**
 * Contest feedback. The questionnaire itself lives in `FeedbackForm`, shared with class tests;
 * only the endpoints and the wording about what submitting unlocks differ.
 */
export default function ContestFeedback() {
  const { id = "" } = useParams();
  const pathname = `/student/contests/${id}/feedback`;

  if (!id) {
    return <Navigate to="/student/contests" replace />;
  }

  return (
    <FeedbackForm
      pathname={pathname}
      getStatus={() => contestsApi.getFeedbackStatus(id, pathname)}
      submit={(payload) => contestsApi.submitFeedback(id, payload, pathname)}
      statusQueryKey={["contest-feedback-status", id]}
      invalidateQueryKey={["contest-detail", id]}
      backTo={`/student/contests/${id}`}
      backLabel="Back to contest"
      surfaceLabel="contest"
      introSuffix=", and submitting it unlocks your Report Card and the published standings."
      successMessage="Thanks! Your feedback unlocks your results."
    />
  );
}
