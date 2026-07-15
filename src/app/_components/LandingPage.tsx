'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { trackAgendarLlamada, trackCrearCuenta } from '@/lib/metaPixel'
import '../landing.css'

type Lang = 'es' | 'en'

const CAL_URL = 'https://cal.com/soluciones-academicas/asesoria-edvex-academy-30-min'

const PlatformMockup = () => (
  <div className="mock-browser">
    <div className="mock-bar">
      <div className="mock-dots">
        <span className="mock-dot r" /><span className="mock-dot y" /><span className="mock-dot g" />
      </div>
      <div className="mock-url">edvex.academy/alumno</div>
    </div>
    <div className="mock-body">
      <div className="mock-sidebar">
        <div className="mock-sb-head">
          <div className="mock-sb-logo" />
          <span style={{ fontSize: 9, color: '#7B8AFF', fontWeight: 700 }}>EDVEX</span>
        </div>
        {['Dashboard', 'Mis Materias', 'Progreso', 'Pagos'].map((item, i) => (
          <div key={item} className={`mock-nav-item${i === 0 ? ' active' : ''}`}>{item}</div>
        ))}
      </div>
      <div className="mock-main">
        <div className="mock-welcome-card">
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>Bienvenido 👋</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>María García</div>
          <div style={{ fontSize: 9, color: '#64748B', marginTop: 2 }}>Matrícula: EDV-2025-0042</div>
          <div className="mock-prog-wrap">
            <div className="mock-prog-fill" style={{ width: '50%' }} />
          </div>
          <div style={{ fontSize: 8, color: '#64748B', marginTop: 3 }}>Progreso: 3/6 meses · 50%</div>
          <div className="mock-ring">
            <svg viewBox="0 0 36 36" style={{ width: 36, height: 36, transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#5B6CFF" strokeWidth="2.5"
                strokeDasharray="48.7 97.4" strokeLinecap="round" />
            </svg>
            <span style={{ position: 'absolute', fontSize: 8, fontWeight: 700, color: '#7B8AFF' }}>50%</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: '#64748B', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meses del Programa</div>
        <div className="mock-months-grid">
          {[1,2,3,4,5,6].map(n => (
            <div key={n} className={`mock-month ${n <= 3 ? 'open' : 'closed'}`}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{n}</span>
              <span style={{ fontSize: 7 }}>{n <= 3 ? 'Abierto' : '🔒'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)


const LogoSvg = ({ id }: { id: string }) => (
  <svg viewBox="0 0 60 60" fill="none">
    <polygon points="30,3 55,17 55,43 30,57 5,43 5,17" fill="none" stroke={`url(#${id})`} strokeWidth="2.5" />
    <circle cx="30" cy="30" r="7" fill={`url(#${id})`} />
    <circle cx="30" cy="30" r="3.5" fill="#050c18" />
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1ad9ff" />
        <stop offset="100%" stopColor="#0044ee" />
      </linearGradient>
    </defs>
  </svg>
)

export default function LandingPage() {
  const router = useRouter()
  const [lang, setLang] = useState<Lang>('es')
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const handleRegisterClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    trackCrearCuenta()
    setTimeout(() => {
      router.push('/register')
    }, 300)
  }

  const handleCalClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    trackAgendarLlamada()
    setTimeout(() => {
      window.open(CAL_URL, '_blank')
    }, 300)
  }

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`edvex-landing${lang === 'en' ? ' lang-en' : ''}`}>

      {/* ── NAV ── */}
      <nav>
        <div className="nav-logo">
          <LogoSvg id="ng" />
          <div>
            <div className="nav-logo-text">EDVEX</div>
            <div className="nav-logo-sub">Academy</div>
          </div>
        </div>
        <div className="nav-right">
          <div className="lang-toggle">
            <button
              className={`lang-btn${lang === 'es' ? ' active' : ''}`}
              onClick={() => setLang('es')}
            >ES</button>
            <button
              className={`lang-btn${lang === 'en' ? ' active' : ''}`}
              onClick={() => setLang('en')}
            >EN</button>
          </div>
          <a href="#planes" className="btn-ingresar btn-ver-planes">
            <span className="es">Ver Planes</span>
            <span className="en">View Plans</span>
          </a>
          <Link href="/register" className="btn-ingresar nav-btn-register" onClick={handleRegisterClick}>
            <span className="es">Regístrate</span>
            <span className="en">Sign up</span>
          </Link>
          <Link href="/login" className="btn-ingresar">Ingresar</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />

        <div className="hero-inner">
          {/* LEFT: text content */}
          <div className="hero-left">
            <div className="hero-badge">
              <span className="badge-dot" />
              <span className="es">🎓 Válida en México y USA · 100% Online</span>
              <span className="en">🎓 Valid in Mexico &amp; USA · 100% Online</span>
            </div>

            <h1 className="hero-title">
              <span className="es"><span className="grad">Tu Prepa</span><br />en 6 meses</span>
              <span className="en"><span className="grad">Your Diploma</span><br />in 6 months</span>
            </h1>

            <p className="hero-sub">
              <span className="es">
                Sin ir a la escuela. Sin examen final. Desde tu celular o PC.<br />
                <strong>Certificado reconocido en universidades de México y USA.</strong>
              </span>
              <span className="en">
                No classroom. No final exam. From your phone or PC.<br />
                <strong>Certificate recognized at universities in Mexico &amp; USA.</strong>
              </span>
            </p>

            <div className="hero-btns">
              <Link href="/register" className="btn-wa" style={{ background: 'linear-gradient(135deg, #0044ee 0%, #1ad9ff 100%)', gap: '10px' }} onClick={handleRegisterClick}>
                <span className="es">Crear mi cuenta gratis →</span>
                <span className="en">Create my free account →</span>
              </Link>
              <a href={CAL_URL} target="_blank" rel="noopener noreferrer" className="btn-cal" onClick={handleCalClick}>
                <span className="es">📅 Prefiero agendar una videollamada gratis</span>
                <span className="en">📅 I&apos;d rather schedule a free video call</span>
              </a>
            </div>

            <div className="flags">
              <div className="flag-pill">
                🇲🇽{' '}
                <span className="es">Ciudadanos Mexicanos</span>
                <span className="en">Mexican Citizens</span>
              </div>
              <span className="flag-sep">+</span>
              <div className="flag-pill">
                🇺🇸{' '}
                <span className="es">Ciudadanos Americanos</span>
                <span className="en">American Citizens</span>
              </div>
            </div>

            <div className="hero-stats">
              <div className="stat">
                <div className="stat-num">6</div>
                <div className="stat-label">
                  <span className="es">Meses Prepa</span>
                  <span className="en">Months Diploma</span>
                </div>
              </div>
              <div className="stat">
                <div className="stat-num">3</div>
                <div className="stat-label">
                  <span className="es">Meses Express</span>
                  <span className="en">Months Express</span>
                </div>
              </div>
              <div className="stat">
                <div className="stat-num">$150</div>
                <div className="stat-label">
                  <span className="es">USD / Mes</span>
                  <span className="en">USD / Month</span>
                </div>
              </div>
              <div className="stat">
                <div className="stat-num">100%</div>
                <div className="stat-label">
                  <span className="es">En Línea</span>
                  <span className="en">Online</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: platform mockup */}
          <div className="hero-right">
            <PlatformMockup />
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <div className="trust-bar">
        {[
          { num: '100%', es: 'En línea · sin salón de clases', en: 'Online · no classroom' },
          { num: '6 / 3', es: 'Meses para terminar', en: 'Months to finish' },
          { num: '$150', es: 'USD/mes · plan regular', en: 'USD/month · regular plan' },
          { num: 'MX+USA', es: 'Certificado válido en 2 países', en: 'Certificate valid in 2 countries' },
        ].map((item, i) => (
          <div className="trust-item" key={i}>
            <div className="trust-num">{item.num}</div>
            <div className="trust-label">
              <span className="es">{item.es}</span>
              <span className="en">{item.en}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── BENEFICIOS ── */}
      <section className="benefits">
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div className="tag-line">
            <span className="es">Por qué EDVEX</span>
            <span className="en">Why EDVEX</span>
          </div>
          <h2 className="sec-title">
            <span className="es">Todo lo que necesitas,<br />nada de lo que no</span>
            <span className="en">Everything you need,<br />nothing you don&apos;t</span>
          </h2>
          <p className="sec-sub">
            <span className="es">Diseñado para que termines. Sin excusas, sin complicaciones.</span>
            <span className="en">Designed for you to finish. No excuses, no complications.</span>
          </p>
        </div>

        <div className="benefits-grid">
          {[
            {
              icon: '📱', color: '#0055ff',
              es: { title: 'Desde tu celular o PC', desc: 'Estudia cuando quieras, donde quieras. Sin horarios fijos, sin trasladarte.' },
              en: { title: 'From your phone or PC', desc: 'Study whenever you want, wherever you are. No fixed schedules, no commuting.' },
            },
            {
              icon: '🚫', color: '#ef4444',
              es: { title: 'Sin examen final', desc: 'Nada de exámenes CENEVAL ni trámites complicados. Tu certificado es por actividades completadas.' },
              en: { title: 'No final exam', desc: 'No CENEVAL exams or complicated paperwork. Your certificate is based on completed activities.' },
            },
            {
              icon: '⚡', color: '#f59e0b',
              es: { title: '6 meses o 3 meses Express', desc: 'Elige tu ritmo. Programa regular en 6 meses o acelera al doble con el track Express en solo 3 meses.' },
              en: { title: '6 months or 3 months Express', desc: 'Choose your pace. Regular 6-month program or double the speed with Express track in just 3 months.' },
            },
            {
              icon: '🎓', color: '#10b981',
              es: { title: 'Certificado reconocido', desc: 'Certificado con validez para continuar en universidades de México y Estados Unidos.' },
              en: { title: 'Recognized certificate', desc: 'Certificate valid to continue at universities in Mexico and the United States.' },
            },
            {
              icon: '🌎', color: '#1ad9ff',
              es: { title: 'Mexicanos y Americanos', desc: 'No importa tu ciudadanía — podemos certificarte si eres ciudadano mexicano o americano.' },
              en: { title: 'Mexicans & Americans', desc: "Regardless of your citizenship — we can certify you whether you're Mexican or American." },
            },
            {
              icon: '🏛️', color: '#7B8AFF',
              es: { title: 'Continúa en la universidad', desc: 'Tu certificado te abre las puertas a universidades en México y USA. El siguiente paso es tuyo.' },
              en: { title: 'Continue at university', desc: 'Your certificate opens doors to universities in Mexico and the USA. The next step is yours.' },
            },
          ].map((b, i) => (
            <div className="benefit-card" key={i}>
              <div
                className="benefit-icon"
                style={{
                  background: `${b.color}1a`,
                  border: `1px solid ${b.color}33`,
                }}
              >
                {b.icon}
              </div>
              <div className="benefit-title">
                <span className="es">{b.es.title}</span>
                <span className="en">{b.en.title}</span>
              </div>
              <div className="benefit-desc">
                <span className="es">{b.es.desc}</span>
                <span className="en">{b.en.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── VALIDEZ ── */}
      <section style={{ padding: '90px 5%' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div className="tag-line">
            <span className="es">Validez Oficial</span>
            <span className="en">Official Validity</span>
          </div>
          <h2 className="sec-title">
            <span className="es">Un certificado,<br />dos países</span>
            <span className="en">One certificate,<br />two countries</span>
          </h2>
          <p className="sec-sub">
            <span className="es">Tu certificado de preparatoria tiene reconocimiento oficial tanto en México como en Estados Unidos.</span>
            <span className="en">Your high school diploma has official recognition in both Mexico and the United States.</span>
          </p>
        </div>

        <div className="validez-grid">
          <div className="validez-card mx">
            <div className="validez-flag">🇲🇽</div>
            <div className="validez-title">
              <span className="es">México</span>
              <span className="en">Mexico</span>
            </div>
            <ul className="validez-items">
              {[
                { es: 'Convenio con institución educativa oficial', en: 'Agreement with official educational institution' },
                { es: 'Certificado con validez SEP', en: 'SEP-valid certificate' },
                { es: 'Acceso a universidades mexicanas', en: 'Access to Mexican universities' },
                { es: 'Para ciudadanos mexicanos y residentes', en: 'For Mexican citizens and residents' },
              ].map((item, i) => (
                <li key={i}>
                  <span className="es">{item.es}</span>
                  <span className="en">{item.en}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="validez-card usa">
            <div className="validez-flag">🇺🇸</div>
            <div className="validez-title">USA</div>
            <ul className="validez-items">
              {[
                { es: 'Convenio con Innovative Online Academy', en: 'Agreement with Innovative Online Academy' },
                { es: 'Reconocido en California y más estados', en: 'Recognized in California and more states' },
                { es: 'Acceso a universidades americanas', en: 'Access to American universities' },
                { es: 'Para ciudadanos americanos e hispanos', en: 'For American and Hispanic citizens' },
              ].map((item, i) => (
                <li key={i}>
                  <span className="es">{item.es}</span>
                  <span className="en">{item.en}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section className="benefits" id="planes">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div className="tag-line">
            <span className="es">Planes y Precios</span>
            <span className="en">Plans &amp; Pricing</span>
          </div>
          <h2 className="sec-title">
            <span className="es">Elige tu camino</span>
            <span className="en">Choose your path</span>
          </h2>
          <p className="sec-sub" style={{ marginBottom: 0 }}>
            <span className="es">Dos programas. El mismo certificado. El mismo precio total.</span>
            <span className="en">Two programs. The same certificate. The same total price.</span>
          </p>
        </div>

        {/* nota central */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className="planes-note">
            <span style={{ fontSize: '1rem' }}>💡</span>
            <span className="es">Ambos planes incluyen el mismo certificado válido en MX y USA — solo cambia la velocidad</span>
            <span className="en">Both plans include the same certificate valid in MX and USA — only the speed differs</span>
          </div>
        </div>

        <div className="planes-grid">
          {/* Plan Regular */}
          <div className="plan-card regular">
            <div className="plan-badge">
              <span className="es">Programa Regular</span>
              <span className="en">Regular Program</span>
            </div>
            <div className="plan-name">
              <span className="es">Prepa en 6 Meses</span>
              <span className="en">Diploma in 6 Months</span>
            </div>
            <div className="plan-price">
              <span className="amount">$150</span>
              <span className="period"> USD/<span className="es">mes</span><span className="en">month</span></span>
            </div>
            <div className="plan-total">
              <span className="es">+ $50 inscripción · Total: <strong>$950 USD</strong></span>
              <span className="en">+ $50 enrollment · Total: <strong>$950 USD</strong></span>
            </div>
            <div className="plan-titulacion">
              <span className="es">Titulación al finalizar: $450 USD</span>
              <span className="en">Certification upon completion: $450 USD</span>
            </div>
            <ul className="plan-features">
              {[
                { es: '6 meses de acceso completo', en: '6 months full access' },
                { es: 'Estudia a tu ritmo', en: 'Study at your own pace' },
                { es: 'Sin examen final (por actividades)', en: 'No final exam (activity-based)' },
                { es: 'Plataforma bilingüe ES/EN', en: 'Bilingual platform ES/EN' },
                { es: 'Soporte por WhatsApp', en: 'WhatsApp support' },
                { es: 'Certificado válido MX + USA', en: 'Certificate valid MX + USA' },
              ].map((f, i) => (
                <li key={i}>
                  <span className="es">{f.es}</span>
                  <span className="en">{f.en}</span>
                </li>
              ))}
            </ul>
            <Link href="/register" className="btn-plan outline" onClick={handleRegisterClick}>
              <span className="es">Empezar ahora →</span>
              <span className="en">Start now →</span>
            </Link>
          </div>

          {/* Plan Express */}
          <div className="plan-card express" style={{ position: 'relative' }}>
            {/* Floating popular badge */}
            <div className="plan-popular-tag">
              <span className="es">🔥 Más popular</span>
              <span className="en">🔥 Most popular</span>
            </div>
            <div className="plan-badge">
              ⚡ <span className="es">Express</span>
              <span className="en">Express</span>
            </div>
            <div className="plan-name">
              <span className="es">Prepa en 3 Meses</span>
              <span className="en">Diploma in 3 Months</span>
            </div>
            <div className="plan-price">
              <span className="amount">$300</span>
              <span className="period"> USD/<span className="es">mes</span><span className="en">month</span></span>
            </div>
            <div className="plan-total">
              <span className="es">+ $50 inscripción · Total: <strong>$950 USD</strong></span>
              <span className="en">+ $50 enrollment · Total: <strong>$950 USD</strong></span>
            </div>
            <div className="plan-titulacion">
              <span className="es">Titulación al finalizar: $450 USD</span>
              <span className="en">Certification upon completion: $450 USD</span>
            </div>
            <ul className="plan-features">
              {[
                { es: '3 meses — terminas 3 meses antes', en: '3 months — finish 3 months sooner' },
                { es: 'Ritmo intensivo pero manejable', en: 'Intensive but manageable pace' },
                { es: 'Sin examen final (por actividades)', en: 'No final exam (activity-based)' },
                { es: 'Plataforma bilingüe ES/EN', en: 'Bilingual platform ES/EN' },
                { es: 'Soporte prioritario por WhatsApp', en: 'Priority WhatsApp support' },
                { es: 'Certificado válido MX + USA', en: 'Certificate valid MX + USA' },
              ].map((f, i) => (
                <li key={i}>
                  <span className="es">{f.es}</span>
                  <span className="en">{f.en}</span>
                </li>
              ))}
            </ul>
            <Link href="/register" className="btn-plan" onClick={handleRegisterClick}>
              <span className="es">Empezar Express →</span>
              <span className="en">Start Express →</span>
            </Link>
          </div>
        </div>

        {/* Facturación trust */}
        <div className="billing-trust">
          <span>🧾</span>
          <span className="es">Empresa legalmente constituida en México · Emitimos facturas (CFDI)</span>
          <span className="en">Legally registered company in Mexico · We issue invoices (CFDI)</span>
        </div>
        <p className="billing-hint">
          <span className="es">¿Necesitas factura? Solicítala al momento de tu pago.</span>
          <span className="en">Need an invoice? Request it at the time of your payment.</span>
        </p>
      </section>

      {/* ── CERTIFICADO ── */}
      <section className="cert-section">
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div className="tag-line">
            <span className="es">Validez Internacional</span>
            <span className="en">International Validity</span>
          </div>
          <h2 className="sec-title">
            <span className="es">Tu certificado vale en México 🇲🇽 y USA 🇺🇸</span>
            <span className="en">Your certificate is valid in Mexico 🇲🇽 and the USA 🇺🇸</span>
          </h2>
          <p className="sec-sub">
            <span className="es">Al terminar recibes DOS documentos oficiales</span>
            <span className="en">Upon completion you receive TWO official documents</span>
          </p>
        </div>

        <div className="cert-grid">
          {/* Tarjeta USA */}
          <div className="cert-card">
            <div
              className="cert-img-wrap"
              style={{ cursor: 'pointer' }}
              onClick={() => setLightbox({ src: '/images/certiusa.jpeg', alt: 'High School Transcript - Innovative Online Academy' })}
            >
              <Image
                src="/images/certiusa.jpeg"
                alt="High School Transcript - Innovative Online Academy"
                fill
                style={{ objectFit: 'contain', padding: '12px' }}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="cert-card-body">
              <div className="cert-badge cert-badge-usa">
                🎓{' '}
                <span className="es">EMITIDO EN CALIFORNIA, USA</span>
                <span className="en">ISSUED IN CALIFORNIA, USA</span>
              </div>
              <div className="cert-card-title">
                <span className="es">Transcript Oficial de High School</span>
                <span className="en">Official High School Transcript</span>
              </div>
              <p className="cert-card-desc">
                <span className="es">Emitido por Innovative Online Academy, registrada ante el California Department of Education (CDS CODE: 37684116171458)</span>
                <span className="en">Issued by Innovative Online Academy, registered with the California Department of Education (CDS CODE: 37684116171458)</span>
              </p>
            </div>
          </div>

          {/* Tarjeta México */}
          <div className="cert-card">
            <div
              className="cert-img-wrap"
              style={{ cursor: 'pointer' }}
              onClick={() => setLightbox({ src: '/images/ValidacionMEXICO.jpeg', alt: 'Revalidación oficial SEP México' })}
            >
              <Image
                src="/images/ValidacionMEXICO.jpeg"
                alt="Revalidación oficial SEP México"
                fill
                style={{ objectFit: 'contain', padding: '12px' }}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="cert-card-body">
              <div className="cert-badge cert-badge-mx">
                ✅{' '}
                <span className="es">VALIDADO POR LA SEP MÉXICO</span>
                <span className="en">VALIDATED BY SEP MEXICO</span>
              </div>
              <div className="cert-card-title">
                <span className="es">Revalidación Oficial SEP</span>
                <span className="en">Official SEP Revalidation</span>
              </div>
              <p className="cert-card-desc">
                <span className="es">La SEP México revalida tu High School como Bachillerato General. Verificable públicamente en el portal SIGED de la SEP</span>
                <span className="en">SEP Mexico revalidates your High School as a General Baccalaureate. Publicly verifiable on the SEP SIGED portal</span>
              </p>
            </div>
          </div>
        </div>

        <p className="docs-note">
          <span className="es">Nosotros gestionamos ambos documentos por ti — sin filas, sin trámites. Al graduarte los recibes directamente.</span>
          <span className="en">We handle both documents for you — no lines, no paperwork. You receive them directly upon graduation.</span>
        </p>

        {/* Bloque de verificación */}
        <div className="cert-verify">
          <div className="cert-verify-title">
            <span className="es">🔍 Verifica tú mismo — es 100% real</span>
            <span className="en">🔍 Verify it yourself — it&apos;s 100% real</span>
          </div>
          <p className="cert-verify-text">
            <span className="es">Entra al portal oficial de la SEP y escribe el folio de validación. Los documentos de nuestros alumnos aparecen registrados oficialmente.</span>
            <span className="en">Go to the official SEP portal and enter the validation folio number. Our students&apos; documents appear officially registered.</span>
          </p>

          <p className="cert-folio-label">
            <span className="es">Folio de ejemplo verificable:</span>
            <span className="en">Example verifiable folio:</span>
          </p>
          <div className="cert-folio">CC9R3B3250002927</div>
          <p className="cert-folio-hint">
            <span className="es">Escribe este folio en el portal SEP y verás el documento real de una alumna de EDVEX</span>
            <span className="en">Enter this folio on the SEP portal and you&apos;ll see a real EDVEX student&apos;s document</span>
          </p>

          <a
            href="https://siged.sep.gob.mx/SIGED/revalidaciones.html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-verify"
          >
            <span className="es">Verificar en portal SEP →</span>
            <span className="en">Verify on SEP portal →</span>
          </a>
        </div>
      </section>

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div className="lb-overlay" onClick={() => setLightbox(null)}>
          <button className="lb-close" onClick={() => setLightbox(null)}>✕</button>
          <div className="lb-img-wrap" onClick={e => e.stopPropagation()}>
            <Image
              src={lightbox.src}
              alt={lightbox.alt}
              fill
              style={{ objectFit: 'contain' }}
              sizes="100vw"
            />
          </div>
        </div>
      )}

      {/* ── PARA QUIÉN ── */}
      <section>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div className="tag-line">
            <span className="es">¿Es para mí?</span>
            <span className="en">Is this for me?</span>
          </div>
          <h2 className="sec-title">
            <span className="es">Diseñado para personas<br />como tú</span>
            <span className="en">Designed for people<br />like you</span>
          </h2>
        </div>

        <div className="quien-grid">
          {[
            { icon: '👷', es: { title: 'Trabajadores', desc: 'Que no pueden ir a la escuela por su horario de trabajo.' }, en: { title: 'Workers', desc: "Who can't attend school due to their work schedule." } },
            { icon: '👨‍👩‍👧', es: { title: 'Padres de familia', desc: 'Que dejaron la prepa y quieren terminarla sin dejar su hogar.' }, en: { title: 'Parents', desc: 'Who left school and want to finish without leaving home.' } },
            { icon: '🌎', es: { title: 'Hispanos en USA', desc: 'Ciudadanos americanos o residentes que necesitan su diploma.' }, en: { title: 'Hispanics in the USA', desc: 'American citizens or residents who need their diploma.' } },
            { icon: '🏠', es: { title: 'Zona fronteriza', desc: 'Personas en ciudades fronterizas que quieren un certificado binacional.' }, en: { title: 'Border region', desc: 'People in border cities who want a binational certificate.' } },
            { icon: '📈', es: { title: 'Quienes buscan ascender', desc: 'Que necesitan su prepa para acceder a mejores empleos o la universidad.' }, en: { title: 'Career advancers', desc: 'Who need their diploma for better jobs or university access.' } },
            { icon: '⏰', es: { title: 'Los que no tienen tiempo', desc: '3 o 6 meses desde tu celular — el tiempo que tengas es suficiente.' }, en: { title: 'Busy people', desc: '3 or 6 months from your phone — whatever time you have is enough.' } },
          ].map((q, i) => (
            <div className="quien-card" key={i}>
              <div className="quien-icon">{q.icon}</div>
              <div className="quien-text">
                <strong>
                  <span className="es">{q.es.title}</span>
                  <span className="en">{q.en.title}</span>
                </strong>
                <span className="es">{q.es.desc}</span>
                <span className="en">{q.en.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROCESO ── */}
      <section className="proceso" id="como-empezar">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <div className="tag-line">
            <span className="es">Cómo empezar</span>
            <span className="en">How to start</span>
          </div>
          <h2 className="sec-title">
            <span className="es">3 pasos y ya estás adentro</span>
            <span className="en">3 steps and you&apos;re in</span>
          </h2>
          <p className="sec-sub">
            <span className="es">Sin filas, sin trámites complicados. Todo desde tu celular.</span>
            <span className="en">No lines, no complicated paperwork. Everything from your phone.</span>
          </p>
        </div>

        <div className="proceso-steps">
          {[
            {
              num: '01',
              icon: '🙋',
              es: { title: 'Crea tu cuenta gratis', desc: 'Regístrate en menos de 2 minutos. Sin tarjeta de crédito. Tu cuenta queda lista al instante.' },
              en: { title: 'Create your free account', desc: 'Register in under 2 minutes. No credit card required. Your account is ready instantly.' },
            },
            {
              num: '02',
              icon: '💳',
              es: { title: 'Paga tu inscripción', desc: '$50 USD únicos para activar tu acceso al programa completo. Pago seguro en línea.' },
              en: { title: 'Pay your enrollment', desc: '$50 USD one-time to activate full program access. Secure online payment.' },
            },
            {
              num: '03',
              icon: '🎉',
              es: { title: 'Control Escolar te contacta', desc: 'Nuestro equipo te da la bienvenida por WhatsApp, te pide tus documentos y ¡empiezas a estudiar!' },
              en: { title: 'School Admin contacts you', desc: 'Our team welcomes you via WhatsApp, requests your documents, and you start studying!' },
            },
          ].map((s, i) => (
            <div className="step" key={i}>
              <div className="step-bubble">
                <span className="step-bubble-num">{s.num}</span>
                <span className="step-bubble-icon">{s.icon}</span>
              </div>
              <div className="step-title">
                <span className="es">{s.es.title}</span>
                <span className="en">{s.en.title}</span>
              </div>
              <div className="step-desc">
                <span className="es">{s.es.desc}</span>
                <span className="en">{s.en.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA debajo de los pasos */}
        <div className="proceso-cta">
          <Link
            href="/register"
            className="btn-wa"
            style={{ background: 'linear-gradient(135deg, #0044ee 0%, #1ad9ff 100%)', gap: '10px' }}
            onClick={handleRegisterClick}
          >
            <span className="es">Crear mi cuenta gratis →</span>
            <span className="en">Create my free account →</span>
          </Link>

          <div className="proceso-divider">
            <span className="es">— o si prefieres —</span>
            <span className="en">— or if you prefer —</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <a
              href={CAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cal"
              onClick={handleCalClick}
            >
              <span className="es">📅 Agendar videollamada con un asesor (30 min gratis)</span>
              <span className="en">📅 Schedule a call with an advisor (30 min free)</span>
            </a>
            <p className="proceso-cta-hint">
              <span className="es">Resuelve tus dudas antes de inscribirte — sin compromiso</span>
              <span className="en">Resolve your questions before enrolling — no commitment</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="faq-section">
        <div className="tag-line">
          <span className="es">Dudas comunes</span>
          <span className="en">Common Questions</span>
        </div>
        <h2 className="sec-title">
          <span className="es">Preguntas frecuentes</span>
          <span className="en">Frequently Asked Questions</span>
        </h2>
        <div className="faq-list">
          {([
            {
              q: { es: '¿El certificado es válido en México?', en: 'Is the certificate valid in Mexico?' },
              a: {
                es: 'Sí. Recibes un Transcript Oficial de High School emitido en California, USA, y la SEP México lo revalida como Bachillerato General. Puedes verificarlo en el portal SIGED de la SEP con el folio de tu documento.',
                en: 'Yes. You receive an Official High School Transcript issued in California, USA, and SEP Mexico revalidates it as a General Baccalaureate. You can verify it on the SEP SIGED portal using your document folio.',
              },
            },
            {
              q: { es: '¿Cuánto tiempo al día necesito dedicarle?', en: 'How much time per day do I need?' },
              a: {
                es: 'Con 1 a 2 horas diarias es suficiente. El plan de 6 meses es ideal si trabajas o tienes familia. El plan de 3 meses es más intensivo pero manejable si tienes más disponibilidad.',
                en: '1 to 2 hours a day is enough. The 6-month plan is ideal if you work or have a family. The 3-month plan is more intensive but manageable if you have more availability.',
              },
            },
            {
              q: { es: '¿Puedo trabajar y estudiar al mismo tiempo?', en: 'Can I work and study at the same time?' },
              a: {
                es: 'Sí, está diseñado para eso. Estudias a tu ritmo, sin horarios fijos. Puedes avanzar de noche, fines de semana o en los momentos que tengas disponibles.',
                en: "Yes, it's designed for that. You study at your own pace, with no fixed schedules. You can progress at night, on weekends, or whenever you have time.",
              },
            },
            {
              q: { es: '¿Qué pasa si me atraso en mis estudios?', en: 'What happens if I fall behind in my studies?' },
              a: {
                es: 'No te preocupes. Control Escolar te contacta por WhatsApp para apoyarte. No hay penalizaciones por avanzar más despacio — lo importante es que termines.',
                en: "Don't worry. Student Services will contact you via WhatsApp to support you. There are no penalties for going slower — what matters is that you finish.",
              },
            },
            {
              q: { es: '¿Puedo ver la plataforma antes de pagar?', en: 'Can I see the platform before paying?' },
              a: {
                es: 'Sí. Crea tu cuenta gratis, entra a la plataforma y explora el contenido. Solo necesitas pagar la inscripción ($50 USD) para desbloquear tu acceso completo y que Control Escolar te asigne tu generación.',
                en: 'Yes. Create your free account, log in, and explore the platform. You only need to pay the enrollment fee ($50 USD) to unlock full access and have Student Services assign you to your generation.',
              },
            },
            {
              q: { es: '¿Emiten facturas?', en: 'Do you issue invoices?' },
              a: {
                es: 'Sí, somos una empresa legalmente constituida en México y emitimos CFDI. Solicita tu factura al momento de realizar tu pago.',
                en: 'Yes, we are a legally registered company in Mexico and issue CFDI invoices. Request yours at the time of payment.',
              },
            },
          ] as Array<{ q: { es: string; en: string }; a: { es: string; en: string } }>).map((item, i) => (
            <div key={i} className={`faq-item${openFaq === i ? ' open' : ''}`}>
              <button
                className="faq-q"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                <span className="faq-q-text">
                  <span className="es">{item.q.es}</span>
                  <span className="en">{item.q.en}</span>
                </span>
                <span className="faq-chevron" aria-hidden="true">›</span>
              </button>
              <div className="faq-a" style={{ '--faq-h': openFaq === i ? '1' : '0' } as React.CSSProperties}>
                <div className="faq-a-inner">
                  <span className="es">{item.a.es}</span>
                  <span className="en">{item.a.en}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── URGENCIA EVERGREEN ── */}
      <div className="urgency-bar">
        <p className="urgency-main">
          <span className="es">⚡ Cupo limitado · Solo 20 alumnos por generación</span>
          <span className="en">⚡ Limited spots · Only 20 students per generation</span>
        </p>
        <p className="urgency-sub">
          <span className="es">Asegura tu lugar hoy — los accesos se abren por orden de registro</span>
          <span className="en">Secure your spot today — access opens in registration order</span>
        </p>
      </div>

      {/* ── CTA FINAL ── */}
      <section className="cta-final">
        {/* Social proof row */}
        <div className="cta-proof">
          {[
            { icon: '🇲🇽', es: 'México', en: 'Mexico' },
            { icon: '🇺🇸', es: 'USA', en: 'USA' },
            { icon: '🎓', es: 'Certificado válido', en: 'Valid certificate' },
            { icon: '⚡', es: 'Desde $150 USD/mes', en: 'From $150 USD/month' },
            { icon: '✅', es: 'Sin examen final', en: 'No final exam' },
          ].map((item, i) => (
            <div className="cta-proof-item" key={i}>
              <span>{item.icon}</span>
              <span className="es">{item.es}</span>
              <span className="en">{item.en}</span>
            </div>
          ))}
        </div>

        <div className="tag-line" style={{ marginTop: '48px' }}>
          <span className="es">¿Listo para empezar?</span>
          <span className="en">Ready to start?</span>
        </div>
        <h2 className="sec-title" style={{ marginTop: '16px' }}>
          <span className="es">Tu prepa te espera.<br />Solo falta el primer paso.</span>
          <span className="en">Your diploma is waiting.<br />Just take the first step.</span>
        </h2>
        <p className="cta-final-sub">
          <span className="es">Personas en México y USA ya terminaron su prepa con nosotros. En 6 meses —o 3— puedes ser el siguiente.</span>
          <span className="en">People in Mexico and the USA have already completed their diploma with us. In 6 months — or 3 — you could be next.</span>
        </p>

        <div className="cta-final-btns">
          <Link
            href="/register"
            className="btn-wa"
            style={{ display: 'inline-flex', background: 'linear-gradient(135deg, #0044ee 0%, #1ad9ff 100%)' }}
            onClick={handleRegisterClick}
          >
            <span className="es">Crear mi cuenta gratis →</span>
            <span className="en">Create my free account →</span>
          </Link>
          <a
            href={CAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-cal"
            onClick={handleCalClick}
          >
            <span className="es">📅 Prefiero agendar una videollamada gratis</span>
            <span className="en">📅 I&apos;d rather schedule a free video call</span>
          </a>
        </div>

        <p className="cta-final-footnote">
          <span className="es">Sin tarjeta de crédito · Registro en 2 minutos · Cancela cuando quieras</span>
          <span className="en">No credit card · 2-minute signup · Cancel anytime</span>
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="billing-trust billing-trust--footer">
          <span>🧾</span>
          <span className="es">Empresa legalmente constituida en México · Emitimos facturas (CFDI)</span>
          <span className="en">Legally registered company in Mexico · We issue invoices (CFDI)</span>
        </div>
        <div className="footer-logo">
          <div style={{ width: 28, height: 28 }}>
            <LogoSvg id="fg" />
          </div>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '1rem',
            background: 'var(--grad)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>EDVEX Academy</span>
        </div>
        <p className="footer-text">
          edvexacademy.online ·{' '}
          <span className="es">Preparatoria · Secundaria · Diplomados</span>
          <span className="en">High School · Secondary · Diplomas</span>
        </p>
      </footer>


    </div>
  )
}
