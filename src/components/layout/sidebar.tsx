'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  BarChart3,
  Award,
  FileText,
  LogOut,
  Settings,
  X,
  User,
  CreditCard,
  FolderOpen,
  GraduationCap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EdvexLogo } from '@/components/ui/edvex-logo'
import { useLanguage } from '@/context/LanguageContext'
import type { TKey } from '@/lib/translations'
import type { UserRole } from '@/types'

interface NavItem {
  labelKey: TKey
  href:     string
  icon:     React.ElementType
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { labelKey: 'sidebar.dashboard',  href: '/admin',                icon: LayoutDashboard },
    { labelKey: 'sidebar.students',   href: '/admin/alumnos',        icon: Users           },
    { labelKey: 'sidebar.content',    href: '/admin/contenido',      icon: BookOpen        },
    { labelKey: 'sidebar.courses',    href: '/admin/cursos',         icon: GraduationCap   },
    { labelKey: 'sidebar.reports',    href: '/admin/reportes',       icon: BarChart3       },
    { labelKey: 'sidebar.settings',   href: '/admin/configuracion',  icon: Settings        },
  ],
  ALUMNO: [
    { labelKey: 'sidebar.myProgress',  href: '/alumno',               icon: LayoutDashboard },
    { labelKey: 'sidebar.mySubjects',  href: '/alumno/materias',      icon: BookOpen        },
    { labelKey: 'sidebar.myCourses',   href: '/alumno/cursos',        icon: GraduationCap   },
    { labelKey: 'sidebar.grades',      href: '/alumno/calificaciones',icon: Award           },
    { labelKey: 'sidebar.certificate', href: '/alumno/constancia',    icon: FileText        },
    { labelKey: 'sidebar.payment',     href: '/alumno/pagar',         icon: CreditCard      },
    { labelKey: 'sidebar.myDocuments', href: '/alumno/documentos',    icon: FolderOpen      },
    { labelKey: 'sidebar.myProfile',   href: '/alumno/perfil',        icon: User            },
  ],
}

const ROLE_LABEL_KEY: Record<UserRole, TKey> = {
  ADMIN:  'sidebar.admin',
  ALUMNO: 'sidebar.student',
}

interface SidebarProps {
  role:     UserRole
  userName: string
  isOpen:   boolean
  onClose:  () => void
}

export function Sidebar({ role, userName, isOpen, onClose }: SidebarProps) {
  const pathname  = usePathname()
  const router    = useRouter()
  const { t }     = useLanguage()
  const navItems  = NAV_ITEMS[role]
  const [pendientesCount, setPendientesCount] = useState(0)

  // Fetch badge de alumnos pendientes solo para admins
  useEffect(() => {
    if (role !== 'ADMIN') return
    let cancelled = false

    async function fetchCount() {
      try {
        const res = await fetch('/api/admin/alumnos/pendientes-count')
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setPendientesCount(json.count ?? 0)
      } catch {
        // silencioso — el badge no es crítico
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 60_000) // refresca cada minuto
    return () => { cancelled = true; clearInterval(interval) }
  }, [role])

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) => {
    if (href === '/admin' || href === '/alumno') return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Overlay en móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 h-screen flex flex-col transition-transform duration-300 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '260px', background: '#181C26', borderRight: '1px solid #2A2F3E' }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-5 py-5"
          style={{ borderBottom: '1px solid #2A2F3E' }}
        >
          <div className="flex items-center gap-3">
            <EdvexLogo size={36} innerFill="#181C26" />
            <div>
              <p
                className="text-sm font-bold leading-none"
                style={{
                  background:           'linear-gradient(130deg, #1ad9ff 0%, #0055ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor:  'transparent',
                }}
              >
                EDVEX
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: '#2a3d5a', letterSpacing: '3px', textTransform: 'uppercase' }}
              >
                Academy
              </p>
            </div>
          </div>

          {/* Botón cerrar (móvil) */}
          <button
            type="button"
            onClick={onClose}
            className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg touch-manipulation active:bg-white/10"
            style={{ color: '#94A3B8' }}
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon   = item.icon
            const active = isActive(item.href)
            const isAlumnos = item.href === '/admin/alumnos'
            const showBadge = isAlumnos && pendientesCount > 0
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium transition-all duration-150 touch-manipulation active:opacity-90"
                style={{
                  color:      active ? '#F1F5F9' : '#94A3B8',
                  background: active ? 'rgba(0,85,255,0.2)' : 'transparent',
                  borderLeft: active ? '3px solid #0055ff' : '3px solid transparent',
                }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{t(item.labelKey)}</span>
                {showBadge && (
                  <span
                    className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
                    style={{ background: '#EF4444', color: '#fff' }}
                  >
                    {pendientesCount > 99 ? '99+' : pendientesCount}
                  </span>
                )}
              </Link>
            )
          })}

          <div
            className="mt-2 pt-3 border-t"
            style={{ borderColor: '#2A2F3E' }}
          >
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium transition-all duration-150 touch-manipulation text-red-400 hover:text-red-300 hover:bg-red-500/10 active:bg-red-500/15"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {t('sidebar.signOut')}
            </button>
          </div>
        </nav>

        {/* Footer usuario */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid #2A2F3E' }}>
          <div className="flex items-center gap-3 px-2">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 text-xs font-bold"
              style={{ background: '#0055ff', color: '#fff' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>
                {userName}
              </p>
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'rgba(0,85,255,0.2)', color: '#1ad9ff' }}
              >
                {t(ROLE_LABEL_KEY[role])}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
