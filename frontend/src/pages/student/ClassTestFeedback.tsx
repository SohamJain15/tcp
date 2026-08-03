import { Navigate, useParams } from "react-router-dom";

import { classTestApi } from "@/api/services";
import { FeedbackForm } from "@/components/FeedbackForm";

/**
 * Class test feedback, asked as soon as the student submits.
 *
 * Unlike contests, feedback does not gate anything here — class-test marks are released when
 * faculty publish them — so the wording promises nothing it cannot deliver.
 */
export default function ClassTestFeedback() {
  const { id = "" } = useParams();
  const pathname = `/student/class-tests/${id}/feedback`;

  if (!id) {
    return <Navigate to="/student/class-tests" replace />;
  }

  return (
    <FeedbackForm
      pathname={pathname}
      getStatus={() => classTestApi.getFeedbackStatus(id, pathname)}
      submit={(payload) => classTestApi.submitFeedback(id, payload, pathname)}
      statusQueryKey={["class-test-feedback-status", id]}
      invalidateQueryKey={["my-class-test", id]}
      backTo={`/student/class-tests/${id}`}
      backLabel="Back to class test"
      surfaceLabel="class test"
      introSuffix=", and it helps us fix what got in your way."
      successMessage="Thanks! Your feedback has been recorded."
    />
  );
}
