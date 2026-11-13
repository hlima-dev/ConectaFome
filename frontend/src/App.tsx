import { Navigate, Route, Routes } from 'react-router-dom'
import { PrivateRoute } from './routes/PrivateRoute'
import { RoleRoute } from './routes/RoleRoute'
import { AppLayout } from './layouts/AppLayout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { DonorsPage } from './pages/donors/DonorsPage'
import { RecipientsPage } from './pages/recipients/RecipientsPage'
import { DonationsPage } from './pages/donations/DonationsPage'
import { DonationDetailPage } from './pages/donations/DonationDetailPage'
import { ReceiptPage } from './pages/donations/ReceiptPage'
import { OpportunitiesPage } from './pages/donations/OpportunitiesPage'
import { VolunteersPage } from './pages/logistics/VolunteersPage'
import { VehiclesPage } from './pages/logistics/VehiclesPage'
import { PickupRoutesPage } from './pages/logistics/PickupRoutesPage'
import { PickupRouteFormPage } from './pages/logistics/PickupRouteFormPage'
import { PickupRouteDetailPage } from './pages/logistics/PickupRouteDetailPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { ForgotPassword } from './pages/ForgotPassword'
import { FieldPage } from './pages/field/FieldPage'
import { VerifyReceipt } from './pages/VerifyReceipt'
import { ResetPassword } from './pages/ResetPassword'

function App() {
  return (
    <Routes>
      <Route path="/inicio" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/verificar/:code/:signature" element={<VerifyReceipt />} />
      <Route path="/coleta/:token" element={<FieldPage />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="doadores"
          element={
            <RoleRoute roles={['ADMIN']}>
              <DonorsPage />
            </RoleRoute>
          }
        />
        <Route
          path="receptores"
          element={
            <RoleRoute roles={['ADMIN']}>
              <RecipientsPage />
            </RoleRoute>
          }
        />
        <Route
          path="oportunidades"
          element={
            <RoleRoute roles={['RECEPTOR']}>
              <OpportunitiesPage />
            </RoleRoute>
          }
        />
        <Route path="doacoes" element={<DonationsPage />} />
        <Route path="doacoes/:id" element={<DonationDetailPage />} />
        <Route
          path="doacoes/:id/comprovante"
          element={
            <RoleRoute roles={['ADMIN', 'DOADOR']}>
              <ReceiptPage />
            </RoleRoute>
          }
        />
        <Route
          path="voluntarios"
          element={
            <RoleRoute roles={['ADMIN']}>
              <VolunteersPage />
            </RoleRoute>
          }
        />
        <Route
          path="veiculos"
          element={
            <RoleRoute roles={['ADMIN']}>
              <VehiclesPage />
            </RoleRoute>
          }
        />
        <Route
          path="rotas"
          element={
            <RoleRoute roles={['ADMIN']}>
              <PickupRoutesPage />
            </RoleRoute>
          }
        />
        <Route
          path="rotas/nova"
          element={
            <RoleRoute roles={['ADMIN']}>
              <PickupRouteFormPage />
            </RoleRoute>
          }
        />
        <Route
          path="rotas/:id"
          element={
            <RoleRoute roles={['ADMIN']}>
              <PickupRouteDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="relatorios"
          element={
            <RoleRoute roles={['ADMIN']}>
              <ReportsPage />
            </RoleRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
