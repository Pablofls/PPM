import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AdminRoute } from './auth/AdminRoute'
import { ScreenRoute } from './auth/ScreenRoute'
import { AuthProvider } from './auth/AuthProvider'
import { PermissionsProvider } from './auth/PermissionsProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { StudentRoute } from './auth/StudentRoute'
import { AppShell } from './layouts/AppShell'
import { GroupProvider } from './layouts/GroupProvider'
import { HomeShell } from './layouts/HomeShell'
import { StudentShell } from './layouts/StudentShell'
import { BehaviorPage } from './pages/modulo1/BehaviorPage'
import { DemographicsPage } from './pages/modulo1/DemographicsPage'
import { InterestsPage } from './pages/modulo1/InterestsPage'
import { PersonalityPage } from './pages/modulo1/PersonalityPage'
import { SkillsPage } from './pages/modulo1/SkillsPage'
import { ValuesPage } from './pages/modulo1/ValuesPage'
import { CompaniesPage } from './pages/apendices/CompaniesPage'
import { InternshipsPage } from './pages/apendices/InternshipsPage'
import { ProfilePage } from './pages/alumno/ProfilePage'
import { StudentHome } from './pages/alumno/StudentHome'
import { WeeklyLogPage } from './pages/alumno/WeeklyLogPage'
import { IndeedPage } from './pages/modulo2/IndeedPage'
import { ReflectionPage } from './pages/modulo2/ReflectionPage'
import { DeadlinesPage } from './pages/admin/DeadlinesPage'
import { GroupPickerPage } from './pages/GroupPickerPage'
import { MyProfilePage } from './pages/MyProfilePage'
import { GroupsPage } from './pages/admin/GroupsPage'
import { UsersPage } from './pages/admin/UsersPage'
import { RegisteredStudentsPage } from './pages/admin/RegisteredStudentsPage'
import { SubmissionStatusPage } from './pages/admin/SubmissionStatusPage'
import { weeklyFormByCode } from './lib/catalog'

/**
 * Rutas del panel. Solo Módulo 1 y Módulo 2 en esta iteración
 * (regla «Alcance de las pantallas» de CLAUDE.md).
 *
 * Todo el panel cuelga de ProtectedRoute: no hay una sola ruta accesible sin
 * sesión y sin rol admin (regla «Toda pantalla nace protegida y admin-only»).
 *
 * `/alumno` es la otra mitad: la vista del alumno, con su propia guardia y su
 * propio marco. No cuelga del AppShell porque el rail es la navegación del
 * profesor.
 *
 * Las rutas están en español porque el profesor puede compartirlas o guardarlas
 * como marcador.
 */
export default function App() {
  return (
    <AuthProvider>
      <PermissionsProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/alumno"
              element={
                <StudentRoute>
                  <StudentShell />
                </StudentRoute>
              }
            >
              <Route index element={<StudentHome />} />

              <Route path="perfil" element={<ProfilePage />} />

              {/* Las dos bitácoras comparten pantalla: solo cambian sus campos. */}
              <Route
                path="reporte-de-busqueda"
                element={<WeeklyLogPage form={weeklyFormByCode('form_busqueda')} />}
              />
              <Route
                path="reporte-de-practicas"
                element={<WeeklyLogPage form={weeklyFormByCode('form_practicas')} />}
              />

              <Route path="*" element={<Navigate to="/alumno" replace />} />
            </Route>

            {/*
              «Mis grupos» y el panel comparten el grupo elegido, así que el
              GroupProvider envuelve a los dos. «Mis grupos» va fuera del
              AppShell: es la puerta de entrada, todavía sin rail.
            */}
            <Route
              element={
                <ProtectedRoute>
                  <GroupProvider>
                    <Outlet />
                  </GroupProvider>
                </ProtectedRoute>
              }
            >
              {/* Afuera de un grupo: Mis grupos y el menú Configuración. */}
              <Route element={<HomeShell />}>
                <Route path="mis-grupos" element={<GroupPickerPage />} />
                <Route path="mi-perfil" element={<MyProfilePage />} />
                <Route path="configuracion">
                  <Route
                    path="alumnos-registrados"
                    element={
                      <ScreenRoute screen="alumnos_registrados">
                        <RegisteredStudentsPage />
                      </ScreenRoute>
                    }
                  />
                  <Route
                    path="grupos"
                    element={
                      <ScreenRoute screen="grupos">
                        <GroupsPage />
                      </ScreenRoute>
                    }
                  />
                  <Route
                    path="usuarios"
                    element={
                      <AdminRoute>
                        <UsersPage />
                      </AdminRoute>
                    }
                  />
                </Route>
              </Route>

              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/modulo1/datos-demograficos" replace />} />

                <Route path="modulo1">
                  <Route path="datos-demograficos" element={<DemographicsPage />} />
                  <Route path="intereses-profesionales" element={<InterestsPage />} />
                  <Route path="personalidad" element={<PersonalityPage />} />
                  <Route path="estilos-de-comportamiento" element={<BehaviorPage />} />
                  <Route path="habilidades" element={<SkillsPage />} />
                  <Route path="valores" element={<ValuesPage />} />
                </Route>

                <Route path="modulo2">
                  {/* Los cuatro comparten la tabla `reflections` y el mismo componente. */}
                  <Route path="analisis-foda" element={<ReflectionPage formCode="form2_1" />} />
                  <Route path="curriculum-vitae" element={<ReflectionPage formCode="form2_2" />} />
                  <Route path="cover-letter" element={<ReflectionPage formCode="form2_4" />} />
                  <Route path="elevator-pitch" element={<ReflectionPage formCode="form2_5" />} />
                  <Route path="indeed" element={<IndeedPage />} />
                </Route>

                <Route path="apendice-a">
                  <Route path="carta-de-aceptacion" element={<InternshipsPage />} />
                </Route>

                <Route path="apendice-b">
                  <Route path="formulario-de-inicio" element={<CompaniesPage />} />
                </Route>

                <Route path="entregas">
                  <Route path="estado-de-entregas" element={<SubmissionStatusPage />} />
                  <Route
                    path="fechas-de-entrega"
                    element={
                      <ScreenRoute screen="fechas_entrega">
                        <DeadlinesPage />
                      </ScreenRoute>
                    }
                  />
                </Route>

                {/* Rutas viejas: siguen funcionando si alguien las guardó. */}
                <Route path="administrador">
                  <Route path="panel" element={<Navigate to="/entregas/fechas-de-entrega" replace />} />
                  <Route
                    path="alumnos-registrados"
                    element={<Navigate to="/configuracion/alumnos-registrados" replace />}
                  />
                  <Route path="grupos" element={<Navigate to="/configuracion/grupos" replace />} />
                </Route>

                <Route path="*" element={<Navigate to="/modulo1/datos-demograficos" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </PermissionsProvider>
    </AuthProvider>
  )
}
