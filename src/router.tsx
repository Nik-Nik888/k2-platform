import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@modules/core/components/AppLayout';
import { ProtectedRoute } from '@modules/core/components/ProtectedRoute';
import { AuthPage } from '@modules/core/pages/AuthPage';
import { DashboardPage } from '@modules/core/pages/DashboardPage';
import { SettingsPage } from '@modules/core/pages/SettingsPage';
import { CrmPage } from '@modules/crm/pages/CrmPage';
import { VisualizerPage } from '@modules/visualizer3d/pages/VisualizerPage';
import { GlazingPage } from '@modules/glazing/pages/GlazingPage';
import { CalculatorPage } from '@modules/calculator/pages/CalculatorPage';
import { EstimatesPage } from '@modules/estimates/pages/EstimatesPage';
import { WarehousePage } from '@modules/warehouse/pages/WarehousePage';
import { MaterialsPage } from '@modules/materials/pages/MaterialsPage';
import { CabinetPage } from '@modules/cabinet/pages/CabinetPage';
import { BillingPage } from '@modules/billing/pages/BillingPage';
import InstallmentsPage from '@modules/installments/InstallmentsPage';
import InstallmentDetailPage from '@modules/installments/InstallmentDetailPage';

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
      { path: 'visualizer', element: <VisualizerPage /> },
      { path: 'glazing', element: <GlazingPage /> },
      { path: 'calculator', element: <CalculatorPage /> },
      { path: 'calculator/:orderId', element: <CalculatorPage /> },
      { path: 'estimates', element: <EstimatesPage /> },
      { path: 'warehouse', element: <WarehousePage /> },
      { path: 'materials', element: <MaterialsPage /> },
      { path: 'cabinet', element: <CabinetPage /> },
      { path: 'installments', element: <InstallmentsPage /> },
      { path: 'installments/:id', element: <InstallmentDetailPage /> },
      { path: 'billing', element: <BillingPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
