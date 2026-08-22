import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RoleRoute } from "@/components/RoleRoute";
import { FeatureComingSoon } from "@/components/FeatureComingSoon";
import { CLASS_TESTS_ENABLED, LABS_ENABLED } from "@/lib/feature-flags";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import StudentDashboard from "./pages/student/Dashboard.tsx";
import StudentProblems from "./pages/student/Problems.tsx";
import ProblemDetail from "./pages/student/ProblemDetail.tsx";
import StudentLeaderboard from "./pages/student/Leaderboard.tsx";
import StudentProfile from "./pages/student/Profile.tsx";
import Contests from "./pages/student/Contests.tsx";
import ContestDetail from "./pages/student/ContestDetail.tsx";
import ContestFeedback from "./pages/student/ContestFeedback.tsx";
import ContestQuestionPage from "./pages/student/ContestQuestionPage.tsx";
import CompleteProfile from "./pages/student/CompleteProfile.tsx";
import StudentClassTests from "./pages/student/ClassTests.tsx";
import ClassTestAttempt from "./pages/student/ClassTestAttempt.tsx";
import ClassTestFeedback from "./pages/student/ClassTestFeedback.tsx";
import FacultyClassTests from "./pages/faculty/ClassTests.tsx";
import CreateClassTest from "./pages/faculty/CreateClassTest.tsx";
import ClassTestDetail from "./pages/faculty/ClassTestDetail.tsx";
import StudentLabs from "./pages/student/Labs.tsx";
import LabDetail from "./pages/student/LabDetail.tsx";
import StudentLabSessions from "./pages/student/LabSessions.tsx";
import LabSessionAttempt from "./pages/student/LabSessionAttempt.tsx";
import FacultyLabs from "./pages/faculty/Labs.tsx";
import CreateLab from "./pages/faculty/CreateLab.tsx";
import FacultyLabSessions from "./pages/faculty/LabSessions.tsx";
import CreateLabSession from "./pages/faculty/CreateLabSession.tsx";
import LabSessionDetail from "./pages/faculty/LabSessionDetail.tsx";
import AdminDashboard from "./pages/admin/Dashboard.tsx";
import AdminDepartment from "./pages/admin/Department.tsx";
import AdminStudentDetail from "./pages/admin/StudentDetail.tsx";
import AdminLeaderboard from "./pages/admin/Leaderboard.tsx";
import AdminProfile from "./pages/admin/Profile.tsx";
import FacultyDashboard from "./pages/faculty/Dashboard.tsx";
import FacultyDepartment from "./pages/faculty/Department.tsx";
import FacultyDepartmentStudent from "./pages/faculty/DepartmentStudent.tsx";
import CreateProblem from "./pages/faculty/CreateProblem.tsx";
import CreateContest from "./pages/faculty/CreateContest.tsx";
import FacultyContests from "./pages/faculty/Contests.tsx";
import FacultyContestDetail from "./pages/faculty/ContestDetail.tsx";
import ManageProblems from "./pages/faculty/ManageProblems.tsx";
import ProblemDetails from "./pages/faculty/ProblemDetails.tsx";
import EditProblem from "./pages/faculty/EditProblem.tsx";
import FacultySubmissions from "./pages/faculty/Submissions.tsx";
import FacultyLeaderboard from "./pages/faculty/Leaderboard.tsx";
import FacultyProfile from "./pages/faculty/Profile.tsx";

const queryClient = new QueryClient();

/**
 * Class Tests are feature-flagged off while the feature is finished.
 *
 * The real pages stay wired up and compiled — only what renders changes — so shipping is a matter of
 * flipping `CLASS_TESTS_ENABLED` in lib/feature-flags.ts. Every route is covered, not just the two
 * landing pages, so a bookmarked deep link cannot slip past the placeholder.
 */
function classTestElement(page: JSX.Element): JSX.Element {
  return CLASS_TESTS_ENABLED ? (
    page
  ) : (
    <FeatureComingSoon
      title="Class Tests"
      description="Class Tests are under development and will be rolled out soon. Problems, contests and the leaderboard are unaffected."
    />
  );
}

