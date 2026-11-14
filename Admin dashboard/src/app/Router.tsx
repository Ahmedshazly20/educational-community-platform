import { createBrowserRouter } from 'react-router-dom';
import { RouteGuard } from './RouteGuard';
import { AppLayout } from './AppLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { UnauthorizedPage } from '../features/auth/UnauthorizedPage';
import { NotFoundPage } from '../features/auth/NotFoundPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ContentBrowserPage } from '../features/content/ContentBrowserPage';
import { LessonEditorPage } from '../features/content/LessonEditorPage';
import { AcademicPage } from '../features/academic/AcademicPage';
import { StudentsListPage } from '../features/students/StudentsListPage';
import { StudentDetailPage } from '../features/students/StudentDetailPage';
import { PricingMatrixPage } from '../features/pricing/PricingMatrixPage';
import { SubscriptionsPage } from '../features/pricing/SubscriptionsPage';
import { PaymentsPage } from '../features/payments/PaymentsPage';
import { ExamsListPage } from '../features/exams/ExamsListPage';
import { ExamBuilderPage } from '../features/exams/ExamBuilderPage';
import { ExamDetailPage } from '../features/exams/ExamDetailPage';
import { GradingPage } from '../features/grading/GradingPage';
import { ResultsPage } from '../features/grading/ResultsPage';
import { AnnouncementsPage } from '../features/announcements/AnnouncementsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { StaffPage } from '../features/staff/StaffPage';
import { AuditLogPage } from '../features/audit/AuditLogPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { YearEndPage } from '../features/year-end/YearEndPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />,
  },
  {
    path: '/',
    element: (
      <RouteGuard>
        <AppLayout />
      </RouteGuard>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'content', element: <ContentBrowserPage /> },
      { path: 'content/lessons/:id', element: <LessonEditorPage /> },
      { path: 'academic', element: <AcademicPage /> },
      { path: 'students', element: <StudentsListPage /> },
      { path: 'students/:id', element: <StudentDetailPage /> },
      { path: 'pricing', element: <PricingMatrixPage /> },
      { path: 'subscriptions', element: <SubscriptionsPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'exams', element: <ExamsListPage /> },
      { path: 'exams/new', element: <ExamBuilderPage /> },
      { path: 'exams/:id/edit', element: <ExamBuilderPage /> },
      { path: 'exams/:id/monitor', element: <ExamDetailPage mode="monitor" /> },
      { path: 'exams/:id/stats', element: <ExamDetailPage mode="stats" /> },
      { path: 'grading', element: <GradingPage /> },
      { path: 'results', element: <ResultsPage /> },
      { path: 'announcements', element: <AnnouncementsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'staff', element: <StaffPage /> },
      { path: 'audit', element: <AuditLogPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'year-end', element: <YearEndPage /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
