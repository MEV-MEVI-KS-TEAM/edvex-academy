import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const body = await request.json()
    const { monto, metodo_pago, referencia } = body

    if (!monto || !metodo_pago) {
      return NextResponse.json({ error: 'Monto y método de pago son requeridos' }, { status: 400 })
    }

    // Validar el importe ANTES de llegar a la BD. Sin esto, un monto negativo o
    // no numérico viola el CHECK pagos_monto_no_negativo y el mensaje crudo de
    // Postgres —con el nombre de la tabla y de la constraint— acababa en el
    // navegador. Un dato malformado es un error del cliente (400), no del
    // servidor.
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      return NextResponse.json({ error: 'El monto debe ser un número mayor o igual a 0' }, { status: 400 })
    }

    // RPC atómica: SELECT FOR UPDATE + UPDATE + INSERT en una sola transacción.
    // Elimina el race condition (two admins simultáneos) y garantiza que si el
    // INSERT de pago falla, el UPDATE de meses_desbloqueados hace rollback.
    const admin = createAdminClient()
    const { data: nuevoMes, error: rpcError } = await admin.rpc('desbloquear_mes', {
      p_alumno_id:      params.id,
      p_monto:          montoNum,
      p_metodo_pago:    metodo_pago,
      p_referencia:     referencia ?? null,
      p_registrado_por: user.id,
    })

    if (rpcError) {
      // Se discrimina por ERRCODE y NO por el texto del mensaje. El match por
      // substring que había aquí funciona hoy, pero se rompe en silencio ante
      // cualquier retoque del literal en la BD —añadir una tilde a "válido",
      // reformular la frase— y el fallo se manifiesta como un 500 genérico que
      // nadie relaciona con la causa. El código es el contrato estable.
      // El match por texto se conserva como red por si un error llegara sin
      // code (p. ej. envuelto por PostgREST).
      const code = rpcError.code ?? ''
      const msg = rpcError.message ?? ''

      // P0001 — el alumno no existe.
      if (code === 'P0001' || msg.includes('Alumno no encontrado')) {
        return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })
      }

      // P0002 — tope alcanzado: ya tiene abiertos todos los meses de su plan.
      if (code === 'P0002' || msg.includes('ya tiene todos los meses')) {
        return NextResponse.json({ error: 'El alumno ya tiene todos los meses desbloqueados' }, { status: 400 })
      }

      // P0003 (desbloquear_mes v2b) — dos causas con el mismo remedio para el
      // admin: el alumno no tiene plan asignado, o su plan_estudio_id apunta a
      // un plan que ya no existe. Antes de v2b ambas se disfrazaban de "Alumno
      // no encontrado", así que el admin veía ese error sobre un alumno que
      // tenía delante en pantalla y no había forma de deducir que el arreglo
      // estaba a un clic en la ficha.
      // Es 400 y no 500: la petición es válida; lo que no lo es es el estado
      // del alumno, y quien lo puede corregir es quien está mirando la pantalla.
      if (
        code === 'P0003'
        || msg.includes('no tiene plan de estudios')
        || msg.includes('plan de estudios del alumno no es valido')
      ) {
        return NextResponse.json(
          { error: 'Asigna un plan de estudios al alumno antes de registrar un pago manual.' },
          { status: 400 },
        )
      }

      // El detalle va al log, NO al navegador: `msg` es el mensaje crudo de
      // Postgres y filtra nombres de tabla y de constraint. El resto de rutas
      // admin de EDVEX cierran con un texto genérico; esta era la excepcion.
      console.error('[POST /api/admin/alumnos/[id]/desbloquear-mes] rpc:', code, msg)
      return NextResponse.json({ error: 'No se pudo registrar el pago.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, meses_desbloqueados: nuevoMes })
  } catch (err) {
    // Sin binding, un fallo de createAdminClient() (env ausente) o un body JSON
    // malformado desaparecian sin rastro en los logs.
    console.error('[POST /api/admin/alumnos/[id]/desbloquear-mes]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