function labElement(page: JSX.Element): JSX.Element {
  return LABS_ENABLED ? (
    page
  ) : (
    <FeatureComingSoon
      title="Labs"
      description="Labs are under development and will be rolled out soon. Problems, contests and class tests are unaffected."
    />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/student/dashboard" element={<RoleRoute allowedRole="STUDENT"><StudentDashboard /></RoleRoute>} />
            <Route path="/student/problems" element={<RoleRoute allowedRole="STUDENT"><StudentProblems /></RoleRoute>} />
            <Route path="/student/problems/:id" element={<RoleRoute allowedRole="STUDENT"><ProblemDetail /></RoleRoute>} />
            <Route path="/student/contests" element={<RoleRoute allowedRole="STUDENT"><Contests /></RoleRoute>} />
            <Route path="/student/contests/:id" element={<RoleRoute allowedRole="STUDENT"><ContestDetail /></RoleRoute>} />
            <Route path="/student/contests/:id/feedback" element={<RoleRoute allowedRole="STUDENT"><ContestFeedback /></RoleRoute>} />
            <Route path="/student/contests/:id/questions/:questionId" element={<RoleRoute allowedRole="STUDENT"><ContestQuestionPage /></RoleRoute>} />
            <Route path="/student/leaderboard" element={<RoleRoute allowedRole="STUDENT"><StudentLeaderboard /></RoleRoute>} />
            <Route path="/student/profile" element={<RoleRoute allowedRole="STUDENT"><StudentProfile /></RoleRoute>} />
            <Route path="/student/class-tests" element={<RoleRoute allowedRole="STUDENT">{classTestElement(<StudentClassTests />)}</RoleRoute>} />
            <Route path="/student/class-tests/:id/feedback" element={<RoleRoute allowedRole="STUDENT">{classTestElement(<ClassTestFeedback />)}</RoleRoute>} />
            <Route path="/student/class-tests/:id" element={<RoleRoute allowedRole="STUDENT">{classTestElement(<ClassTestAttempt />)}</RoleRoute>} />
            <Route path="/student/labs" element={<RoleRoute allowedRole="STUDENT">{labElement(<StudentLabs />)}</RoleRoute>} />
            <Route path="/student/labs/:id" element={<RoleRoute allowedRole="STUDENT">{labElement(<LabDetail />)}</RoleRoute>} />
            <Route path="/student/lab-sessions" element={<RoleRoute allowedRole="STUDENT">{labElement(<StudentLabSessions />)}</RoleRoute>} />
            <Route path="/student/lab-sessions/:id" element={<RoleRoute allowedRole="STUDENT">{labElement(<LabSessionAttempt />)}</RoleRoute>} />
            <Route path="/complete-profile" element={<RoleRoute allowedRole={["STUDENT", "FACULTY"]}><CompleteProfile /></RoleRoute>} />
            <Route path="/faculty/dashboard" element={<RoleRoute allowedRole="FACULTY"><FacultyDashboard /></RoleRoute>} />
            <Route path="/faculty/department" element={<RoleRoute allowedRole="FACULTY"><FacultyDepartment /></RoleRoute>} />
            <Route path="/faculty/department/students/:email" element={<RoleRoute allowedRole="FACULTY"><RouteErrorBoundary><FacultyDepartmentStudent /></RouteErrorBoundary></RoleRoute>} />
            <Route path="/faculty/class-tests" element={<RoleRoute allowedRole="FACULTY">{classTestElement(<FacultyClassTests />)}</RoleRoute>} />
            <Route path="/faculty/class-tests/create" element={<RoleRoute allowedRole="FACULTY">{classTestElement(<CreateClassTest />)}</RoleRoute>} />
            <Route path="/faculty/class-tests/:id/edit" element={<RoleRoute allowedRole="FACULTY">{classTestElement(<CreateClassTest />)}</RoleRoute>} />
            <Route path="/faculty/class-tests/:id" element={<RoleRoute allowedRole="FACULTY">{classTestElement(<ClassTestDetail />)}</RoleRoute>} />
            <Route path="/faculty/labs" element={<RoleRoute allowedRole="FACULTY">{labElement(<FacultyLabs />)}</RoleRoute>} />
            <Route path="/faculty/labs/create" element={<RoleRoute allowedRole="FACULTY">{labElement(<CreateLab />)}</RoleRoute>} />
            <Route path="/faculty/labs/:id/edit" element={<RoleRoute allowedRole="FACULTY">{labElement(<CreateLab />)}</RoleRoute>} />
            <Route path="/faculty/lab-sessions" element={<RoleRoute allowedRole="FACULTY">{labElement(<FacultyLabSessions />)}</RoleRoute>} />
            <Route path="/faculty/lab-sessions/create" element={<RoleRoute allowedRole="FACULTY">{labElement(<CreateLabSession />)}</RoleRoute>} />
            <Route path="/faculty/lab-sessions/:id" element={<RoleRoute allowedRole="FACULTY">{labElement(<LabSessionDetail />)}</RoleRoute>} />
            <Route path="/faculty/students/:email" element={<RoleRoute allowedRole="FACULTY"><StudentProfile /></RoleRoute>} />
            <Route path="/faculty/create-problem" element={<RoleRoute allowedRole="FACULTY"><CreateProblem /></RoleRoute>} />
            <Route path="/faculty/create-contest" element={<RoleRoute allowedRole="FACULTY"><CreateContest /></RoleRoute>} />
            <Route path="/faculty/contests" element={<RoleRoute allowedRole="FACULTY"><FacultyContests /></RoleRoute>} />
            <Route path="/faculty/contests/:id" element={<RoleRoute allowedRole="FACULTY"><FacultyContestDetail /></RoleRoute>} />
            <Route path="/faculty/contests/:id/edit" element={<RoleRoute allowedRole="FACULTY"><CreateContest /></RoleRoute>} />
            <Route path="/faculty/problems" element={<RoleRoute allowedRole="FACULTY"><ManageProblems /></RoleRoute>} />
            <Route path="/faculty/problems/:id" element={<RoleRoute allowedRole="FACULTY"><RouteErrorBoundary><ProblemDetails /></RouteErrorBoundary></RoleRoute>} />
            <Route path="/faculty/problems/:id/edit" element={<RoleRoute allowedRole="FACULTY"><RouteErrorBoundary><EditProblem /></RouteErrorBoundary></RoleRoute>} />
            <Route path="/faculty/submissions" element={<RoleRoute allowedRole="FACULTY"><FacultySubmissions /></RoleRoute>} />
            <Route path="/faculty/leaderboard" element={<RoleRoute allowedRole="FACULTY"><FacultyLeaderboard /></RoleRoute>} />
            <Route path="/faculty/profile" element={<RoleRoute allowedRole="FACULTY"><FacultyProfile /></RoleRoute>} />

            {/* Institute leadership: read-only analytics across every department. */}
            <Route path="/admin/dashboard" element={<RoleRoute allowedRole="ADMIN"><AdminDashboard /></RoleRoute>} />
            <Route path="/admin/departments/:department" element={<RoleRoute allowedRole="ADMIN"><RouteErrorBoundary><AdminDepartment /></RouteErrorBoundary></RoleRoute>} />
            <Route path="/admin/departments/:department/students/:email" element={<RoleRoute allowedRole="ADMIN"><RouteErrorBoundary><AdminStudentDetail /></RouteErrorBoundary></RoleRoute>} />
            <Route path="/admin/leaderboard" element={<RoleRoute allowedRole="ADMIN"><AdminLeaderboard /></RoleRoute>} />
            <Route path="/admin/profile" element={<RoleRoute allowedRole="ADMIN"><AdminProfile /></RoleRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
