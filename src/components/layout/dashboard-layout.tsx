'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { Footer } from './footer'
import { useLanguage } from '@/context/LanguageContext'
import type { TKey } from '@/lib/translations'
import type { UserRole } from '@/types'

interface DashboardLayoutProps {
  children: React.ReactNode
  role: UserRole
  userName: string
  avatarUrl?: string | null
  pageTitle: string
  showFooter?: boolean
  /** Alumno de un área: el menú solo muestra Mis cursos, documentos y perfil. */
  soloCursos?: boolean
}

export function DashboardLayout({
  children,
  role,
  userName,
  avatarUrl,
  pageTitle,
  showFooter = false,
  soloCursos = false,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { t } = useLanguage()

  // pageTitle puede ser una clave de traducción ('header.adminPortal') o un string literal
  const translatedTitle = pageTitle.includes('.')
    ? t(pageTitle as TKey)
    : pageTitle

  return (
    <div className="flex min-h-screen" style={{ background: '#0B0D11' }}>
      <Sidebar
        role={role}
        userName={userName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        soloCursos={soloCursos}
      />

      <div className="flex flex-col flex-1 min-w-0 md:ml-[260px]">
        <Header
          pageTitle={translatedTitle}
          userName={userName}
          avatarUrl={avatarUrl}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 px-2.5 py-3 sm:px-4 sm:py-4 md:p-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
        {showFooter && <Footer />}
      </div>
    </div>
  )
}
