import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RoleRoute } from "@/components/RoleRoute";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import StudentDashboard from "./pages/student/Dashboard.tsx";
import StudentProblems from "./pages/student/Problems.tsx";
import ProblemDetail from "./pages/student/ProblemDetail.tsx";
import StudentLeaderboard from "./pages/student/Leaderboard.tsx";
import StudentProfile from "./pages/student/Profile.tsx";
import Contests from "./pages/student/Contests.tsx";
import ContestDetail from "./pages/student/ContestDetail.tsx";
import ContestCodingWorkspace from "./pages/student/ContestCodingWorkspace.tsx";
import CompleteProfile from "./pages/student/CompleteProfile.tsx";
import FacultyDashboard from "./pages/faculty/Dashboard.tsx";
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
            <Route path="/student/contests/:id/questions/:questionId" element={<RoleRoute allowedRole="STUDENT"><ContestCodingWorkspace /></RoleRoute>} />
            <Route path="/student/leaderboard" element={<RoleRoute allowedRole="STUDENT"><StudentLeaderboard /></RoleRoute>} />
            <Route path="/student/profile" element={<RoleRoute allowedRole="STUDENT"><StudentProfile /></RoleRoute>} />
            <Route path="/complete-profile" element={<RoleRoute allowedRole={["STUDENT", "FACULTY"]}><CompleteProfile /></RoleRoute>} />
            <Route path="/faculty/dashboard" element={<RoleRoute allowedRole="FACULTY"><FacultyDashboard /></RoleRoute>} />
            <Route path="/faculty/students/:email" element={<RoleRoute allowedRole="FACULTY"><StudentProfile /></RoleRoute>} />
            <Route path="/faculty/create-problem" element={<RoleRoute allowedRole="FACULTY"><CreateProblem /></RoleRoute>} />
            <Route path="/faculty/create-contest" element={<RoleRoute allowedRole="FACULTY"><CreateContest /></RoleRoute>} />
            <Route path="/faculty/contests" element={<RoleRoute allowedRole="FACULTY"><FacultyContests /></RoleRoute>} />
            <Route path="/faculty/contests/:id" element={<RoleRoute allowedRole="FACULTY"><FacultyContestDetail /></RoleRoute>} />
            <Route path="/faculty/contests/:id/edit" element={<RoleRoute allowedRole="FACULTY"><CreateContest /></RoleRoute>} />
            <Route path="/faculty/problems" element={<RoleRoute allowedRole="FACULTY"><ManageProblems /></RoleRoute>} />
            <Route path="/faculty/problems/:id" element={<RoleRoute allowedRole="FACULTY"><ProblemDetails /></RoleRoute>} />
            <Route path="/faculty/problems/:id/edit" element={<RoleRoute allowedRole="FACULTY"><EditProblem /></RoleRoute>} />
            <Route path="/faculty/submissions" element={<RoleRoute allowedRole="FACULTY"><FacultySubmissions /></RoleRoute>} />
            <Route path="/faculty/leaderboard" element={<RoleRoute allowedRole="FACULTY"><FacultyLeaderboard /></RoleRoute>} />
            <Route path="/faculty/profile" element={<RoleRoute allowedRole="FACULTY"><FacultyProfile /></RoleRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
