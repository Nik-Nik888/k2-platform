import { lazy, Suspense, type ReactElement } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@modules/core/components/AppLayout';
import { ProtectedRoute } from '@modules/core/components/ProtectedRoute';
import { AuthPage } from '@modules/core/pages/AuthPage';
import { DashboardPage } from '@modules/core/pages/DashboardPage';
import { SettingsPage } from '@modules/core/pages/SettingsPage';
import { CrmPage } from '@modules/crm/pages/CrmPage';

// ═════════════════════════════════════════════════════════════════
// Ленивые чанки — модули грузятся только при переходе на страницу.
// Главный бандл (shell + core + crm + dashboard) остаётся небольшим.
// Cabinet (Three.js, ~1MB) тянется только при открытии /cabinet.
// ═════════════════════════════════════════════════════════════════
const VisualizerPage = lazy(() => import('@modules/visualizer3d/pages/VisualizerPage').then(m => ({ default: m.VisualizerPage })));
const GlazingPage = lazy(() => import('@modules/glazing/pages/GlazingPage').then(m => ({ default: m.GlazingPage })));
const GlazingTestPage = lazy(() => import('@modules/glazing/pages/GlazingTestPage').then(m => ({ default: m.GlazingTestPage })));
const CalculatorPage = lazy(() => import('@modules/calculator/pages/CalculatorPage').then(m => ({ default: m.CalculatorPage })));
const EstimatesPage = lazy(() => import('@modules/estimates/pages/EstimatesPage').then(m => ({ default: m.EstimatesPage })));
const WarehousePage = lazy(() => import('@modules/warehouse/pages/WarehousePage').then(m => ({ default: m.WarehousePage })));
const MaterialsPage = lazy(() => import('@modules/materials/pages/MaterialsPage').then(m => ({ default: m.MaterialsPage })));
const ReferencePage = lazy(() => import('@modules/reference/pages/ReferencePage').then(m => ({ default: m.ReferencePage })));
const CabinetPage = lazy(() => import('@modules/cabinet/pages/CabinetPage').then(m => ({ default: m.CabinetPage })));
const CabinetListPage = lazy(() => import('@modules/cabinet/pages/CabinetListPage').then(m => ({ default: m.CabinetListPage })));
const BillingPage = lazy(() => import('@modules/billing/pages/BillingPage').then(m => ({ default: m.BillingPage })));
const InstallmentsPage = lazy(() => import('@modules/installments/InstallmentsPage'));
const InstallmentDetailPage = lazy(() => import('@modules/installments/InstallmentDetailPage'));

// Простой fallback пока чанк грузится
const Loading = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: '#666', fontSize: 14,
    fontFamily: "'IBM Plex Mono', monospace",
  }}>
    Загрузка…
  </div>
);
const L = (el: ReactElement) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <AuthPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'crm', element: <CrmPage /> },
      { path: 'visualizer', element: L(<VisualizerPage />) },
      { path: 'glazing', element: L(<GlazingPage />) },
      { path: 'glazing-test', element: L(<GlazingTestPage />) },
      { path: 'calculator', element: L(<CalculatorPage />) },
      { path: 'calculator/:orderId', element: L(<CalculatorPage />) },
      { path: 'estimates', element: L(<EstimatesPage />) },
      { path: 'warehouse', element: L(<WarehousePage />) },
      { path: 'materials', element: L(<MaterialsPage />) },
      { path: 'reference', element: L(<ReferencePage />) },
      { path: 'cabinet', element: L(<CabinetPage />) },
      { path: 'cabinet/list', element: L(<CabinetListPage />) },
      { path: 'cabinet/:id', element: L(<CabinetPage />) },
      { path: 'installments', element: L(<InstallmentsPage />) },
      { path: 'installments/:id', element: L(<InstallmentDetailPage />) },
      { path: 'billing', element: L(<BillingPage />) },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
